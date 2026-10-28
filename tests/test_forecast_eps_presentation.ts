import assert from "node:assert/strict";
import test from "node:test";
import { getForecastEpsPresentation } from "../lib/tdnet-alerts/forecast-eps-presentation";
import { formatCardBody, formatCardSummary } from "../components/tdnet-alerts/AlertsPage";
import AlertDetailPanel from "../components/tdnet-alerts/AlertDetailPanel";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EnrichedEvent, TdnetEvent } from "../lib/tdnet-alerts/types";

const revision = (period: string, previous_eps: number | null, revised_eps: number | null) => ({
  fiscal_period: "2027年3月期", period, basis: "連結", previous_eps, revised_eps,
});
const event = (extracted: object, stringify = false) => ({
  raw_payload: (stringify ? JSON.stringify({ extracted }) : { extracted }) as TdnetEvent["raw_payload"],
});

test("two period EPS rows are labelled, ordered and identical for string JSON payloads", () => {
  const rows = [revision("FULL_YEAR", 59.92, 81.06), revision("2Q_CUMULATIVE", 12.34, 27.32)];
  for (const candidate of [rows, [...rows].reverse()]) {
    const output = getForecastEpsPresentation(event({ eps_revisions: candidate }, true));
    assert.equal(output.fiscalPeriod, "2027年3月期");
    assert.equal(output.lines[0], "2Q（累計） 連結 EPS：12.34円→27.32円 (+121.4%)");
    assert.equal(output.lines[1], "通期 連結 EPS：59.92円→81.06円 (+35.3%)");
  }
});

test("single period, unknown period, missing EPS and legacy payloads stay safe", () => {
  assert.equal(getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 81.06)] })).lines.length, 1);
  assert.equal(getForecastEpsPresentation(event({ eps_revisions: [revision("2Q_CUMULATIVE", 12.34, 27.32)] })).lines.length, 1);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 第2四半期" })).lines[0], /^期間不明/);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 2Q（累計）" })).lines[0], /^2Q（累計）/);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 中間期・通期" })).lines[0], /^期間不明/);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 59.92, revised_eps: 81.06, period_label: "2027年3月期 通期" })).lines[0], /^通期/);
  assert.match(getForecastEpsPresentation(event({ eps_revisions: [revision("2Q_STANDALONE", 12.34, 27.32)] })).lines[0], /^2Q（単独）/);
  assert.equal(getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, null)] })).lines.length, 0);
  assert.equal(getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 59.92)] })).lines.length, 0);
  assert.deepEqual(getForecastEpsPresentation({ raw_payload: "broken" as unknown as TdnetEvent["raw_payload"] }).lines, []);
});

test("the actual card formatters expose fiscal year and both EPS rows", () => {
  const extracted = { eps_revisions: [
    revision("2Q_CUMULATIVE", 12.34, 27.32),
    revision("FULL_YEAR", 59.92, 81.06),
  ] };
  const alert = {
    id: "4007a755-304d-4538-ae83-b6094520b357",
    event_type: "forecast", event_subtype: "upward",
    disclosed_at: "2026-10-28T05:00:00+00:00", detected_at: "2026-10-28T05:00:00+00:00",
    ticker: "7971", company_name: "東リ", raw_payload: JSON.stringify({ extracted }),
  } as unknown as EnrichedEvent;
  const summary = formatCardSummary(alert, { category: "forecast" } as never, "");
  assert.equal(summary.line2, "2027年3月期");
  assert.equal(summary.line3, "2Q（累計） 連結 EPS：12.34円→27.32円 (+121.4%)\n通期 連結 EPS：59.92円→81.06円 (+35.3%)");
  const body = formatCardBody(alert).text;
  assert.match(body, /2027年3月期\n2Q（累計）/);
  assert.match(body, /\n通期 連結 EPS：/);
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-key";
  (globalThis as { React?: typeof React }).React = React;
  const detail = renderToStaticMarkup(createElement(AlertDetailPanel, {
    event: { ...alert, formatted_message: "業績予想及び配当予想の修正" },
    userId: "test-user", onUpdate: () => {},
  }));
  assert.match(detail, /2Q（累計） 連結 EPS：12\.34円→27\.32円 \(\+121\.4%\)/);
  assert.match(detail, /通期 連結 EPS：59\.92円→81\.06円 \(\+35\.3%\)/);
  assert.doesNotMatch(detail, /修正前|修正後/);
  const legacyMessageDetail = renderToStaticMarkup(createElement(AlertDetailPanel, {
    event: { ...alert, formatted_message: "upward 2027年3月期 第2四半期", display_summary: "upward 2027年3月期 第2四半期", headline: "業績予想及び配当予想の修正に関するお知らせ" },
    userId: "test-user", onUpdate: () => {},
  }));
  assert.doesNotMatch(legacyMessageDetail, /upward 2027年3月期 第2四半期/);
  assert.match(legacyMessageDetail, /業績予想及び配当予想の修正に関するお知らせ/);
  const apiProjectionDetail = renderToStaticMarkup(createElement(AlertDetailPanel, {
    event: { ...alert, formatted_message: "", display_title: "業績予想及び配当予想の修正に関するお知らせ", display_summary: "upward 2027年3月期 第2四半期", headline: "業績予想及び配当予想の修正に関するお知らせ" },
    userId: "test-user", onUpdate: () => {},
  }));
  assert.doesNotMatch(apiProjectionDetail, /upward 2027年3月期 第2四半期/);
});

test("same notification ID refreshes its EPS summary when its payload is corrected", () => {
  const base = {
    id: "4007a755-304d-4538-ae83-b6094520b357",
    event_type: "forecast", event_subtype: "upward",
    disclosed_at: "2026-10-28T05:00:00+00:00", detected_at: "2026-10-28T05:00:00+00:00",
    ticker: "7971", company_name: "東リ",
  } as EnrichedEvent;
  const legacy = { ...base, raw_payload: { extracted: { previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 第2四半期" } } };
  assert.match(formatCardSummary(legacy, { category: "forecast" } as never, "").line3 || "", /期間不明/);
  const corrected = { ...base, raw_payload: { extracted: { eps_revisions: [
    revision("2Q_CUMULATIVE", 12.34, 27.32),
    revision("FULL_YEAR", 59.92, 81.06),
  ] } } };
  const summary = formatCardSummary(corrected, { category: "forecast" } as never, "");
  assert.match(summary.line3 || "", /2Q（累計）.*\n通期/);
  assert.match(formatCardBody(corrected).text, /2Q（累計）.*\n通期/);
});
