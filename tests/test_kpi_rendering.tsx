import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FinancialsTable from "../components/FinancialsTable";
import { buildKpiBook } from "../lib/kpi-reference-book";
import { compileFormula } from "../lib/kpi-formula";
import type { FinancialRecord } from "../types/financial";
const data: FinancialRecord[] = [{ ticker: "7512", period: "2027-02-28", quarter: "2Q", sales: 130000.1234, gross_profit: null, operating_profit: 1517, ordinary_profit: 1600, profit_before_tax: null, net_income: 1000, eps: 12.34567, source: "xbrl", updated_at: "" }];
test("KPI renders computed results while renamed headings and ordinary/memo text remain literal", () => {
    const book = buildKpiBook("7512", data, {});
    const html = renderToStaticMarkup(<FinancialsTable data={data} ticker="7512" loading={false} kpiDefs={{ 1: "ユーザーの列名", 2: "店舗数", 3: "メモKPI" }} kpiValues={{ "cum|2027-02-28|2Q": { 1: compileFormula("=CUM!E1", book), 2: "=legacy-text", 3: "既存値" } }} memoMap={{ "2027-02-28|2Q": [["=MEMOは文字列", "変更しない"]] }} />);
    assert.match(html, /ユーザーの列名/); assert.match(html, /店舗数/); assert.match(html, /=legacy-text/); assert.match(html, /既存値/); assert.match(html, /=MEMOは文字列/);
    assert.match(html, /data-kpi-slot="1"[\s\S]*?<span>1517<\/span>/);
    assert.equal((html.match(/data-kpi-slot="[123]"/g) ?? []).length, 3);
    assert.equal((html.match(/data-formula-sheet="PCUM"/g) ?? []).length, 32);
    assert.equal((html.match(/data-formula-sheet="PQ"/g) ?? []).length, 24);
    assert.doesNotMatch(html, /company-kpi-formula-v1/);
});
test("a ticker transition never renders editable old-company cells against a new-company saver", () => {
    const html = renderToStaticMarkup(<FinancialsTable ticker="8473" data={data} loading={false} />);
    assert.match(html, /読込中/); assert.doesNotMatch(html, /data-kpi-editor="cell"/);
});
