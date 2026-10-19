import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import ForecastReason from "../components/tdnet-alerts/ForecastReason";
import { getForecastReason } from "../lib/tdnet-alerts/forecast-reason";
import type { TdnetEvent } from "../lib/tdnet-alerts/types";

const source = "https://www.release.tdnet.info/inbs/140120261013549337.pdf";
const text = "① 原文の段落\n\n⚫ 箇条書き\n" + "長い原文の文章。\n".repeat(300) + "原文の末尾。";
const section = { heading: "(2) 修正理由", context: ["2027年2月期 通期 連結"], text, page_start: 1, page_end: 2 };
const event = (reason: unknown) => ({ pdf_url: source, source_url: source, raw_payload: { extracted: { revision_reason: reason } } }) as unknown as TdnetEvent;
const reason = { version: 1, status: "available", source_url: source, sections: [section] };

test("preserves exact wording, newlines, bullets and the end of a long reason", () => {
  const value=getForecastReason(event(reason));
  assert.equal(value.sections[0].text,text);
  const html=renderToStaticMarkup(<ForecastReason event={event(reason)} />);
  assert.ok(html.includes(text));
  assert.match(html,/業績修正の理由/);
  assert.match(html,/原文の末尾。/);
  assert.match(html,/#page=1/);
});
test("keeps the separate period and basis headings from the disclosure", () => {
  const second={...section,heading:"修正の理由",context:["2027年2月期 中間期 個別"],text:"別の対象期間の原文。"};
  const html=renderToStaticMarkup(<ForecastReason event={event({...reason,sections:[section,second]})} />);
  assert.match(html,/通期 連結/); assert.match(html,/中間期 個別/); assert.match(html,/別の対象期間の原文。/);
});
test("missing, malformed or foreign disclosure data shows the PDF fallback", () => {
  for (const input of [null,{...reason,source_url:"https://example.com/foreign.pdf"},{...reason,sections:[{...section,text:null}]}]) {
    const html=renderToStaticMarkup(<ForecastReason event={event(input)} />);
    assert.match(html,/修正理由を取得できませんでした/); assert.ok(html.includes(source));
    assert.ok(!html.includes("原文の末尾。"));
  }
});

test("a verified absence is distinct from extraction failure", () => {
  const notPresent = renderToStaticMarkup(<ForecastReason event={event({version:1,status:"not_present",source_url:source,sections:[]})} />);
  assert.match(notPresent,/原本PDFに業績修正理由の記載はありません/);
  assert.ok(notPresent.includes(source));
  const failed = renderToStaticMarkup(<ForecastReason event={event({version:1,status:"unavailable",source_url:source,sections:[]})} />);
  assert.match(failed,/修正理由を取得できませんでした/);
});
test("distinguishes missing source, failed extraction and unverified bounds", () => {
  for (const [status, wording] of [
    ["source_unavailable", "原本PDFを取得できていません"],
    ["extraction_failed", "原本PDFから修正理由を抽出できませんでした"],
    ["scope_unverified", "原本PDFの修正理由の範囲を確認中です"],
    ["environment_error", "PDF読み取り環境に異常があります"],
  ]) {
    const html=renderToStaticMarkup(<ForecastReason event={event({version:1,status,source_url:source,sections:[]})} />);
    assert.ok(html.includes(wording));
    assert.ok(html.includes(source));
  }
  const noUrl={...event(null),pdf_url:null,source_url:null,
    raw_payload:{extracted:{revision_reason:{version:1,status:"source_unavailable",source_url:"",sections:[]}}}} as unknown as TdnetEvent;
  const html=renderToStaticMarkup(<ForecastReason event={noUrl} />);
  assert.match(html,/原本PDFを特定・取得できていません/);
});
test("legacy string payloads work and arbitrary summaries are never used", () => {
  const e=event(reason); e.raw_payload=JSON.stringify(e.raw_payload) as never;
  assert.equal(getForecastReason(e).sections[0].text,text);
  assert.deepEqual(getForecastReason({...event(null),summary:"AI考察"}).sections,[]);
});
test("reason clicks and selection stay inside the expanded region", () => {
  const component=readFileSync("components/tdnet-alerts/ForecastReason.tsx","utf8");
  const page=readFileSync("components/tdnet-alerts/AlertsPage.tsx","utf8");
  assert.match(component,/onPointerDown=.*stopPropagation/);
  assert.match(component,/onClick=.*stopPropagation/);
  assert.ok(page.indexOf("<ForecastReason")>page.indexOf('className={`alert-card expanded'));
  const detail=readFileSync("components/tdnet-alerts/AlertDetailPanel.tsx","utf8");
  assert.match(detail,/<ForecastReason event=\{event\}/);
  assert.ok(!component.includes("fetch("));
});

test("actual October 13 notifications render the exact stored original through its last line", () => {
  const events=JSON.parse(readFileSync("tests/fixtures/forecast_reason_events.json","utf8")) as TdnetEvent[];
  for (const e of events) {
    const data=getForecastReason(e);
    const html=renderToStaticMarkup(<ForecastReason event={e} />);
    if (e.ticker === "2379") {
      assert.match(html,/修正理由を取得できませんでした/);
    } else {
      assert.ok(data.sections.length > 0);
      for (const s of data.sections) {
        const escaped=s.text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#x27;");
        assert.ok(html.includes(escaped),`${e.ticker}: original through its last line`);
      }
    }
  }
});
