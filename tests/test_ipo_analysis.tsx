import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import IpoAnalysisPanel from "../components/tdnet-alerts/IpoAnalysisPanel";

test("IPO analysis panel exposes a non-mutating loading state", () => {
  const supabase = {} as never;
  const html = renderToStaticMarkup(<IpoAnalysisPanel eventId="event-id" supabase={supabase} />);
  assert.match(html, /IPO分析/);
  assert.match(html, /読み込み中/);
  assert.doesNotMatch(html, /既読にする/);
});

test("IPO cards alone mount the analysis panel", () => {
  const source = readFileSync(new URL("../components/tdnet-alerts/AlertDetailPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /\^新規上場\\s\+\[0-9A-Z\]\{4\}/);
  assert.match(source, /isIpoListing && <IpoAnalysisPanel/);
});

test("viewer hides completed-report operational metadata and supports copy/download", () => {
  const source = readFileSync(new URL("../components/tdnet-alerts/IpoAnalysisPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /全文コピー/);
  assert.match(source, /Markdown/);
  assert.match(source, /SectorReportMarkdown/);
  assert.doesNotMatch(source, /STATUS_LABELS/);
  assert.doesNotMatch(source, /ipo-analysis-meta/);
  assert.doesNotMatch(source, /最終更新|使用資料/);
});

test("report query reads only the report table and never read-state tables", () => {
  const source = readFileSync(new URL("../lib/tdnet-alerts/queries.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export async function fetchIpoAnalysisReport"), source.indexOf("// コメント操作"));
  assert.match(body, /\.from\("ipo_analysis_reports"\)/);
  assert.doesNotMatch(body, /tdnet_event_reads/);
  assert.doesNotMatch(body, /canonical_financials/);
});

test("event deep links open details without calling the read mutation", () => {
  const source = readFileSync(new URL("../components/tdnet-alerts/AlertsPage.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const eventId = new URLSearchParams");
  const body = source.slice(start, source.indexOf("}, [events]);", start));
  assert.match(body, /setSelectedId\(event\.id\)/);
  assert.doesNotMatch(body, /markAsRead/);
});
