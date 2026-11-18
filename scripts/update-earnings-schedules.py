"""Non-destructive schedule registry. Offline import; never writes forecasts or DBs.

See docs/calendar-schedules.md for normalized CSV/XLSX fields and the collector.
"""
import argparse, calendar, copy, csv, hashlib, importlib.util, json, os, re, unicodedata
from collections import Counter
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('legacy',ROOT/'scripts/import-earnings-calendar.py')
legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
atomic_json,read_json,day,target=legacy.atomic_json,legacy.read_json,legacy.day,legacy.target
STATES={'official_ir','exchange','provisional','unknown','changed','announced'}
OLD_STATES={'official':'official_ir','external':'provisional','unconfirmed':'provisional'}
RANK={'unknown':0,'provisional':1,'exchange':2,'official_ir':3,'announced':4}

def name_key(s):
    s=unicodedata.normalize('NFKC',s or '').casefold()
    return re.sub(r'[\s・.\-ー]','',s.replace('株式会社','').replace('(株)',''))

def retained_identity_review(company,prior):
    """A manual identity decision applies only to the exact reviewed pair."""
    review=(prior or {}).get('viewerIdentityReview')
    if review and all(review.get(k)==company.get(k) for k in ('code','companyName','viewerCode','viewerName')):
        return copy.deepcopy(review)
    return None

def identity(row):
    t=row.get('target')
    # Unknown periods are quarantined under an explicit unresolved identity.
    return f"{row['code']}:{t['fiscalYearEnd']}:Q{t['quarter']}" if t else f"{row['code']}:unresolved:Q{row.get('quarter','?')}"

def derive_target(label,q,announcement):
    """Calendar correspondence only, never claims the company confirmed the FY.

    Require a full month/day and a plausible (<=120d) reporting lag. Fiscal changes
    need manual explicit FY/Q. Dates themselves ALWAYS come from published facts.
    """
    m=re.fullmatch(r'(\d{1,2})月(\d{1,2}|末)日',label or '')
    if not m: return None
    month=int(m[1]);day_label=m[2];ann=date.fromisoformat(announcement);candidates=[]
    for y in range(ann.year-1,ann.year+2):
        try:
            d=calendar.monthrange(y,month)[1] if day_label=='末' else int(day_label)
            fy=date(y,month,d)
        except ValueError: continue
        absolute=y*12+month-1-3*(4-q);ey,em=divmod(absolute,12);em+=1
        end=date(ey,em,calendar.monthrange(ey,em)[1] if d==calendar.monthrange(y,month)[1] else min(d,calendar.monthrange(ey,em)[1]))
        if 0<=(ann-end).days<=120: candidates.append(target(fy.isoformat(),q))
    return candidates[0] if len(candidates)==1 else None

def normalize(row,now):
    code=unicodedata.normalize('NFKC',str(row.get('code',''))).upper().strip()
    if not legacy.CODE.fullmatch(code): raise ValueError('invalid code: '+code)
    d=str(row.get('announcement_date',row.get('date','')) or '').strip()
    if d: day(d)
    q=row.get('quarter');t=row.get('target')
    if not t and row.get('fiscal_year_end'): t=target(str(row['fiscal_year_end']),q)
    if t: t=target(t['fiscalYearEnd'],t['quarter']);q=t['quarter']
    if q not in (None,''): q=int(q)
    if q not in (None,1,2,3,4): raise ValueError('invalid quarter')
    state=OLD_STATES.get(row.get('status'),row.get('status','unknown'))
    if state not in STATES: raise ValueError('invalid status: '+str(state))
    evidence=row.get('confirmationStatus',row.get('confirmation_status',state))
    if state=='changed' and evidence not in RANK: raise ValueError('changed requires confirmation_status')
    source=str(row.get('source_url',row.get('source','')) or '')
    if evidence in ('official_ir','exchange','announced') and not source.startswith(('https://','http://')): raise ValueError('confirmed source URL required')
    if state not in ('unknown','changed') and not d: raise ValueError('dated status requires announcement_date')
    if state=='unknown' and d: raise ValueError('unknown date must be empty; use provisional for candidates')
    actual=str(row.get('actual_date',row.get('actualDate','')) or '')
    if actual: day(actual)
    if state=='announced' and not actual: raise ValueError('announced requires actual_date and source')
    today_jst=datetime.fromisoformat(now.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=9))).date().isoformat()
    if actual and actual>today_jst: raise ValueError('actual_date cannot be in the future')
    when=str(row.get('announcement_time',row.get('announcementTime','')) or '')
    if when and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',when): raise ValueError('invalid time')
    published=row.get('source_published_at',row.get('sourcePublishedAt')) or None
    if published:
        stamp=datetime.fromisoformat(published.replace('Z','+00:00'))
        if stamp.tzinfo is None: raise ValueError('source_published_at needs timezone')
        if stamp>datetime.fromisoformat(now.replace('Z','+00:00')): raise ValueError('future publication timestamp')
    return {'id':row.get('id') or '', 'code':code,'companyName':str(row.get('company_name',row.get('companyName',''))),
            'date':d,'announcementTime':when or None,'target':t,'quarter':q,
            'targetConfirmed':row.get('targetConfirmed',bool(t)), 'periodBasis':row.get('periodBasis','explicit' if t else 'unresolved'),
            'status':state,'confirmationStatus':evidence,'source':source,'checkedAt':row.get('checkedAt',now),
            'sourcePublishedAt':published,'updatedAt':now,'actualDate':actual or None,
            'codeAliases':row.get('codeAliases',row.get('aliases',[])),
            'sourceHash':row.get('sourceHash'),'note':str(row.get('note',''))}

BUSINESS=('code','companyName','date','announcementTime','target','status','confirmationStatus','actualDate','targetConfirmed','periodBasis','note')
def upsert(events,incoming,now,changes,issues):
    r=normalize(incoming,now); key=identity(r);r['id']=key;old=events.get(key)
    unresolved_key=f"{r['code']}:unresolved:Q{r.get('quarter','?')}"
    # Resolving a formerly unknown fiscal year must not leave a second event on
    # the same date. Do not infer a merge across different dates/unknown years.
    if not old and r['target'] and events.get(unresolved_key,{}).get('date')==r['date']:
        old=events[unresolved_key]
    if old:
        old_conf=old.get('confirmationStatus',old['status']);conf=r['confirmationStatus']
        # Publication time and retrieval time are different clocks. Comparing
        # yesterday's official publication against today's retrieval of an
        # undated exchange page would incorrectly reject a valid correction.
        both_published=old.get('sourcePublishedAt') and r.get('sourcePublishedAt')
        old_stamp=old.get('sourcePublishedAt') if both_published else old.get('checkedAt')
        new_stamp=r.get('sourcePublishedAt') if both_published else r.get('checkedAt')
        older=old_stamp and new_stamp and datetime.fromisoformat(new_stamp)<datetime.fromisoformat(old_stamp)
        if (older and RANK.get(old_conf,0)>=2) or RANK.get(conf,0)<RANK.get(old_conf,0):
            if r['date']!=old['date']: issues.append({'code':r['code'],'kind':'source_conflict','message':'older/lower-confidence date rejected','source':r['source']})
            return 'unchanged'
        if old['date']!=r['date']:
            r['status']='announced' if r['actualDate'] else 'changed'
        elif old['status']=='changed' and r['status']!='announced': r['status']='changed'
        r['firstRegisteredAt']=old.get('firstRegisteredAt',old['updatedAt'])
        r['previousRegisteredAt']=old.get('previousRegisteredAt')
        r['history']=copy.deepcopy(old.get('history',[]))
        if any(old.get(k)!=r.get(k) for k in BUSINESS):
            r['previousRegisteredAt']=old['updatedAt']
            before={k:old.get(k) for k in (*BUSINESS,'source','checkedAt','sourcePublishedAt','updatedAt')}
            r['history'].append({'changedAt':now,'before':before})
            changes.append({'id':key,'code':r['code'],'action':'changed','before':before,'after':{k:r.get(k) for k in BUSINESS}})
            result='changed'
        else: r['updatedAt']=old['updatedAt'];result='unchanged'
    else:
        r['firstRegisteredAt']=incoming.get('firstRegisteredAt',incoming.get('updatedAt',now));r['history']=[];result='added'
        r['previousRegisteredAt']=incoming.get('updatedAt')
        changes.append({'id':key,'code':r['code'],'action':'added','after':{k:r.get(k) for k in BUSINESS}})
    if old and old.get('id')==unresolved_key and key!=unresolved_key: events.pop(unresolved_key,None)
    events[key]=r;return result

def input_rows(file):
    p=Path(file)
    if p.suffix.lower()=='.csv': return legacy.csv_rows(p)
    if p.suffix.lower()!='.xlsx': raise ValueError('only CSV / XLSX supported')
    from openpyxl import load_workbook
    wb=load_workbook(p,read_only=True,data_only=False);sheet=wb.active
    values=list(sheet.values);wb.close()
    if not values: raise ValueError('empty workbook')
    headers=[str(v or '').strip() for v in values[0]]
    if len(set(headers))!=len(headers): raise ValueError('duplicate headers')
    rows=[]
    for row in values[1:]:
        if not any(v is not None for v in row): continue
        if any(isinstance(v,str) and v.startswith('=') for v in row): raise ValueError('formula cells are not schedule evidence')
        rows.append({k:(v.date().isoformat() if isinstance(v,datetime) else v) for k,v in zip(headers,row)})
    return rows

def csv_output(file,rows,fields):
    with file.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
        for row in rows:
            # Avoid spreadsheet formula execution in externally sourced text.
            w.writerow({k:("'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v) for k,v in row.items() if k in fields})

def update(cache,store,start,end,viewer=None,manual=(),master_updates=(),report=None,now=None):
    day(start);day(end)
    if start>end: raise ValueError('invalid period')
    now=now or datetime.now(timezone.utc).isoformat();cache=Path(cache);store=Path(store)
    store.mkdir(parents=True,exist_ok=True);lock=store/'import.lock'
    # Shared lock with legacy importer prevents concurrent schedule/forecast imports.
    with lock.open('x',encoding='utf-8') as f: f.write(json.dumps({'pid':os.getpid(),'startedAt':now}))
    try: return _update(cache,store,start,end,viewer,manual,master_updates,report,now)
    finally: lock.unlink()

def _update(cache,store,start,end,viewer,manual,master_updates,report,now):
    path=store/'registry.json';old=read_json(path) if path.exists() else {}
    master_snapshot=read_json(cache/'tse-master.json');master={};issues=[];changes=[]
    old_master={r['code']:r for r in old.get('companies',[])}
    for item in master_snapshot['companies']:
        code=item['code'];r={**item,'companyId':'tse:'+code,'aliases':[],'listingStatus':'listed',
            'listingDate':None,'delistingDate':None,'source':master_snapshot['source'],
            'checkedAt':master_snapshot['checkedAt'],'history':[]}
        prior=old_master.get(code)
        if prior:
            r={**prior,**r,'aliases':prior.get('aliases',[]),'history':prior.get('history',[])}
        master[code]=r
    # Missing from a new snapshot is NOT proof of delisting.
    for code,prior in old_master.items():
        if code not in master: master[code]={**prior,'listingStatus':'needs_confirmation'}
    overrides=old.get('masterOverrides',[])
    for file in master_updates:
        for row in input_rows(file):
            if row not in overrides: overrides.append(row)
    for row in overrides:
            code=str(row['code']);previous=str(row.get('previous_code') or code)
            if not legacy.CODE.fullmatch(code): raise ValueError('invalid master code')
            if not str(row.get('source_url','')).startswith('https://'): raise ValueError('master change evidence required')
            prior=master.get(previous) or master.get(code)
            r=copy.deepcopy(prior) if prior else {'companyId':'tse:'+code,'aliases':[],'history':[]}
            for field,source in [('companyName','company_name'),('market','market'),('fiscalEndLabel','fiscal_end_label'),('listingDate','listing_date'),('delistingDate','delisting_date'),('listingStatus','listing_status')]:
                if row.get(source): r[field]=str(row[source])
            r.update(code=code,source=row['source_url'],checkedAt=now)
            # Compare only the final resolved master to the previous import below.
            # Reapplying a persistent correction must not append the same history.
            saved=old_master.get(code) or old_master.get(previous)
            if saved: r['history']=copy.deepcopy(saved.get('history',[]))
            if previous!=code:
                r['aliases']=list(set(r['aliases']+[previous]));master.pop(previous,None)
            master[code]=r
    alias_map={alias:m['code'] for m in master.values() for alias in m.get('aliases',[])}
    events={}
    for row in old.get('schedules',[]):
        r=copy.deepcopy(row)
        if r['code'] in alias_map:
            newcode=alias_map[r['code']];r['codeAliases']=master[newcode]['aliases']
            r['history'].append({'changedAt':now,'before':{'code':r['code'],'companyName':r['companyName']}})
            r['code']=newcode;r['companyName']=master[newcode]['companyName']
        r['id']=identity(r);events[r['id']]=r
    legacy_rows=read_json(store/'schedules.json') if (store/'schedules.json').exists() else []
    for r in legacy_rows:
        r={**r,'code':alias_map.get(r['code'],r['code'])}
        key=identity(r)
        if key not in events: upsert(events,r,now,changes,issues)
        elif not events[key].get('previousRegisteredAt'): events[key]['previousRegisteredAt']=r.get('updatedAt')
    recorded_failures=read_json(cache/'tse-failures.json') if (cache/'tse-failures.json').exists() else []
    failures=[]
    for failure in recorded_failures:
        cached=cache/f"tse-{failure['code']}.json"
        # A successful checkpoint after a failure is authoritative even if the
        # collector was interrupted before writing its final error summary.
        if not cached.exists() or (failure.get('checkedAt') and read_json(cached)['checkedAt']<=failure['checkedAt']): failures.append(failure)
    failed={r['code'] for r in failures};facts_count=0
    for code,m in master.items():
        file=cache/f'tse-{code}.json'
        if not file.exists(): m['collectionStatus']='failed' if code in failed else 'not_checked';continue
        facts=read_json(file);facts_count+=1
        m.update(fiscalEndLabel=facts['fiscalEndLabel'],listingDate=facts['listingDate'],checkedAt=facts['checkedAt'],collectionStatus='checked')
        for item in facts['dates']:
            d=item['date'];q=item['quarter']
            prior_targets=[r['target'] for r in legacy_rows if r['code']==code and r.get('target',{}).get('quarter')==q and abs((date.fromisoformat(r['date'])-date.fromisoformat(d)).days)<120]
            t=prior_targets[0] if len(prior_targets)==1 else derive_target(facts['fiscalEndLabel'],q,d)
            row={**m,**facts,'date':d,'target':t,'quarter':q,'status':'exchange','targetConfirmed':bool(prior_targets),
                 'periodBasis':'existing_verified_target' if prior_targets else 'fiscal_calendar_unverified',
                 'note':'' if prior_targets else '発表日とQ表記は取引所届出。決算年は期末日との暦対応であり、決算期変更の有無・対象年は未照合。'}
            if not start<=d<=end and identity(row) not in events: continue
            upsert(events,row,now,changes,issues)
    for file in manual:
        try: rows=input_rows(file)
        except Exception as e:
            issues.append({'code':'','kind':'import_file_error','message':str(e),'source':str(file)});continue
        for line,row in enumerate(rows,2):
            try:
                code=str(row.get('code','')).upper()
                if code not in master: raise ValueError('master code missing (add with --master-updates)')
                if name_key(row.get('company_name'))!=name_key(master[code]['companyName']): raise ValueError('company name mismatch')
                upsert(events,row,now,changes,issues)
            except Exception as e: issues.append({'code':str(row.get('code','')),'kind':'import_error','message':f'{Path(file).name}:{line}: {e}','source':str(file)})
    # Migrate explicit code changes without losing event/forecast aliases.
    for m in master.values():
        for r in events.values():
            if r['code'] in m.get('aliases',[]):
                r['history'].append({'changedAt':now,'before':{'code':r['code'],'companyName':r['companyName']}})
                r['code']=m['code'];r['companyName']=m['companyName'];r['codeAliases']=m['aliases']
    viewers=read_json(Path(viewer))['companies'] if viewer else []
    exact={r['ticker_code']:r for r in viewers}
    # Five-character security codes ending in 0 are aliases; never create duplicate companies.
    for code,m in master.items():
        prior=old_master.get(code) or next((old_master[a] for a in m.get('aliases',[]) if a in old_master),None)
        if prior:
            diff={k:prior.get(k) for k in ('code','companyName','market','fiscalEndLabel','listingStatus','listingDate','delistingDate') if prior.get(k)!=m.get(k)}
            if diff: m['history']=[*m['history'],{'changedAt':now,'before':diff}]
        match=exact.get(code) or exact.get(code+'0')
        m['viewerMatch']='missing' if not match else 'matched' if name_key(match.get('name_ja'))==name_key(m['companyName']) else 'name_mismatch'
        m['viewerCode']=match['ticker_code'] if match else None
        m['viewerName']=match.get('name_ja') if match else None
        m['viewerDuplicateAlias']=code in exact and code+'0' in exact
        review=retained_identity_review(m,prior)
        if review: m['viewerIdentityReview']=review
    schedules=sorted(events.values(),key=lambda r:(r['date'],r['code'],r['id']))
    active=[r for r in schedules if r['date'] and start<=r['date']<=end]
    unique={r['code'] for r in active};confirmed={r['code'] for r in active if r.get('confirmationStatus') in ('exchange','official_ir','announced')}
    provisional={r['code'] for r in active if r.get('confirmationStatus')=='provisional'}-confirmed
    unresolved=[{**m,'reason':'request_failed' if m['code'] in failed else 'not_checked' if m.get('collectionStatus')=='not_checked' else 'no_published_date_in_period'} for m in master.values() if m['code'] not in confirmed]
    counts={d:len({r['code'] for r in active if r['date']==d}) for d in sorted({r['date'] for r in active})}
    stats={'master':len(master),'registeredCompanies':len(unique),'confirmedCompanies':len(confirmed),
           'officialIr':len({r['code'] for r in active if r.get('confirmationStatus')=='official_ir'}),
           'exchange':len({r['code'] for r in active if r.get('confirmationStatus')=='exchange'}),
           'provisional':len(provisional),'unknown':len(master)-len(confirmed),'withoutCandidate':len(master)-len(unique),
           'failed':len(failed),'checked':facts_count,'notChecked':sum(m.get('collectionStatus')=='not_checked' for m in master.values()),
           'changedCompanies':len({r['code'] for r in active if r['status']=='changed'}),
           'periodUnverified':sum(not r['targetConfirmed'] for r in active),'viewerMatches':dict(Counter(m['viewerMatch'] for m in master.values())),
           'viewerDuplicateAliases':sum(m['viewerDuplicateAlias'] for m in master.values())}
    result={'schemaVersion':2,'updatedAt':now,'period':{'from':start,'to':end},'masterAsOf':master_snapshot['checkedAt'],
            'masterOverrides':overrides,'coverage':'partial','coverageNote':'登録件数は確認できた予定のみ。未登録日は0社確認済みを意味しません。将来日程・対象決算年の未確認を含みます。',
            'stats':stats,'dailyCounts':counts,'companies':sorted(master.values(),key=lambda r:r['code']),
            'schedules':schedules,'unresolved':[{k:m.get(k) for k in ('code','companyName','reason','collectionStatus','checkedAt')} for m in unresolved],
            'issues':issues,'failures':failures,'sources':[{'url':master_snapshot['source'],'terms':master_snapshot['terms'],'checkedAt':master_snapshot['checkedAt'],'type':'exchange'}],
            'excludedCounts':read_json(cache/'excluded-counts.json') if (cache/'excluded-counts.json').exists() else None,
            'exclusionPolicy':{'markets':['TOKYO PRO Market'],'products':['ETF','ETN','REIT','infrastructure_fund','other_nonordinary'],
                               'reason':'通常の上場会社の四半期決算と制度・商品が異なるため、対象3市場の普通株から分離。件数は別途同サービスの検索で照合。'}}
    atomic_json(path,result)
    report=Path(report or store/'schedule-receipts');report.mkdir(parents=True,exist_ok=True)
    receipt={'runAt':now,'stats':stats,'changes':changes,'issues':issues,'counts':dict(Counter(c['action'] for c in changes)),
             'registrySha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    atomic_json(report/'last-run.json',receipt)
    atomic_json(report/('run-'+re.sub(r'[^0-9]','',now)+'.json'),receipt)
    csv_output(report/'daily-counts.csv',[{'date':d,'companies':n,'coverage':'partial'} for d,n in counts.items()],['date','companies','coverage'])
    csv_output(report/'unresolved-companies.csv',unresolved,['code','companyName','reason','collectionStatus','checkedAt'])
    csv_output(report/'company-master.csv',result['companies'],['code','companyName','market','fiscalEndLabel','listingStatus','listingDate','delistingDate','source','checkedAt','viewerMatch','viewerCode','viewerName','viewerDuplicateAlias'])
    csv_output(report/'master-mismatches.csv',[m for m in result['companies'] if m['viewerMatch']!='matched'],['code','companyName','viewerMatch','viewerCode','viewerName','source'])
    csv_output(report/'issues.csv',issues+[{**r,'kind':'fetch_error','message':r['error']} for r in failures],['code','kind','message','source'])
    csv_output(report/'schedules.csv',[{**r,'fiscal_year_end':(r['target'] or {}).get('fiscalYearEnd'),'quarter':r.get('quarter') or (r['target'] or {}).get('quarter')} for r in active],['code','companyName','date','fiscal_year_end','quarter','status','confirmationStatus','targetConfirmed','source','checkedAt','sourcePublishedAt','actualDate','note'])
    return receipt

def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--store',default=str(ROOT/'server-data/earnings-calendar'))
    p.add_argument('--from',dest='start',required=True);p.add_argument('--to',dest='end',required=True)
    p.add_argument('--viewer-master');p.add_argument('--manual',action='append',default=[]);p.add_argument('--master-updates',action='append',default=[]);p.add_argument('--report')
    a=p.parse_args();r=update(a.cache,a.store,a.start,a.end,a.viewer_master,a.manual,a.master_updates,a.report)
    print(json.dumps({'stats':r['stats'],'changes':r['counts'],'issues':len(r['issues'])},ensure_ascii=False))
    return 2 if any(i['kind'].startswith('import_') for i in r['issues']) else 0
if __name__=='__main__': raise SystemExit(main())
