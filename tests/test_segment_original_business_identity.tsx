import assert from "node:assert/strict";
import test from "node:test";
import { buildSegmentInfo } from "../components/FinancialsTable";
import type { SegmentRecord } from "../types/segment";
import { segmentComparisonReason } from "../lib/segment-profit";

// 1301: adopted 2025-01-31 and 2025-05-12 filings both print 物流サービス
// in the FY2024 comparative table, despite different English taxonomy members.
const prior: SegmentRecord = {
    ticker: "1301", period: "2024-03-31", quarter: "3Q", segment_name: "Distribution Service",
    segment_sales: 2144, segment_profit: 225, sales_basis: "including_intersegment",
    profit_basis: "operating_profit", accounting_scope: "consolidated", currency: "JPY",
    period_start: "2023-04-01", period_end: "2023-12-31", segment_definition: "distribution service|freshfoods business|marine products business|other|processed food business",
    business_key: "物流サービス", comparison_definition: '["その他","水産事業","物流サービス","生鮮事業","食品事業"]',
};
const annual: SegmentRecord = { ...prior, quarter: "FY", segment_name: "Logistics Business", segment_sales: 2858,
    segment_profit: 289, period_end: "2024-03-31", segment_definition: "freshfoods business|logistics business|marine products business|other|processed food business" };

test("same original business across taxonomy renaming restores Q4 without changing cumulative values", () => {
    const info = buildSegmentInfo([prior, annual]);
    assert.equal(info.segmentColumns.length, 1);
    const col = info.segmentColumns[0];
    assert.equal(info.segmentMap.get("2024-03-31|3Q")![col.salesKey], 2144);
    assert.equal(info.segmentMap.get("2024-03-31|FY")![col.profitKey], 289);
    assert.equal(info.segmentQMap.get("2024-03-31|FY")![col.salesKey], 714);
    assert.equal(info.segmentQMap.get("2024-03-31|FY")![col.profitKey], 64);
});

test("unverified names, real reorganization and different measurement bases remain incomparable", () => {
    const noProof = buildSegmentInfo([{ ...prior, business_key: null, comparison_definition: null }, { ...annual, business_key: null, comparison_definition: null }]);
    assert.equal(noProof.segmentColumns.length, 2);
    assert.match(segmentComparisonReason({ ...annual, comparison_definition: '["物流サービス","新事業"]' }, prior)!, /区分/);
    assert.match(segmentComparisonReason({ ...annual, business_key: "物流サービス子会社" }, prior)!, /区分/);
    assert.match(segmentComparisonReason({ ...annual, profit_basis: "gross_profit" }, prior)!, /利益基準/);
    assert.match(segmentComparisonReason({ ...annual, sales_basis: "external_customers" }, prior, "sales")!, /売上基準/);
    assert.match(segmentComparisonReason({ ...annual, period_start: "2022-04-01" }, prior)!, /累計開始日/);
});

test("identical raw labels never share another row's source identity", () => {
    const info = buildSegmentInfo([
        { ...annual, segment_name: "日本", business_key: "建設/日本" },
        { ...annual, segment_name: "日本", business_key: "開発/日本", segment_profit: -10 },
        { ...prior, segment_name: "日本", business_key: null, comparison_definition: null },
    ]);
    assert.equal(info.segmentColumns.length, 3);
    const row = info.segmentMap.get("2024-03-31|FY")!;
    assert.equal(row["seg:source:建設/日本:profit"], 289);
    assert.equal(row["seg:source:開発/日本:profit"], -10);
});
