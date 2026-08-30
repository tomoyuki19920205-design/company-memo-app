import assert from "node:assert/strict";
import test from "node:test";
import { filterNewsEvents, isSafeSourceUrl, isSectorReport } from "../lib/news-filter";
import type { NewsEvent, SectorReportStreamItem } from "../types/news";

const base: NewsEvent = { event_id:"1",ticker:"7203",company_name:"Toyota",headline:"Price increase",published_at:"2026-08-29T00:00:00Z",checked_at:"2026-08-29T01:00:00Z",source_type:"news",source_name:"Source",source_url:"https://example.com",category:"pricing",direction:"positive",importance:"high",earnings_relevance:"likely",summary:"Summary",why_it_matters:"Why",evidence_excerpt:null,temporal_status:"current",valid_until:null,tags:[],created_at:"2026-08-29T01:00:00Z" };
const rows = [base,{...base,event_id:"2",ticker:"6758",company_name:"Sony",direction:"negative" as const,importance:"low" as const,category:"demand",published_at:"2026-08-20T00:00:00Z"}];

test("ticker, direction, importance and date filters",()=>{assert.equal(filterNewsEvents(rows,{ticker:"7203"}).length,1);assert.equal(filterNewsEvents(rows,{direction:"negative"}).length,1);assert.equal(filterNewsEvents(rows,{importance:"high"}).length,1);assert.equal(filterNewsEvents(rows,{since:"2026-08-25T00:00:00Z"}).length,1);});
test("company search and empty state input",()=>{assert.equal(filterNewsEvents(rows,{search:"Toyota"}).length,1);assert.deepEqual(filterNewsEvents([],{}),[]);});
test("source link safety",()=>{assert.equal(isSafeSourceUrl("https://example.com"),true);assert.equal(isSafeSourceUrl("javascript:alert(1)"),false);});
test("company news filtering stays ticker-exact",()=>{assert.deepEqual(filterNewsEvents(rows,{ticker:"6758"}).map((row)=>row.event_id),["2"]);});
test("sector report is discriminated without changing company news",()=>{
    const sector: SectorReportStreamItem = {
        report_type:"sector_weekly",stream_id:"s1",title:"【東証33業種週次】電気・ガス業",sort_at:"2026-08-30T01:00:00+09:00",published_at:"2026-08-30T01:00:00+09:00",checked_at:"2026-08-30T01:00:00+09:00",created_at:"2026-08-30T01:00:00+09:00",ticker:null,company_name:null,sector_code:20,sector_name:"電気・ガス業",category:"sector_report",direction:"mixed",importance:"A+",importance_rank:1,earnings_relevance:null,summary:null,summary_bullets:["a","b","c"],why_it_matters:null,evidence_excerpt:null,temporal_status:null,valid_until:null,tags:[],source_type:null,source_name:null,source_url:null,period_start:"2026-08-22T06:00:00+09:00",period_end:"2026-08-29T05:59:59+09:00",full_report_md:"# report",watchlist_companies:[],next_week_watchpoints:[],missed_candidates:[],sources:[]
    };
    assert.equal(isSectorReport(sector),true);
});
