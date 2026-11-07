import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSegmentInfo } from "../components/FinancialsTable";
import SegmentTable from "../components/SegmentTable";
import type { SegmentRecord } from "../types/segment";
import { segmentProfitLabel } from "../lib/segment-profit";

const first: SegmentRecord = {
    ticker: "4443", period: "2027-05-31", quarter: "1Q", segment_name: "Eight Business",
    segment_sales: 1719, segment_profit: -166, profit_basis: "adjusted_operating_profit",
    profit_label: "セグメント利益または損失", sales_basis: "including_intersegment", sales_label: "計",
    period_start: "2026-06-01", period_end: "2026-08-31", segment_definition: "Eight Business",
    accounting_scope: "consolidated", currency: "JPY",
};
const second: SegmentRecord = { ...first, quarter: "2Q", segment_sales: 3000, segment_profit: -200, period_end: "2026-11-30" };

test("company-defined profit and internal-inclusive sales retain their disclosed labels", () => {
    assert.equal(segmentProfitLabel("ebitda"), "セグメント利益（EBITDAベース）");
    const info = buildSegmentInfo([first]);
    const col = info.segmentColumns[0];
    assert.match(col.salesLabel, /内部取引込み/);
    assert.match(col.profitLabel, /調整後営業利益/);
    assert.match(info.segmentLabels.get(`2027-05-31|1Q|${col.profitKey}`)!, /原表: セグメント利益または損失/);
    const html = renderToStaticMarkup(<SegmentTable data={[first]} loading={false} overrides={[]} />);
    assert.match(html, /内部取引込み/); assert.match(html, /調整後営業利益/); assert.match(html, /-166/);
});

test("quarter comparisons are independent for sales and profit", () => {
    let info = buildSegmentInfo([first, { ...second, profit_basis: "operating_profit" }]);
    const col = info.segmentColumns[0];
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.salesKey], 1281);
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.profitKey], null);
    info = buildSegmentInfo([first, { ...second, sales_basis: "external_customers" }]);
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.salesKey], null);
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.profitKey], -34);
});

test("unknown basis preserves reported values and prevents unverified subtraction", () => {
    const info = buildSegmentInfo([{ ...first, profit_basis: "company_defined_unknown" }, { ...second, profit_basis: "company_defined_unknown" }]);
    const col = info.segmentColumns[0];
    assert.equal(info.segmentMap.get("2027-05-31|2Q")![col.profitKey], -200);
    assert.equal(info.segmentQMap.get("2027-05-31|1Q")![col.profitKey], -166);
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.profitKey], null);
    assert.match(info.segmentQReasons.get(`2027-05-31|2Q|${col.profitKey}`)!, /基準が未確定/);
});

test("scope or currency changes block both differences", () => {
    for (const change of [{ accounting_scope: "non_consolidated" }, { currency: "USD" }]) {
        const info = buildSegmentInfo([first, { ...second, ...change }]);
        const col = info.segmentColumns[0];
        assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.salesKey], null);
        assert.equal(info.segmentQMap.get("2027-05-31|2Q")![col.profitKey], null);
    }
});

test("translated substrings do not merge distinct businesses or replace their values", () => {
    const rows: SegmentRecord[] = [
        { ...first, quarter: "FY", source: "edinet_xbrl", segment_name: "電材及び管材", segment_sales: 100, segment_profit: 0 },
        { ...first, quarter: "FY", source: "xbrl", segment_name: "Advanced Materials", segment_sales: 200, segment_profit: -20 },
        { ...first, quarter: "FY", source: "xbrl", segment_name: "Water Supply", segment_sales: 300, segment_profit: 30 },
    ];
    for (const options of [{}, { disableSemanticMerge: true }]) {
        const info = buildSegmentInfo(rows, options);
        assert.equal(info.segmentColumns.length, 3);
        assert.deepEqual(info.segmentColumns.map(c => info.segmentMap.get("2027-05-31|FY")![c.profitKey]).sort((a, b) => Number(a) - Number(b)), [-20, 0, 30]);
    }
});

test("an alias inside a longer Japanese business name cannot invent a quarterly difference", () => {
    const info = buildSegmentInfo([
        { ...first, source: "xbrl", segment_name: "Publishing", segment_sales: 100 },
        { ...second, source: "edinet_xbrl", segment_name: "情報出版サービス", segment_sales: 250 },
    ]);
    assert.equal(info.segmentColumns.length, 2);
    const current = info.segmentColumns.find(c => c.segmentName === "情報出版サービス")!;
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![current.salesKey], null);
});

test("whitespace and full-width variants of the exact business remain comparable", () => {
    const info = buildSegmentInfo([
        { ...first, segment_name: "ＡＩ データセンター" },
        { ...second, segment_name: "AI\nデータセンター" },
    ]);
    assert.equal(info.segmentColumns.length, 1);
    assert.equal(info.segmentQMap.get("2027-05-31|2Q")![info.segmentColumns[0].profitKey], -34);
});
