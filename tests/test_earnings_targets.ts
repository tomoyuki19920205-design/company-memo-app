import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {extractForecastTargets,forecastTargetsCsv,forecastTargetsFilename} from '../lib/earnings-targets';
import {mergeSchedules,applyIdentityReviews} from '../lib/earnings-schedules';
import type {CalendarSchedule,ForecastVersion,ScheduleCompany,ScheduleRegistry} from '../types/earnings-calendar';

const date='2026-12-04',target={fiscalYearEnd:'2027-03-31',quarter:2};
const schedule=(overrides:Partial<CalendarSchedule>={}):CalendarSchedule=>({code:'9008',companyName:'京王電鉄',date,status:'exchange',target,targetConfirmed:true,source:'https://www.jpx.co.jp/',updatedAt:'2026-11-18',...overrides});
const company=(overrides:Partial<ScheduleCompany>={}):ScheduleCompany=>({code:'9008',companyName:'京王電鉄',viewerMatch:'matched',viewerCode:'9008',viewerName:'京王電鉄',source:'https://www2.jpx.co.jp/tseHpFront/',listingStatus:'listed',...overrides});
const forecast=(overrides:Partial<ForecastVersion>={}):ForecastVersion=>({id:'test',code:'9008',companyName:'京王電鉄',announcementDate:date,target,asOf:'2026-11-17T17:09:00+09:00',version:'1',savedAt:'2026-11-17',quality:'条件付き',reviewExecuted:false,reviewPassed:false,valid:true,preAnnouncement:true,revenue:100,operatingProfit:10,revenueYoY:{rate:null,label:'',tone:'neutral',note:''},profitYoY:{rate:null,label:'',tone:'neutral',note:''},...overrides});
const extract=(s:CalendarSchedule[],f:ForecastVersion[]=[],c:ScheduleCompany[]=[company()])=>extractForecastTargets(date,s,f,c);

test('same fiscal year/quarter and both finite forecasts are required',()=>{
  for(const v of [forecast({target:{...target,quarter:1}}),forecast({target:{...target,fiscalYearEnd:'2026-03-31'}}),forecast({revenue:null}),forecast({operatingProfit:null}),forecast({revenue:NaN}),forecast({operatingProfit:Infinity}),forecast({valid:false})])assert.equal(extract([schedule()],[v]).count,1);
  assert.equal(extract([schedule()],[forecast()]).count,0);
  assert.equal(extract([schedule()],[forecast({revenue:0,operatingProfit:-1})]).forecasted,1);
});
test('review labels and changed announcement dates do not cause duplicates',()=>{
  for(const quality of ['要修正','検証未了','条件付き'])assert.equal(extract([schedule()],[forecast({quality,announcementDate:'2026-12-11',preAnnouncement:false})]).forecasted,1);
});
test('an incomplete new version does not erase a registered complete version',()=>{
  assert.equal(extract([schedule()],[forecast(),forecast({id:'new',revenue:null})]).count,0);
});
test('unknown fiscal year is review-required even when a guessed target or date matches',()=>{
  for(const row of [schedule({targetConfirmed:false,quarter:2}),schedule({target:null}),schedule({periodBasis:'fiscal_calendar_unverified'}),schedule({target:{...target,fiscalYearEnd:'2027-02-30'}})]) {
    const result=extract([row],[forecast()]);assert.equal(result.count,1);assert.equal(result.needsReview,1);
    assert.equal(result.candidates[0].fiscal_year,'');assert.equal(result.candidates[0].forecast_status,'照合要確認');
  }
  assert.equal(extract([schedule({targetConfirmed:false})]).candidates[0].fiscal_quarter,'');
  assert.equal(extract([schedule({targetConfirmed:false,quarter:2})]).candidates[0].fiscal_quarter,'2');
});
test('duplicate companies are collapsed, conflicting periods are excluded visibly',()=>{
  assert.equal(extract([schedule(),schedule()]).count,1);
  const result=extract([schedule(),schedule({target:{...target,quarter:3}})]);
  assert.equal(result.total,1);assert.equal(result.count,0);assert.match(result.excluded[0].reason,/競合/);
});
test('official issuer identity permits export despite financial mapping hold',()=>{
  const result=extract([schedule({financialLinkStatus:'hold'})],[],[company({viewerMatch:'different',viewerName:'別会社'})]);
  assert.equal(result.count,1);assert.equal(result.candidates[0].financial_link_status,'財務連動保留');
});
test('unverified, ambiguous, or mismatched issuer identity is excluded without removing calendar totals',()=>{
  for(const companies of [[],[company({companyName:'別会社'})],[company(),company()],[company({source:'https://jpx.co.jp.example.org'})],[company({listingStatus:'delisted'})]]) {
    const result=extract([schedule()],[],companies);assert.equal(result.total,1);assert.equal(result.count,0);assert.equal(result.excluded.length,1);
  }
});
test('provisional dates are labeled in CSV and counts even if already forecasted',()=>{
  const result=extract([schedule({status:'provisional'})]);assert.equal(result.provisional,1);assert.equal(result.scheduledProvisional,1);
  assert.equal(result.candidates[0].schedule_status,'暫定');assert.match(forecastTargetsCsv(result),/暫定/);
  const done=extract([schedule({status:'provisional'})],[forecast()]);assert.equal(done.count,0);assert.equal(done.scheduledProvisional,1);
});
test('alphanumeric and leading-zero codes remain strings; unsupported code forms are excluded',()=>{
  for(const code of ['436A','0010'])assert.equal(extract([schedule({code})],[],[company({code})]).candidates[0].code,code);
  assert.equal(extract([schedule({code:'43AA'})],[],[company({code:'43AA'})]).excluded.length,1);
});
test('CSV uses UTF-8 BOM, CRLF, quotes and formula defenses',()=>{
  const result=extract([schedule()]);
  result.candidates[0].company_name='テスト,"引用"\n改行';
  let csv=forecastTargetsCsv(result);assert.equal(csv.charCodeAt(0),0xfeff);assert.ok(csv.endsWith('\r\n'));assert.ok(csv.includes('"テスト,""引用""\n改行"'));
  for(const value of ['=1+1',' +cmd','\t@SUM(A1)','\r-2','\ufeff=HYPERLINK("bad")']) {
    result.candidates[0].company_name=value;csv=forecastTargetsCsv(result);assert.ok(csv.includes('"\''+value.replace(/"/g,'""')+'"'));
  }
});
test('date selection isolates all candidates and invalid dates/filenames are rejected',()=>{
  assert.equal(extract([schedule({date:'2026-12-05'})]).count,0);
  assert.equal(forecastTargetsFilename(date),'earnings_targets_2026-12-04.csv');
  for(const value of ['2026-02-30','2026-12-04\r\nbad','../2026-12-04'])assert.throws(()=>extractForecastTargets(value,[],[],[]));
});
test('legacy confirmed targets remain compatible, aliases alone cannot suppress candidates',()=>{
  assert.equal(extract([schedule({targetConfirmed:undefined})],[forecast()]).count,0);
  assert.equal(extract([schedule({codeAliases:['1111']})],[forecast({code:'1111'})]).count,1);
});
test('real registry: December 4 excludes exactly twelve forecasts and exports only Keio without an inferred fiscal year',async()=>{
  const read=async<T,>(name:string):Promise<T>=>JSON.parse(await readFile(`server-data/earnings-calendar/${name}.json`,'utf8'));
  const [registry,legacy,index]=await Promise.all([read<ScheduleRegistry>('registry'),read<CalendarSchedule[]>('schedules'),read<ForecastVersion[]>('index')]);
  const schedules=applyIdentityReviews(mergeSchedules(legacy,registry.schedules),registry);
  const result=extractForecastTargets(date,schedules,index,registry.companies??[]);
  assert.equal(result.total,13);assert.equal(result.forecasted,12);assert.equal(result.count,1);assert.equal(result.excluded.length,0);
  assert.deepEqual(result.candidates.map(c=>[c.code,c.company_name,c.fiscal_year]),[['9008','京王電鉄','']]);
  assert.deepEqual(result.forecastedCodes,['1873','2353','2910','3172','3662','3816','436A','4707','6040','6696','7265','9678']);
  const empty=extractForecastTargets('2026-12-05',schedules,index,registry.companies??[]);assert.equal(empty.count,0);
  const busy=extractForecastTargets('2026-11-13',schedules,index,registry.companies??[]);assert.equal(busy.total,769);assert.equal(busy.count,769);assert.equal(new Set(busy.candidates.map(c=>c.code)).size,769);
  const bare=extractForecastTargets(date,schedules,[],registry.companies??[]);assert.equal(bare.count,13);assert.equal(bare.provisional,1);assert.ok(bare.candidates.some(c=>c.code==='436A'));
});
