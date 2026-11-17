/** Read-only integration check against the existing Viewer database. No AI calls. */
import {createClient} from "@supabase/supabase-js";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import FinancialsTable from "../components/FinancialsTable";
import {loadFinancialsBatch,loadFinancialProvenance} from "../lib/financial-loader";
import {previousQuarter,latestForecast,relevantVersions} from "../lib/earnings-calendar";
import {FORECAST_SOURCES} from "../lib/quarter-math";
import type {CalendarSchedule,ForecastVersion} from "../types/earnings-calendar";

async function main() {
 const date=process.argv[2];if(!date)throw new Error("date required (YYYY-MM-DD)");
 const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const schedules=JSON.parse(readFileSync("server-data/earnings-calendar/schedules.json","utf8")) as CalendarSchedule[];
 const versions=JSON.parse(readFileSync("server-data/earnings-calendar/index.json","utf8")) as ForecastVersion[];
 const contexts=JSON.parse(readFileSync("server-data/earnings-calendar/comparison-contexts.json","utf8"));
 const selected=schedules.filter(s=>s.date===date),codes=selected.map(s=>s.code);
 const data=await loadFinancialsBatch(supabase,codes);
 const from=`${Math.min(...selected.map(s=>Number(s.target?.fiscalYearEnd.slice(0,4)??date.slice(0,4))))-2}-01-01`;
 const meta=await loadFinancialProvenance(supabase,codes,from);
 const results=[];
 for(const s of selected){
  const financials=data.get(s.code)??[];
  const v=latestForecast(relevantVersions(versions,s.code,date,s.target));
  const p=previousQuarter(financials,s.target,date,null,meta,contexts[v?.id??""]??[]);
  const actual=financials.filter(r=>!FORECAST_SOURCES.has(r.source));
  // Independent arithmetic check against the cumulative Viewer records.
  const standalone=(period:string,q:number,metric:"sales"|"operating_profit")=>{
   const current=actual.find(r=>r.period===period&&r.quarter===(q===4?"FY":`${q}Q`));
   const preceding=actual.find(r=>r.period===period&&r.quarter===`${q-1}Q`);
   return current?.[metric]==null?null:q===1?current[metric]:preceding?.[metric]==null?null:current[metric]!-preceding[metric]!;
  };
  if(p.target){
   const period=p.target.fiscalYearEnd,q=p.target.quarter,prior=`${Number(period.slice(0,4))-1}${period.slice(4)}`;
   assert.equal(p.current?.revenue??null,standalone(period,q,"sales"));
   assert.equal(p.previousYear?.revenue??null,standalone(prior,q,"sales"));
   assert.equal(p.current?.operatingProfit??null,standalone(period,q,"operating_profit"));
   assert.equal(p.previousYear?.operatingProfit??null,standalone(prior,q,"operating_profit"));
  }
  const html=renderToStaticMarkup(<FinancialsTable data={financials} loading={false} segments={[]}/>);
  assert.ok(!financials.length||html.includes('data-table="standalone"'));
  if(v){const d=JSON.parse(readFileSync(`server-data/earnings-calendar/details/${v.id}.json`,"utf8"));
   assert.equal(v.revenue,d.result.scenarios.base.revenue);assert.equal(v.operatingProfit,d.result.scenarios.base.operating_profit);
   if(v.revenueYoY.rate!==null)assert.equal(v.revenueYoY.rate,d.result.comparisons.yoy.revenue.rate);
   if(v.profitYoY.rate!==null)assert.equal(v.profitYoY.rate,d.result.comparisons.yoy.operating_profit.rate);
  }
  results.push({code:s.code,name:s.companyName,status:s.status,previous:p,forecastRevenueYoY:v?.revenueYoY??null,
   forecastProfitYoY:v?.profitYoY??null,financialRows:financials.length,arithmeticMatched:true,componentRendered:true});
 }
 const dir=path.resolve("docs/validation");mkdirSync(dir,{recursive:true});
 writeFileSync(path.join(dir,`financial-check-${date}.json`),JSON.stringify({at:new Date().toISOString(),date,source:"api_latest_financials_canonical / existing Viewer",companies:results.length,results},null,2));
 console.log(JSON.stringify({companies:results.length,arithmeticMatched:results.filter(r=>r.arithmeticMatched).length,forecastMatches:results.filter(r=>r.forecastRevenueYoY).length,missingPrevious:results.filter(r=>r.previous.revenueYoY.label==="—").map(r=>r.code)},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
