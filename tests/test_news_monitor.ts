import assert from "node:assert/strict";
import test from "node:test";
import { filterNewsEvents, isNYMarketReport, isSafeSourceUrl, isSectorReport } from "../lib/news-filter";
import type { NewsEvent, NYMarketReportStreamItem, SectorReportStreamItem } from "../types/news";

const base: NewsEvent = { event_id:"1",ticker:"7203",company_name:"Toyota",headline:"Price increase",published_at:"2026-08-29T00:00:00Z",checked_at:"2026-08-29T01:00:00Z",source_type:"news",source_name:"Source",source_url:"https://example.com",category:"pricing",direction:"positive",importance:"high",earnings_relevance:"likely",summary:"Summary",why_it_matters:"Why",evidence_excerpt:null,temporal_status:"current",valid_until:null,tags:[],created_at:"2026-08-29T01:00:00Z" };
const rows = [base,{...base,event_id:"2",ticker:"6758",company_name:"Sony",direction:"negative" as const,importance:"low" as const,category:"demand",published_at:"2026-08-20T00:00:00Z"}];

test("ticker, direction, importance and date filters",()=>{assert.equal(filterNewsEvents(rows,{ticker:"7203"}).length,1);assert.equal(filterNewsEvents(rows,{direction:"negative"}).length,1);assert.equal(filterNewsEvents(rows,{importance:"high"}).length,1);assert.equal(filterNewsEvents(rows,{since:"2026-08-25T00:00:00Z"}).length,1);});
test("company search and empty state input",()=>{assert.equal(filterNewsEvents(rows,{search:"Toyota"}).length,1);assert.deepEqual(filterNewsEvents([],{}),[]);});
test("source link safety",()=>{assert.equal(isSafeSourceUrl("https://example.com"),true);assert.equal(isSafeSourceUrl("javascript:alert(1)"),false);});
test("company news filtering stays ticker-exact",()=>{assert.deepEqual(filterNewsEvents(rows,{ticker:"6758"}).map((row)=>row.event_id),["2"]);});
test("sector report is discriminated without changing company news",()=>{
    const sector: SectorReportStreamItem = {
        report_type:"sector_weekly",stream_id:"s1",title:"【東証33業種週次】電気・ガス業",sort_at:"2026-08-30T01:00:00+09:00",published_at:"2026-08-30T01:00:00+09:00",checked_at:"2026-08-30T01:00:00+09:00",created_at:"2026-08-30T01:00:00+09:00",ticker:null,company_name:null,sector_code:20,sector_name:"電気・ガス業",category:"sector_report",direction:"mixed",importance:"A+",importance_rank:1,earnings_relevance:null,summary:null,summary_bullets:["a","b","c"],why_it_matters:null,evidence_excerpt:null,temporal_status:null,valid_until:null,tags:[],source_type:null,source_name:null,source_url:null,period_start:"2026-08-22T06:00:00+09:00",period_end:"2026-08-29T05:59:59+09:00",full_report_md:"# report",watchlist_companies:[],next_week_watchpoints:[],missed_candidates:[],sources:[],report_date_jst:null,market_session_date:null,market_status:null,report_markdown:null,index_moves:null,sector_moves:null,notable_gainers:null,notable_losers:null,top_gainers_20:null,earnings:null,after_hours_earnings:null,major_news:null,commodities:null
    };
    assert.equal(isSectorReport(sector),true);
});

test("NY market report is a third discriminated content type",()=>{
    const ny = {
        report_type:"ny_market_daily",stream_id:"ny1",title:"【NY市場モーニング】2026/09/01",sort_at:"2026-09-01T07:05:00+09:00",published_at:"2026-09-01T07:05:00+09:00",checked_at:"2026-09-01T07:05:00+09:00",created_at:"2026-09-01T07:05:00+09:00",ticker:null,company_name:null,sector_code:null,sector_name:null,category:"ny_market_report",direction:"neutral",importance:"A",importance_rank:1,earnings_relevance:null,summary:null,summary_bullets:["a","b","c","d","e"],why_it_matters:null,evidence_excerpt:null,temporal_status:null,valid_until:null,tags:[],source_type:null,source_name:null,source_url:null,period_start:null,period_end:null,full_report_md:"# report",watchlist_companies:null,next_week_watchpoints:null,missed_candidates:null,sources:[],report_date_jst:"2026-09-01",market_session_date:"2026-08-31",market_status:"open",report_markdown:"# report",index_moves:{SOX:{change_pct:1}},sector_moves:[],notable_gainers:[],notable_losers:[],top_gainers_20:[],earnings:[],after_hours_earnings:[],major_news:[],commodities:[]
    } satisfies NYMarketReportStreamItem;
    assert.equal(isNYMarketReport(ny),true);
    assert.equal(isSectorReport(ny),false);
});
