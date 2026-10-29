import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FinancialsTable from "../components/FinancialsTable";
import { buildFinancialTableModel } from "../lib/financial-table-model";
import { transformFinancialRows, type ViewerFinancialRow } from "../lib/financial-transform";

const path = fileURLToPath(new URL("./fixtures/verified_pl_1777.json", import.meta.url));
const fixture = JSON.parse(readFileSync(path, "utf8")) as {
    cumulative: Array<Record<string, number | string>>;
    standalone: Array<Record<string, number | string>>;
};
const rows: ViewerFinancialRow[] = fixture.cumulative.map((r) => ({
    ticker: "1777", period: String(r.period), quarter: String(r.quarter),
    sales: Number(r.sales), gross_profit: Number(r.gross_profit),
    selling_general_and_administrative_expenses: Number(r.sga),
    operating_profit: Number(r.operating_profit), ordinary_profit: Number(r.ordinary_profit),
    net_income: Number(r.net_income), source: "official_pdf", updated_at: String(r.disclosure_date),
}));

test("1777 fixture flows through transform, table model and SSR for 13 actuals", () => {
    const records = transformFinancialRows(rows);
    const model = buildFinancialTableModel(records);
    assert.equal(model.cumulativeRows.length, 13);
    assert.equal(model.standaloneRows.length, 13);
    for (const expected of fixture.cumulative) {
        const row = model.cumulativeRows.find(r => r.period === expected.period && r.quarter === expected.quarter)!;
        assert.equal(row.sales, expected.sales);
        assert.equal(row.grossProfit, expected.gross_profit);
        assert.equal(row.sgAndA, expected.sga);
        assert.equal(row.operatingProfit, expected.operating_profit);
        assert.ok(Math.abs(row.grossMarginRate! - Number(expected.gross_margin_rate)) < 1e-10);
    }
    for (const expected of fixture.standalone) {
        const row = model.standaloneRows.find(r => r.period === expected.period && r.quarter === expected.quarter)!;
        assert.equal(row.sales, expected.sales);
        assert.equal(row.grossProfit, expected.gross_profit);
        assert.equal(row.sgAndA, expected.sga);
        assert.equal(row.operatingProfit, expected.operating_profit);
        assert.ok(Math.abs(row.grossMarginRate! - Number(expected.gross_margin_rate)) < 1e-10);
    }
    assert.equal(model.standaloneRows.find(r => r.period === "2026-03-31" && r.quarter === "FY")!.sgAndA, 1244);
    const html = renderToStaticMarkup(<FinancialsTable data={records} loading={false} segments={[]} />);
    assert.match(html, /data-table="cumulative"[^>]*data-period="2024-03-31"[^>]*data-quarter="1Q"/);
    assert.match(html, /data-table="standalone"[^>]*data-period="2026-03-31"[^>]*data-quarter="FY"/);
    assert.match(html, />1,244</);
    assert.match(html, />3,636</);
});

test("direct SG&A wins; fallback uses matching derivations on both sides", () => {
    const partial = rows.filter(r => r.period === "2026-03-31" && ["1Q", "2Q"].includes(r.quarter));
    const fallback = buildFinancialTableModel(transformFinancialRows([
        partial[0], { ...partial[1], selling_general_and_administrative_expenses: null },
    ])).standaloneRows.find(r => r.quarter === "2Q")!;
    assert.equal(fallback.sgAndA, (3935 - 2451) - (2027 - 1423));
    const zeroSales = buildFinancialTableModel(transformFinancialRows([
        { ...partial[0], sales: 0 },
    ])).cumulativeRows[0];
    assert.equal(zeroSales.grossMarginRate, null);
});
