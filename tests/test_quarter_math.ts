import assert from "node:assert/strict";
import test from "node:test";

import {
    buildQStandaloneRows,
    sortForDisplay,
} from "../lib/quarter-math";
import type { FinancialRecord } from "../types/financial";

const row = (
    period: string,
    quarter: string,
    sales: number | null,
    grossProfit: number | null,
    operatingProfit: number | null,
    ticker = "TEST",
    profitBeforeTax: number | null = null,
): FinancialRecord => ({
    ticker,
    period,
    quarter,
    sales,
    gross_profit: grossProfit,
    operating_profit: operatingProfit,
    profit_before_tax: profitBeforeTax,
    ordinary_profit: null,
    net_income: null,
    eps: null,
    source: "jquants",
    updated_at: "",
});

const byQuarter = (rows: FinancialRecord[]) =>
    new Map(buildQStandaloneRows(sortForDisplay(rows)).map((item) => [item.quarter, item]));

test("1Q cumulative values are standalone values without null-to-zero coercion", () => {
    const result = byQuarter([row("2026-11-30", "1Q", 100, null, 10)]).get("1Q")!;
    assert.equal(result.sales, 100);
    assert.equal(result.grossProfit, null);
    assert.equal(result.operatingProfit, 10);
    assert.equal(result.sgAndA, null);
});

test("2Q, 3Q, and FY use only the immediately preceding cumulative quarter", () => {
    const result = byQuarter([
        row("2026-03-31", "1Q", 100, 40, 10),
        row("2026-03-31", "2Q", 260, 100, 35),
        row("2026-03-31", "3Q", 450, 175, 65),
        row("2026-03-31", "FY", 700, 280, 110),
    ]);
    assert.deepEqual(
        [result.get("2Q")!.sales, result.get("3Q")!.sales, result.get("FY")!.sales],
        [160, 190, 250],
    );
    assert.deepEqual(
        [result.get("2Q")!.grossProfit, result.get("3Q")!.grossProfit, result.get("FY")!.grossProfit],
        [60, 75, 105],
    );
    assert.deepEqual(
        [result.get("2Q")!.operatingProfit, result.get("3Q")!.operatingProfit, result.get("FY")!.operatingProfit],
        [25, 30, 45],
    );
});

test("missing required preceding quarters produce null standalone values", () => {
    for (const [quarter, period] of [["2Q", "2026-03-31"], ["3Q", "2027-03-31"], ["FY", "2028-03-31"]] as const) {
        const result = buildQStandaloneRows([row(period, quarter, 500, 200, 50)])[0];
        assert.equal(result.sales, null);
        assert.equal(result.grossProfit, null);
        assert.equal(result.operatingProfit, null);
    }
});

test("fiscal year boundaries reset subtraction state", () => {
    const result = buildQStandaloneRows(sortForDisplay([
        row("2025-12-31", "FY", 1000, 400, 100),
        row("2026-12-31", "1Q", 300, 120, 30),
    ]));
    const fy = result.find((item) => item.quarter === "FY")!;
    const q1 = result.find((item) => item.quarter === "1Q")!;
    assert.equal(fy.sales, null);
    assert.equal(q1.sales, 300);
});

test("different fiscal months never share subtraction state", () => {
    const result = buildQStandaloneRows(sortForDisplay([
        row("2026-11-30", "1Q", 100, 40, 10),
        row("2026-12-31", "2Q", 300, 120, 30),
    ]));
    assert.equal(result.find((item) => item.quarter === "2Q")!.sales, null);
});

test("null current or previous cumulative values remain null", () => {
    const result = byQuarter([
        row("2026-11-30", "1Q", 100, null, 10),
        row("2026-11-30", "2Q", null, 80, 25),
    ]).get("2Q")!;
    assert.equal(result.sales, null);
    assert.equal(result.grossProfit, null);
    assert.equal(result.operatingProfit, 15);
    assert.equal(result.sgAndA, null);
});

test("418A fixture stays in November and computes the 2Q delta", () => {
    const records = [
        row("2026-11-30", "1Q", 545, null, 103, "418A"),
        row("2026-11-30", "2Q", 1190, null, 219, "418A"),
    ];
    const result = byQuarter(records);
    assert.equal(result.get("1Q")!.sales, 545);
    assert.equal(result.get("2Q")!.sales, 645);
    assert.equal(result.get("2Q")!.operatingProfit, 116);
    assert.equal(result.get("2Q")!.grossProfit, null);
    assert.ok(records.every((item) => item.period.endsWith("-11-30") && item.ticker === "418A"));
});

test("472A FY without 3Q stays null while next-year 1Q is standalone", () => {
    const records = [
        row("2025-12-31", "FY", 7188, 2275.987, 349, "472A"),
        row("2026-12-31", "1Q", 1952, 719.999, 257, "472A"),
    ];
    const result = buildQStandaloneRows(sortForDisplay(records));
    const fy = result.find((item) => item.quarter === "FY")!;
    const q1 = result.find((item) => item.quarter === "1Q")!;
    assert.equal(fy.sales, null);
    assert.equal(fy.grossProfit, null);
    assert.equal(fy.operatingProfit, null);
    assert.equal(q1.sales, 1952);
    assert.equal(q1.grossProfit, 719.999);
    assert.ok(records.every((item) => item.period.endsWith("-12-31") && item.ticker === "472A"));
});

test("5713 uses official cumulative PBT for standalone quarter math", () => {
    const records = [
        row("2026-03-31", "1Q", 379_600, null, null, "5713", 37_901),
        row("2026-03-31", "2Q", 783_361, null, null, "5713", 77_815),
        row("2026-03-31", "3Q", 1_250_721, null, null, "5713", 148_258),
        row("2026-03-31", "FY", 1_741_586, null, null, "5713", 255_680),
    ];
    const result = byQuarter(records);
    assert.deepEqual(
        ["1Q", "2Q", "3Q", "FY"].map((q) => result.get(q)!.operatingProfit),
        [37_901, 39_914, 70_443, 107_422],
    );
    assert.ok([...result.values()].every((item) => item.sgAndA === null));
    assert.ok(records.every((item) => item.operating_profit === null));
});
