import assert from "node:assert/strict";
import test from "node:test";
import { getForecastEpsPresentation } from "../lib/tdnet-alerts/forecast-eps-presentation";
import { formatCardBody, formatCardSummary } from "../components/tdnet-alerts/AlertsPage";
import AlertDetailPanel from "../components/tdnet-alerts/AlertDetailPanel";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EnrichedEvent, TdnetEvent } from "../lib/tdnet-alerts/types";

const revision = (period: string, previous_eps: number | null, revised_eps: number | null,
  previous_op: number | null = period === "FULL_YEAR" ? 4100 : 700,
  revised_op: number | null = period === "FULL_YEAR" ? 5700 : 1900) => ({
  fiscal_period: "2027年3月期", period, basis: "連結", previous_eps, revised_eps,
  previous_op, revised_op, op_unit: "millions_jpy",
});
const event = (extracted: object, stringify = false) => ({
  raw_payload: (stringify ? JSON.stringify({ extracted }) : { extracted }) as TdnetEvent["raw_payload"],
});

test("two period profit and EPS rows use three compact lines in either table order", () => {
  const rows = [revision("FULL_YEAR", 59.92, 81.06), revision("2Q_CUMULATIVE", 12.34, 27.32)];
  for (const candidate of [rows, [...rows].reverse()]) {
    const output = getForecastEpsPresentation(event({ eps_revisions: candidate }, true));
    assert.equal(output.fiscalPeriod, "2027年3月期");
    assert.equal(output.lines[0], "2Q 連結\n営:700百万→1900百万\nEPS:12.34円→27.32円");
    assert.equal(output.lines[1], "通期 連結\n営:4100百万→5700百万\nEPS:59.92円→81.06円");
  }
});

test("Sekisui's two corrected tables retain EPS precision in card and detail", () => {
  const alert = {
    id: "a8ed2a62-31e2-447c-bfe9-2ead7c205bc1",
    ticker: "4228", company_name: "積水化成", event_type: "forecast", event_subtype: "upward",
    disclosed_at: "2026-10-28T07:00:00+00:00", detected_at: "2026-10-28T07:00:00+00:00",
    headline: "連結業績予想および配当予想の修正に関するお知らせ",
    raw_payload: { extracted: { eps_revisions: [
      { ...revision("2Q_CUMULATIVE", 43.86, 54.79, 1600, 3000), previous_eps_text: "43.86", revised_eps_text: "54.79" },
      { ...revision("FULL_YEAR", 54.83, 81, 3100, 5300), previous_eps_text: "54.83", revised_eps_text: "81.00" },
    ] } },
  } as unknown as EnrichedEvent;
  const expected = "2Q 連結\n営:1600百万→3000百万\nEPS:43.86円→54.79円\n通期 連結\n営:3100百万→5300百万\nEPS:54.83円→81.00円";
  assert.equal(formatCardBody(alert).text, expected);
  assert.equal(formatCardSummary(alert, { category: "forecast" } as never, "").line3, expected);
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-key";
  (globalThis as { React?: typeof React }).React = React;
  const detail = renderToStaticMarkup(createElement(AlertDetailPanel, {
    event: { ...alert, formatted_message: "upward 2027年3月期" },
    userId: "test-user", onUpdate: () => {},
  }));
  assert.ok(detail.includes(expected));
  assert.doesNotMatch(detail, /期間不明|2027年3月期|（累計）/);
});

test("single period, unknown period, missing EPS and legacy payloads stay safe", () => {
  assert.equal(getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 81.06)] })).lines.length, 1);
  assert.equal(getForecastEpsPresentation(event({ eps_revisions: [revision("2Q_CUMULATIVE", 12.34, 27.32)] })).lines.length, 1);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 第2四半期" })).lines[0], /^期間不明/);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 2Q（累計）" })).lines[0], /^2Q\n/);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 12.34, revised_eps: 27.32, period_label: "2027年3月期 中間期・通期" })).lines[0], /^期間不明/);
  assert.match(getForecastEpsPresentation(event({ previous_eps: 59.92, revised_eps: 81.06, period_label: "2027年3月期 通期" })).lines[0], /^通期/);
  assert.match(getForecastEpsPresentation(event({ eps_revisions: [revision("2Q_STANDALONE", 12.34, 27.32)] })).lines[0], /^2Q（単独）/);
  assert.match(getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, null)] })).lines[0], /EPS:59\.92円→—$/);
  assert.match(getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 59.92, 4100, 4100)] })).lines[0], /営:4100百万→4100百万\nEPS:59\.92円→59\.92円/);
  assert.deepEqual(getForecastEpsPresentation({ raw_payload: "broken" as unknown as TdnetEvent["raw_payload"] }).lines, []);
});

test("the actual card formatters show both periods without a fiscal-year display row", () => {
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
  assert.equal(summary.line2, "");
  assert.equal(summary.line3, "2Q 連結\n営:700百万→1900百万\nEPS:12.34円→27.32円\n通期 連結\n営:4100百万→5700百万\nEPS:59.92円→81.06円");
  const body = formatCardBody(alert).text;
  assert.match(body, /^2Q 連結\n営:700百万→1900百万/);
  assert.match(body, /\n通期 連結\n営:4100百万→5700百万/);
  assert.doesNotMatch(body, /2027年3月期|（累計）/);
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-key";
  (globalThis as { React?: typeof React }).React = React;
  const detail = renderToStaticMarkup(createElement(AlertDetailPanel, {
    event: { ...alert, formatted_message: "業績予想及び配当予想の修正" },
    userId: "test-user", onUpdate: () => {},
  }));
  assert.match(detail, /業績予想及び配当予想の修正\n2Q 連結\n営:700百万→1900百万\nEPS:12\.34円→27\.32円/);
  assert.match(detail, /通期 連結\n営:4100百万→5700百万\nEPS:59\.92円→81\.06円/);
  assert.match(detail, /class="detail-main-message">業績予想及び配当予想の修正\n2Q 連結\n営:700百万→1900百万\nEPS:12\.34円→27\.32円\n通期 連結\n営:4100百万→5700百万\nEPS:59\.92円→81\.06円<\/div>/);
  assert.doesNotMatch(detail, /\(\+?\d+(?:\.\d+)?%\)/);
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
  assert.match(summary.line3 || "", /2Q[\s\S]*\n通期/);
  assert.match(formatCardBody(corrected).text, /2Q[\s\S]*\n通期/);
});

test("unchanged, missing, zero and deficit operating values remain exact without percentages", () => {
  const unchanged = getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 81.06, 4100, 4100)] })).lines[0];
  assert.match(unchanged, /営:4100百万→4100百万/);
  const missing = getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 81.06, null, 5700)] })).lines[0];
  assert.match(missing, /営:—→5700百万\n/);
  const zero = getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 81.06, 0, 5700)] })).lines[0];
  assert.match(zero, /営:0百万→5700百万\n/);
  const deficit = getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92, 81.06, -100, 5700)] })).lines[0];
  assert.match(deficit, /営:-100百万→5700百万\n/);
  const old = getForecastEpsPresentation(event({ eps_revisions: [{ fiscal_period: "2027年3月期", period: "FULL_YEAR", basis: "連結", previous_eps: 59.92, revised_eps: 81.06 }] })).lines[0];
  assert.match(old, /営:—→—\nEPS:59\.92円→81\.06円/);
  const precise = getForecastEpsPresentation(event({ eps_revisions: [revision("FULL_YEAR", 59.92345, 81.06789, 4100.12345, 5700.98765)] })).lines[0];
  assert.match(precise, /営:4100\.12345百万→5700\.98765百万\nEPS:59\.92345円→81\.06789円/);
  assert.doesNotMatch(precise, /%|,/);
});

test("consolidated selection is scoped to the same fiscal period and duration", () => {
  const individual = (period: string, fiscal = "2027年3月期") => ({
    ...revision(period, 26.05, 90.04, 200, 1276), fiscal_period: fiscal, basis: "個別",
  });
  const consolidated = (period: string, previous_op: number | null = 1000, revised_op: number | null = 2378) => ({
    ...revision(period, 45.59, 120.56, previous_op, revised_op), basis: "連結",
  });
  for (const entries of [
    [individual("2Q_CUMULATIVE"), consolidated("2Q_CUMULATIVE")],
    [consolidated("2Q_CUMULATIVE"), individual("2Q_CUMULATIVE")],
  ]) {
    const result = getForecastEpsPresentation(event({ eps_revisions: entries }));
    assert.deepEqual(result.lines, ["2Q 連結\n営:1000百万→2378百万\nEPS:45.59円→120.56円"]);
  }
  const mixed = getForecastEpsPresentation(event({ eps_revisions: [
    individual("2Q_CUMULATIVE"), consolidated("FULL_YEAR"), individual("FULL_YEAR"),
  ] }));
  assert.equal(mixed.lines.length, 2);
  assert.match(mixed.lines[0], /^2Q 個別\n営:200百万→1276百万/);
  assert.match(mixed.lines[1], /^通期 連結\n営:1000百万→2378百万/);
  const differentFiscal = getForecastEpsPresentation(event({ eps_revisions: [
    individual("2Q_CUMULATIVE", "2028年3月期"), consolidated("2Q_CUMULATIVE"),
  ] }));
  assert.equal(differentFiscal.lines.length, 2);
  const missingConsolidated = getForecastEpsPresentation(event({ eps_revisions: [
    individual("2Q_CUMULATIVE"), consolidated("2Q_CUMULATIVE", null, 2378),
  ] }));
  assert.deepEqual(missingConsolidated.lines, ["2Q 連結\n営:—→2378百万\nEPS:45.59円→120.56円"]);
  const allMissingConsolidated = getForecastEpsPresentation(event({ eps_revisions: [
    individual("2Q_CUMULATIVE"), { ...consolidated("2Q_CUMULATIVE", null, null), previous_eps: null, revised_eps: null },
  ] }));
  assert.deepEqual(allMissingConsolidated.lines, ["2Q 連結\n営:—→—\nEPS:—→—"]);
});

test("Santec card and detail show only the consolidated three lines", () => {
  const alert = {
    id: "3509a8eb-46ae-4452-9a00-794979959ce3",
    event_type: "forecast", event_subtype: "upward",
    disclosed_at: "2026-10-28T07:00:00+00:00", detected_at: "2026-10-28T07:00:00+00:00",
    ticker: "1960", company_name: "サンテック", headline: "業績予想の修正に関するお知らせ",
    raw_payload: { extracted: {
      period_label: "2027年3月期 第2四半期", change_op_pct: 538,
      eps_revisions: [
        { ...revision("2Q_CUMULATIVE", 26.05, 90.04, 200, 1276), basis: "個別" },
        revision("2Q_CUMULATIVE", 45.59, 120.56, 1000, 2378),
      ],
    } },
  } as unknown as EnrichedEvent;
  const expected = "2Q 連結\n営:1000百万→2378百万\nEPS:45.59円→120.56円";
  assert.equal(formatCardBody(alert).text, expected);
  const summary = formatCardSummary(alert, { category: "forecast" } as never, "");
  assert.equal(summary.line1, "10/28 16:00 1960 サンテック 上方");
  assert.equal(summary.line2, "");
  assert.equal(summary.line3, expected);
  assert.equal(`${summary.line1}\n${summary.line3}`, "10/28 16:00 1960 サンテック 上方\n2Q 連結\n営:1000百万→2378百万\nEPS:45.59円→120.56円");
  const detail = renderToStaticMarkup(createElement(AlertDetailPanel, {
    event: { ...alert, formatted_message: "upward 2027年3月期 第2四半期" },
    userId: "test-user", onUpdate: () => {},
  }));
  assert.match(detail, /class="detail-main-message">業績予想の修正に関するお知らせ\n2Q 連結\n営:1000百万→2378百万\nEPS:45\.59円→120\.56円<\/div>/);
  assert.doesNotMatch(detail, /営:200百万|EPS:26\.05円|\(\+?\d+(?:\.\d+)?%\)/);
});
