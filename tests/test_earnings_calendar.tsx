import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {growth,previousTarget,previousQuarter,latestForecast,sortCalendarRows,resizeCalendar,relevantVersions,yearBefore} from "../lib/earnings-calendar";
import {transformFinancialRows} from "../lib/financial-transform";
import EarningsReportMarkdown from "../components/EarningsReportMarkdown";
import TopNavigation from "../components/TopNavigation";
import type {ForecastVersion,CalendarRow} from "../types/earnings-calendar";

test("calendar growth keeps losses, zero and missing distinct",()=>{
  assert.equal(growth(120,100).rate,.2);
  assert.equal(growth(20,-10).label,"黒転");
  assert.equal(growth(-20,10).label,"赤転");
  assert.equal(growth(-5,-10).label,"赤縮");
  assert.equal(growth(-15,-10).label,"赤拡");
  assert.equal(growth(2,0).label,"—");
  assert.equal(growth(null,2).label,"—");
});
test("calendar target selects prior Q, including FY rollover",()=>{
  assert.deepEqual(previousTarget({fiscalYearEnd:"2027-07-31",quarter:1}),{fiscalYearEnd:"2026-07-31",quarter:4});
  assert.deepEqual(previousTarget({fiscalYearEnd:"2026-10-20",quarter:4}),{fiscalYearEnd:"2026-10-20",quarter:3});
  assert.equal(yearBefore("2025-02-28"),"2024-02-29");
  assert.equal(yearBefore("2024-02-29"),"2023-02-28");
});
const fixture=[
  {ticker:"1111",period:"2026-07-31",quarter:"FY",sales:1000,operating_profit:80},
  {ticker:"1111",period:"2026-07-31",quarter:"3Q",sales:700,operating_profit:50},
  {ticker:"1111",period:"2025-07-31",quarter:"FY",sales:800,operating_profit:60},
  {ticker:"1111",period:"2025-07-31",quarter:"3Q",sales:600,operating_profit:40},
].map(r=>({...r,gross_profit:null,source:"jquants",updated_at:""}));
const data=transformFinancialRows(fixture);
const meta=fixture.flatMap(r=>["sales","operating_profit"].map(metric=>({...r,metric,value:r[metric as "sales"|"operating_profit"],unit:"million_yen",accounting_scope:"consolidated",document_type:"JGAAP"})));
test("previous Q YoY uses standalone 300 vs 200, not FY 1000 vs 800",()=>{
  const p=previousQuarter(data,{fiscalYearEnd:"2027-07-31",quarter:1},"2026-12-04",null,meta);
  assert.equal(p.current?.revenue,300);assert.equal(p.previousYear?.revenue,200);
  assert.equal(p.revenueYoY.rate,.5);assert.equal(p.profitYoY.rate,.5);
});
test("unsafe units, scopes and absent Q comparisons are never filled",()=>{
  const target={fiscalYearEnd:"2027-07-31",quarter:1};
  const changed=meta.map((r,i)=>i===0?{...r,unit:"JPY"}:r);
  assert.equal(previousQuarter(data,target,"2026-12-04",null,changed).revenueYoY.label,"—");
  const scoped=meta.map((r,i)=>i===0?{...r,accounting_scope:"non_consolidated"}:r);
  assert.equal(previousQuarter(data,target,"2026-12-04",null,scoped).revenueYoY.label,"—");
  assert.equal(previousQuarter(data.slice(0,2),target,"2026-12-04",null,meta).revenueYoY.label,"—");
  assert.equal(previousQuarter(data,target,"2026-12-04").revenueYoY.label,"—");
});
test("calendar default version excludes later post-announcement analyses",()=>{
  const v=(id:string,asOf:string,preAnnouncement=true)=>({id,asOf,savedAt:asOf,valid:true,preAnnouncement,code:"1873",announcementDate:"2026-12-04",target:{fiscalYearEnd:"2027-04-30",quarter:2}} as ForecastVersion);
  const versions=[v("before","2026-11-17T17:09:00+09:00"),v("after","2026-12-05T17:09:00+09:00",false)];
  assert.equal(latestForecast(versions)?.id,"before");assert.equal(latestForecast([versions[1]]),null);
  assert.equal(relevantVersions(versions,"1873","2026-12-05").length,0);
});
test("reviewed scope change vetoes YoY without replacing the Viewer numbers",()=>{
 const p=previousQuarter(data,{fiscalYearEnd:"2027-07-31",quarter:1},"2026-12-04",null,meta,[
  {fiscalYearEnd:"2026-07-31",quarter:4,scope:"連結",accountingBasis:"日本基準",unit:"百万円",sourceIds:["S1"]},
  {fiscalYearEnd:"2025-07-31",quarter:4,scope:"単体",accountingBasis:"日本基準",unit:"百万円",sourceIds:["S2"]}]);
 assert.equal(p.revenueYoY.label,"—");assert.equal(p.current?.revenue,300);assert.equal(p.profitYoY.label,"—");
});
test("sort retains missing forecasts at end and preserves company tie order",()=>{
  const rows=[{code:"1112",forecast:null},{code:"1113",forecast:{revenueYoY:{rate:.2}}},{code:"1111",forecast:{revenueYoY:{rate:.1}}}] as CalendarRow[];
  assert.deepEqual(sortCalendarRows(rows,"forecastRevenue",false).map(r=>r.code),["1113","1111","1112"]);
  assert.deepEqual(sortCalendarRows(rows,"forecastRevenue",true).map(r=>r.code),["1111","1113","1112"]);
});
test("two splitters clamp neighbors without collapsing the third pane",()=>{
  const resized=resizeCalendar([.38,.34,.28],0,1);
  assert.equal(resized[2],.28);assert.ok(resized[1]>=.1699);assert.ok(Math.abs(resized.reduce((a,b)=>a+b)-1)<1e-9);
});
test("Markdown blocks raw HTML, script URLs, file links and tracking images",()=>{
  const html=renderToStaticMarkup(<EarningsReportMarkdown markdown={'# Report\n<script>alert(1)</script>\n\n[unsafe](javascript:alert) [local](file:///C:/secret) [source](https://example.com/ir)\n\n![tracker](https://example.com/pixel)\n\n|metric|value|\n|---|---|\n|sales|123|'}/>);
  assert.doesNotMatch(html,/<script|javascript:|file:\/\/|<img/);
  assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/ec-table-scroll/);assert.match(html,/123/);
});
test("all 12 real imported artifacts keep exact source rates and report text",()=>{
  const index=JSON.parse(readFileSync("server-data/earnings-calendar/index.json","utf8")) as ForecastVersion[];
  const schedule=JSON.parse(readFileSync("server-data/earnings-calendar/schedules.json","utf8"));
  const twelve=schedule.filter((r:any)=>r.date==="2026-12-04");assert.equal(twelve.length,12);
  assert.ok(twelve.every((r:any)=>r.status==="unconfirmed"));
  for(const v of index){
    const d=JSON.parse(readFileSync(`server-data/earnings-calendar/details/${v.id}.json`,"utf8"));
    assert.equal(v.revenue,d.result.scenarios.base.revenue);
    assert.equal(v.operatingProfit,d.result.scenarios.base.operating_profit);
    if(v.revenueYoY.rate!==null)assert.equal(v.revenueYoY.rate,d.result.comparisons.yoy.revenue.rate);
    if(v.profitYoY.rate!==null)assert.equal(v.profitYoY.rate,d.result.comparisons.yoy.operating_profit.rate);
    assert.ok(d.markdown.length>1000);assert.ok(d.reviewMarkdown.length>1000);assert.ok(v.reviewExecuted);
  }
});
test("calendar API authenticates before reading private forecasts",()=>{
  const route=readFileSync("app/api/earnings-calendar/route.ts","utf8");
  assert.ok(route.indexOf("auth.getUser()")<route.indexOf("const schedules=await readSchedules()"));
  assert.match(route,/401/);assert.match(route,/private, no-store/);
  assert.doesNotMatch(route,/SERVICE_ROLE|NODE_ENV|bypass/i);
});
test('schedule-only company ignores unsupported PL period labels without breaking the day',()=>{
 const malformed=[{...data[0],quarter:'TTM'}, {...data[0],period:'2026.07',quarter:'1Q'}];
 const p=previousQuarter([...data,...malformed],null,'2026-11-13',null,meta);
 assert.equal(p.target?.fiscalYearEnd,'2026-07-31');assert.equal(p.target?.quarter,4);
 assert.equal(p.current?.revenue,300);assert.ok(p.notes.some(n=>n.includes('除外')));
});
test("calendar navigation is last and uniquely active",()=>{
 const html=renderToStaticMarkup(<TopNavigation active="calendar"/>);
 assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
 assert.ok(html.indexOf('/earnings-calendar')>html.indexOf('/margin-interest'));
 const anchor=html.match(/<a[^>]*href="\/earnings-calendar"[^>]*>/)?.[0]??"";
 assert.match(anchor,/aria-current="page"/);
});
