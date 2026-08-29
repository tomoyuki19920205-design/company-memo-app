import assert from "node:assert/strict";
import test from "node:test";
import { filterNewsEvents, isSafeSourceUrl } from "../lib/news-filter";
import type { NewsEvent } from "../types/news";

const base: NewsEvent = { event_id:"1",ticker:"7203",company_name:"Toyota",headline:"Price increase",published_at:"2026-08-29T00:00:00Z",checked_at:"2026-08-29T01:00:00Z",source_type:"news",source_name:"Source",source_url:"https://example.com",category:"pricing",direction:"positive",importance:"high",earnings_relevance:"likely",summary:"Summary",why_it_matters:"Why",evidence_excerpt:null,temporal_status:"current",valid_until:null,tags:[],created_at:"2026-08-29T01:00:00Z" };
const rows = [base,{...base,event_id:"2",ticker:"6758",company_name:"Sony",direction:"negative" as const,importance:"low" as const,category:"demand",published_at:"2026-08-20T00:00:00Z"}];

test("ticker, direction, importance and date filters",()=>{assert.equal(filterNewsEvents(rows,{ticker:"7203"}).length,1);assert.equal(filterNewsEvents(rows,{direction:"negative"}).length,1);assert.equal(filterNewsEvents(rows,{importance:"high"}).length,1);assert.equal(filterNewsEvents(rows,{since:"2026-08-25T00:00:00Z"}).length,1);});
test("company search and empty state input",()=>{assert.equal(filterNewsEvents(rows,{search:"Toyota"}).length,1);assert.deepEqual(filterNewsEvents([],{}),[]);});
test("source link safety",()=>{assert.equal(isSafeSourceUrl("https://example.com"),true);assert.equal(isSafeSourceUrl("javascript:alert(1)"),false);});
test("company news filtering stays ticker-exact",()=>{assert.deepEqual(filterNewsEvents(rows,{ticker:"6758"}).map((row)=>row.event_id),["2"]);});
