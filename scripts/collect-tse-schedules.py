"""Free public TSE company-information service; no credentials or database writes.

Uses the service's published search forms (200 rows), one request/second and
content-addressed/checkpointed cache. Stops on 403/429; never bypasses access controls.
The general JPX download site's separate reuse restrictions do NOT grant permission
for its XLSX files; this collector uses only the company-information service.
"""
import argparse, hashlib, html, http.cookiejar, json, math, re, time, os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urljoin
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError
from html.parser import HTMLParser

BASE = 'https://www2.jpx.co.jp'
ENTRY = BASE + '/tseHpFront/JJK010010Action.do?Show=Show'
TERMS = 'https://www.jpx.co.jp/listing/co-search/01.html'
MARKETS = ['011','012','013','111','112','113']

class Form(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.inputs={}; self.action=''; self.feed(text)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='form' and not self.action: self.action=a.get('action','')
        if tag=='input' and a.get('type')=='hidden' and 'disabled' not in a:
            self.inputs[a.get('name','')]=a.get('value','')

def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', s))).strip()

def parse_list(text):
    f=Form(text); groups={}
    for k,v in f.inputs.items():
        m=re.fullmatch(r'ccJjCrpSelKekkLst_st\[(\d+)\]\.(\w+)',k)
        if m: groups.setdefault(int(m[1]),{})[m[2]]=v
    result=[]
    for r in groups.values():
        raw=r['eqMgrCd']; code=raw[:-1] if len(raw)==5 and raw[-1]=='0' else raw
        if not re.fullmatch(r'[0-9][0-9A-Z]{3}',code): raise ValueError('unexpected code '+raw)
        result.append({'code':code,'companyName':r['eqMgrNm'],'market':r['szkbuNm'],
                       'fiscalEndLabel':r.get('dspYuKssnKi'),'industry':r.get('gyshDspNm')})
    total=int(f.inputs.get('souKnsu','0'))
    if not result or not total: raise ValueError('search schema changed / access unavailable')
    return result,total

def parse_detail(text, code):
    # Read only the basic-information facts, not third-party disclosure documents.
    rows=[[(tag,clean(value)) for tag,value in re.findall(r'<(th|td)\b[^>]*>(.*?)</\1>',row,re.S)]
          for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>',text,re.S)]
    values={}
    for a,b in zip(rows,rows[1:]):
        if a and b and all(t=='th' for t,_ in a) and all(t=='td' for t,_ in b) and len(a)==len(b):
            values.update(zip([v for _,v in a],[v for _,v in b]))
    if values.get('コード') != code+'0' or '決算発表（予定）' not in values:
        raise ValueError('basic-information identity/schema mismatch '+code)
    dates=[]
    for q,key in [(4,'決算発表（予定）'),(1,'第一四半期（予定）'),(2,'第二四半期（予定）'),(3,'第三四半期（予定）')]:
        raw=values[key]
        if raw in ('','-','－'): continue
        if not re.fullmatch(r'\d{4}/\d{2}/\d{2}',raw): raise ValueError('unknown date notation: '+raw)
        dates.append({'date':raw.replace('/','-'),'quarter':q})
    return {'code':code,'fiscalEndLabel':values.get('決算期'),
            'listingDate':values.get('上場年月日','').replace('/','-') or None,'dates':dates}

class Collector:
    def __init__(self, cache, interval=1.0, offline=False, refresh=False, ttl_hours=24):
        self.cache=Path(cache); self.cache.mkdir(parents=True,exist_ok=True)
        self.interval=max(1.0,interval); self.last=0; self.offline=offline; self.refresh=refresh
        self.ttl_hours=ttl_hours
        self.opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def fetch(self,url,data=None):
        if self.offline: raise RuntimeError('offline cache miss')
        time.sleep(max(0,self.interval-(time.monotonic()-self.last)))
        self.last=time.monotonic()
        req=Request(url, data=urlencode(data,doseq=True).encode() if data else None,
                    headers={'User-Agent':'CompanyViewer-LocalScheduleImport/1.0 (public IR research; 1 request/second)'})
        for attempt in range(3):
            try:
                with self.opener.open(req,timeout=45) as response:
                    raw=response.read(12_000_000)
                    if len(raw)>=12_000_000: raise ValueError('response too large')
                    return raw.decode('utf-8')
            except HTTPError as e:
                if e.code not in (500,502,503,504) or attempt==2:raise
                time.sleep(2**(attempt+1));self.last=time.monotonic()
    def save(self,name,value):
        p=self.cache/name; tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8');tmp.replace(p)
    def load(self,name):
        p=self.cache/name
        return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None
    def fresh(self,record):
        return record and (self.offline or (not self.refresh and (datetime.now(timezone.utc)-datetime.fromisoformat(record['checkedAt'])).total_seconds()<self.ttl_hours*3600))
    def connect(self):
        entry=self.fetch(ENTRY); f=Form(entry)
        text=self.fetch(urljoin(BASE,f.action),{'ListShow':'ListShow','dspSsuPd':'200','szkbuChkbx':MARKETS})
        parse_list(text)
        self.form=Form(text);return text
    def master(self):
        prior=self.load('tse-master.json')
        if self.fresh(prior): return prior
        text=self.connect(); first,total=parse_list(text); records=first
        for page in range(2, math.ceil(total/200)+1):
            form=self.form
            fields={k:v for k,v in form.inputs.items() if not k.startswith('ccJjCrpSelKekkLst_st')}
            fields.update(Transition='Transition',lstDspPg=str(page))
            text=self.fetch(urljoin(BASE,form.action),fields)
            rows,n=parse_list(text)
            if n!=total: raise ValueError('universe changed while paginating; retry')
            records.extend(rows); self.form=Form(text)
        if len(records)!=total or len({x['code'] for x in records})!=total: raise ValueError('master incomplete/duplicate')
        out={'source':ENTRY,'terms':TERMS,'checkedAt':datetime.now(timezone.utc).isoformat(),'companies':records,'count':total}
        self.save('tse-master.json',out);return out
    def details(self, companies, limit=None):
        if not hasattr(self,'form') and not self.offline: self.connect()
        failures={r['code']:r for r in self.load('tse-failures.json') or []}; completed=0;consecutive=0
        for company in companies:
            code=company['code'];name='tse-'+code+'.json'
            if self.fresh(self.load(name)): continue
            if self.offline: continue
            if limit is not None and completed>=limit: break
            try:
                form=self.form
                fields={k:v for k,v in form.inputs.items() if not k.startswith('ccJjCrpSelKekkLst_st')}
                fields.update(BaseJh='BaseJh',mgrCd=code+'0',jjHisiFlg='1')
                text=self.fetch(urljoin(BASE,form.action),fields)
                facts=parse_detail(text,code)
                facts.update(checkedAt=datetime.now(timezone.utc).isoformat(),source=ENTRY,
                             sourceHash=hashlib.sha256(text.encode()).hexdigest(),sourcePublishedAt=None)
                self.save(name,facts);completed+=1;consecutive=0
                if failures.pop(code,None):self.save('tse-failures.json',list(failures.values()))
                if completed%25==0: print(json.dumps({'fetched':completed,'code':code}),flush=True)
            except HTTPError as e:
                failures[code]={'code':code,'error':str(e),'checkedAt':datetime.now(timezone.utc).isoformat()};consecutive+=1
                self.save('tse-failures.json',list(failures.values()))
                if e.code in (401,403,429): raise
            except Exception as e:
                failures[code]={'code':code,'error':str(e),'checkedAt':datetime.now(timezone.utc).isoformat()};consecutive+=1
                self.save('tse-failures.json',list(failures.values()))
            if consecutive>=5:break
        self.save('tse-failures.json',list(failures.values()))
        return completed,list(failures.values())

def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--limit',type=int)
    p.add_argument('--offline',action='store_true');p.add_argument('--refresh',action='store_true')
    p.add_argument('--codes',help='Optional comma-separated codes; otherwise all companies')
    p.add_argument('--ttl-hours',type=float,default=24)
    a=p.parse_args();c=Collector(a.cache,offline=a.offline,refresh=a.refresh,ttl_hours=a.ttl_hours)
    lock=c.cache/'collector.lock'
    with lock.open('x',encoding='utf8') as f:f.write(json.dumps({'pid':os.getpid(),'startedAt':datetime.now(timezone.utc).isoformat()}))
    try:return run(a,c)
    finally:lock.unlink()

def run(a,c):
    m=c.master()
    companies=m['companies']
    if a.codes:
        requested={x.strip().upper() for x in a.codes.split(',')}
        missing=requested-{r['code'] for r in companies}
        if missing:raise ValueError('codes absent from current master; check code or --refresh: '+','.join(sorted(missing)))
        companies=[r for r in companies if r['code'] in requested]
    else: companies=sorted(companies,key=lambda r:(r['code'] not in ['1873','2353','2910','3172','3662','3816','436A','4707','6040','6696','7265','9678'],r['code']))
    count,errors=c.details(companies,a.limit)
    print(json.dumps({'master':m['count'],'newDetails':count,'errors':errors},ensure_ascii=False))
    return 1 if errors else 0
if __name__=='__main__': raise SystemExit(main())
