import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSchedules,countMonth,daySchedules,applyIdentityReviews} from '../lib/earnings-schedules';
import {relevantVersions,latestForecast} from '../lib/earnings-calendar';
import type {CalendarSchedule,ForecastVersion,ScheduleRegistry,ScheduleCompany} from '../types/earnings-calendar';
const row=(code='436A',date='2026-12-04'):CalendarSchedule=>({code,companyName:'Company',date,status:'exchange',target:{fiscalYearEnd:'2027-04-30',quarter:2},source:'https://example.org',updatedAt:'2026-11-18'});
test('new schedules replace same company FY Q, preserving different quarters',()=>{
 const old=row(),next={...row('436A','2026-12-07'),status:'changed' as const};
 const rows=mergeSchedules([old],[next,{...next,target:{...next.target!,quarter:3}}]);
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.date==='2026-12-07'));
});
test('monthly counts use distinct companies and include unforecast companies only from observed days',()=>{
 const rows=[row(),row(),row('1111'),row('2222','2026-11-12'),{...row('3333'),date:''}];
 const counts=countMonth(rows,'2026-12');assert.equal(counts['2026-12-04'].count,2);
 assert.equal(counts['2026-12-04'].statuses.exchange,2);assert.equal(counts['2026-12-05'],undefined);
 assert.equal(daySchedules(rows,'2026-12-04').length,2);
});
test('moving an announcement date preserves period-linked pre-announcement forecast',()=>{
 const base={id:'old',code:'436A',announcementDate:'2026-12-04',target:row().target,asOf:'2026-11-17',savedAt:'2026-11-17',valid:true,preAnnouncement:true} as ForecastVersion;
 assert.equal(latestForecast(relevantVersions([base],'436A','2026-12-07',row().target))?.id,'old');
 assert.equal(relevantVersions([base],'436A','2026-12-07',{fiscalYearEnd:'2027-04-30',quarter:3}).length,0);
 assert.equal(latestForecast(relevantVersions([{...base,preAnnouncement:false}],'436A','2026-12-07',row().target)),null);
 const earlier=relevantVersions([base],'436A','2026-11-10',row().target);
 assert.equal(earlier.length,1);assert.equal(earlier[0].id,'old');assert.equal(latestForecast(earlier),null);
 assert.equal(latestForecast(relevantVersions([{...base,asOf:'2026-12-03T15:01:00Z'}],'436A','2026-12-04',row().target)),null);
});
test('explicit code-change alias replaces old row while preserving its separate forecast lookup',()=>{
 const rows=mergeSchedules([row('1111')],[{...row('436A'),codeAliases:['1111']}]);assert.equal(rows.length,1);assert.equal(rows[0].code,'436A');
});
test('5000 companies count without requiring a forecast or duplicating rows',()=>{
 const rows=Array.from({length:5000},(_,i)=>row(String(i)));assert.equal(countMonth(rows,'2026-12')['2026-12-04'].count,5000);
 assert.equal(daySchedules([...rows,...rows],'2026-12-04').length,5000);
});

test('unverified company identity retains its schedule/count but holds financial linkage',()=>{
 const company:ScheduleCompany={code:'436A',companyName:'Current',viewerMatch:'name_mismatch',viewerCode:'436A',viewerName:'Old'};
 const registry={companies:[company]};
 const held=applyIdentityReviews([row()],registry);
 assert.equal(held[0].financialLinkStatus,'hold');assert.equal(countMonth(held,'2026-12')['2026-12-04'].count,1);
 const review={...company,status:'verified' as const,reason:'Official rename',sourceUrls:['https://example.org/rename'],checkedAt:'2026-11-18'};
 assert.equal(applyIdentityReviews([row()],{companies:[{...company,viewerIdentityReview:review}]} )[0].financialLinkStatus,'verified');
 for(const changed of [{viewerCode:'9999'},{companyName:'Other'},{viewerName:'Another'}]){
  assert.equal(applyIdentityReviews([row()],{companies:[{...company,...changed,viewerIdentityReview:review}]} )[0].financialLinkStatus,'hold');
 }
 assert.equal(applyIdentityReviews([row()],{companies:[{...company,viewerIdentityReview:{...review,status:'hold'}}]} )[0].financialLinkStatus,'hold');
 assert.deepEqual(applyIdentityReviews([row()],null),[row()]);
});
