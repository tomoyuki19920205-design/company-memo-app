import assert from "node:assert/strict";
import test from "node:test";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadFinancialsBatch} from "../lib/financial-loader";

function clientFor(tables:Record<string,any[]>,calls:string[]) {
 return {from:(table:string)=>{
  let rows=tables[table]??[];
  const q:any={select:()=>q,order:()=>q,in:(key:string,values:any[])=>{rows=rows.filter(r=>values.includes(r[key]));return q;},
   eq:(key:string,value:any)=>{rows=rows.filter(r=>r[key]===value);return q;},
   range:(a:number,b:number)=>{calls.push(`${table}:${a}`);return Promise.resolve({data:rows.slice(a,b+1),error:null});}};
  return q;
 }} as unknown as SupabaseClient;
}
test("shared financial loader paginates without a 1000-row truncation or per-company query loop",async()=>{
 const actual=Array.from({length:1001},(_,i)=>({ticker:i%2?"1111":"2222",period:`${1000+i}-03-31`,quarter:"FY",sales:i,operating_profit:null,source:"jquants"}));
 const calls:string[]=[];
 const rows=await loadFinancialsBatch(clientFor({api_latest_financials_canonical:actual},calls),["1111","2222","1111"]);
 assert.equal(rows.get("1111")!.length+rows.get("2222")!.length,1001);
 assert.equal(calls.filter(c=>c.startsWith("api_latest_financials_canonical:")).length,3);
 assert.equal(calls.filter(c=>c.startsWith("api_latest_financials_canonical_forecast:")).length,1);
});
test("shared loader preserves actual, company forecast, and 1777-only SG&A behavior",async()=>{
 const row=(ticker:string)=>({ticker,period:"2026-03-31",quarter:"1Q",sales:100,operating_profit:10,sga:null,source:"jquants"});
 const calls:string[]=[];
 const result=await loadFinancialsBatch(clientFor({api_latest_financials_canonical:[row("1777"),row("1111")],
  canonical_financials:[{ticker:"1777",period:"2026-03-31",quarter:"1Q",metric:"selling_general_and_administrative_expenses",value:40,source:"official_pdf"}],
  api_latest_financials_canonical_forecast:[{...row("1111"),quarter:"FY",sales:999,source:"jquants_forecast_fy"}],
 },calls),["1777","1111"]);
 assert.equal(result.get("1777")![0].selling_general_and_administrative_expenses,40);
 assert.equal(result.get("1111")!.find(r=>r.quarter==="1Q")!.selling_general_and_administrative_expenses,null);
 assert.equal(result.get("1111")!.find(r=>r.source==="jquants_forecast_fy")!.sales,999);
});
