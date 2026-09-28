import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NYMarketCardSummary, NYMarketDetail } from "../components/NewsMonitor";
import type { NYMarketReportStreamItem } from "../types/news";

function row(): NYMarketReportStreamItem {
    const longReport = "# NY市場モーニングレポート\n\n" + Array.from({ length: 250 }, (_, i) => `## Section ${i}\n本文 ${i}`).join("\n\n");
    return {
        report_type:"ny_market_daily",stream_id:"ny1",title:"【NY市場モーニング】2026/09/16",sort_at:"2026-09-16T09:34:00+09:00",published_at:"2026-09-16T09:34:00+09:00",checked_at:"2026-09-16T09:34:00+09:00",created_at:"2026-09-16T09:34:00+09:00",ticker:null,company_name:null,sector_code:null,sector_name:null,category:"ny_market_report",direction:"neutral",importance:"A",importance_rank:1,earnings_relevance:null,summary:null,summary_bullets:["原油高", "半導体高", "金利上昇", "消費鈍化", "決算注目", "credit"],why_it_matters:null,evidence_excerpt:null,temporal_status:null,valid_until:null,tags:[],source_type:null,source_name:null,source_url:null,period_start:null,period_end:null,full_report_md:longReport,watchlist_companies:null,next_week_watchpoints:null,missed_candidates:null,sources:[{title:"Source",publisher:"Publisher",url:"https://example.com/source",published_at:"2026-09-16"}],report_date_jst:"2026-09-16",market_session_date:"2026-09-15",market_status:"open",report_markdown:longReport,index_moves:{SOX:{change_pct:0.4},"S&P500":{change_pct:-0.45},Dow:{change_pct:-0.63},Nasdaq:{change_pct:-0.78},"Russell 2000":{change_pct:-0.76}},sector_moves:[],notable_gainers:[],notable_losers:[],top_gainers_20:[],earnings:[],after_hours_earnings:[],major_news:[],commodities:[]
    };
}

test("NY card shows five canonical indexes once in display order", () => {
    const html = renderToStaticMarkup(<NYMarketCardSummary row={row()} />);
    const values = ["S&amp;P -0.45%", "SOX +0.40%", "Dow -0.63%", "Nasdaq -0.78%", "Russell -0.76%"];
    for (const value of values) assert.equal(html.split(value).length - 1, 1);
    assert.equal((html.match(/<span>/g) ?? []).length, 5);
    for (let index = 1; index < values.length; index += 1) {
        assert.ok(html.indexOf(values[index - 1]) < html.indexOf(values[index]));
    }
    assert.equal((html.match(/<li>/g) ?? []).length, 6);
});

test("NY card omits a missing Nasdaq index without an empty chip", () => {
    const legacy = row();
    delete legacy.index_moves.Nasdaq;
    const html = renderToStaticMarkup(<NYMarketCardSummary row={legacy} />);
    assert.equal((html.match(/<span>/g) ?? []).length, 4);
    assert.doesNotMatch(html, /Nasdaq|undefined/);
    for (const value of ["S&amp;P -0.45%", "SOX +0.40%", "Dow -0.63%", "Russell -0.76%"]) assert.ok(html.includes(value));
});

test("NY card renders one Nasdaq chip when canonical and alias keys coexist", () => {
    const aliased = row();
    aliased.index_moves.NasdaqComposite = { change_pct: 9.99 };
    aliased.index_moves.IXIC = { change_pct: 8.88 };
    const html = renderToStaticMarkup(<NYMarketCardSummary row={aliased} />);
    assert.equal((html.match(/Nasdaq -0\.78%/g) ?? []).length, 1);
    assert.doesNotMatch(html, /9\.99|8\.88/);
    assert.equal((html.match(/<span>/g) ?? []).length, 5);
});

test("NY detail renders required metadata, full long markdown, and sources", () => {
    const html = renderToStaticMarkup(<NYMarketDetail row={row()} />);
    for (const label of ["作成日時", "レポート日 JST", "対象NY市場営業日", "市場状態", "2026/09/15", "Publisher"]) assert.match(html, new RegExp(label));
    assert.match(html, /Section 249/);
    assert.match(html, /href="https:\/\/example.com\/source"/);
});
