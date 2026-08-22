import assert from "node:assert/strict";
import test from "node:test";

import {
    getVerifiedShareBasisActions,
    normalizePerShareRowsForDisplay,
} from "../lib/per-share-adjustment";
import type { CorporateActionRecord, PerShareRecord } from "../types/market-data";

const row = (overrides: Partial<PerShareRecord> = {}): PerShareRecord => ({
    ticker: "TEST",
    period: "2025-03-31",
    quarter: "FY",
    disclosed_date: "2025-05-10",
    eps: null,
    diluted_eps: null,
    bps: null,
    dividend_q1: null,
    dividend_q2: null,
    dividend_q3: null,
    dividend_fy_end: null,
    dividend_annual: null,
    payout_ratio: null,
    forecast_eps: null,
    initial_forecast_eps: null,
    forecast_dividend_annual: null,
    forecast_payout_ratio: null,
    shares_outstanding: 100,
    treasury_stock: null,
    avg_shares: null,
    total_assets: null,
    equity: null,
    equity_ratio: null,
    source: "jquants",
    updated_at: null,
    ...overrides,
});

const action = (date: string, adj_factor: number): CorporateActionRecord => ({
    date,
    adj_factor,
});

test("normalizes actual EPS, BPS, and dividend to a verified 1-to-5 current basis", () => {
    const before = row({ eps: 330.32, bps: 1476.96, dividend_annual: 100 });
    const after = row({
        period: "2026-03-31",
        disclosed_date: "2026-05-10",
        shares_outstanding: 500,
    });
    const normalized = normalizePerShareRowsForDisplay(
        [before, after],
        [action("2026-03-30", 0.2)],
        "2026-08-01",
    )[0];

    assert.ok(Math.abs((normalized.eps ?? 0) - 66.064) < 1e-12);
    assert.ok(Math.abs((normalized.bps ?? 0) - 295.392) < 1e-12);
    assert.equal(normalized.dividend_annual, 20);
});

test("uses cumulative factors for multiple splits", () => {
    const rows = [
        row({ eps: 100, disclosed_date: "2024-05-10", shares_outstanding: 100 }),
        row({ period: "2025-03-31", disclosed_date: "2025-05-10", shares_outstanding: 500 }),
        row({ period: "2026-03-31", disclosed_date: "2026-05-10", shares_outstanding: 1000 }),
    ];
    const normalized = normalizePerShareRowsForDisplay(
        rows,
        [action("2025-03-30", 0.2), action("2026-03-30", 0.5)],
        "2026-08-01",
    );
    assert.equal(normalized[0].eps, 10);
});

test("normalizes a verified 5-to-1 consolidation in the inverse direction", () => {
    const rows = [
        row({ eps: 10, shares_outstanding: 500 }),
        row({ period: "2026-03-31", disclosed_date: "2026-05-10", shares_outstanding: 100 }),
    ];
    const normalized = normalizePerShareRowsForDisplay(
        rows,
        [action("2026-03-30", 5)],
        "2026-08-01",
    );
    assert.equal(normalized[0].eps, 50);
});

test("leaves no-split and null values unchanged", () => {
    const unchanged = normalizePerShareRowsForDisplay(
        [row({ eps: 100, bps: null })],
        [],
        "2026-08-01",
    )[0];
    assert.equal(unchanged.eps, 100);
    assert.equal(unchanged.bps, null);
});

test("rejects a price action factor not corroborated by issued shares", () => {
    const rows = [
        row({ eps: 100, shares_outstanding: 100 }),
        row({ period: "2026-03-31", disclosed_date: "2026-05-10", shares_outstanding: 110 }),
    ];
    assert.deepEqual(
        getVerifiedShareBasisActions(rows, [action("2026-03-30", 0.8)]),
        [],
    );
    assert.equal(
        normalizePerShareRowsForDisplay(rows, [action("2026-03-30", 0.8)], "2026-08-01")[0].eps,
        100,
    );
});

test("applies an unambiguous integer split before a post-action filing exists", () => {
    const normalized = normalizePerShareRowsForDisplay(
        [row({ eps: 100, shares_outstanding: 100 })],
        [action("2026-03-30", 0.5)],
        "2026-08-01",
    )[0];
    assert.equal(normalized.eps, 50);
});

test("does not double-adjust a forecast revision disclosed after the split", () => {
    const rows = [
        row({ forecast_eps: 100, disclosed_date: "2025-05-10", shares_outstanding: 100 }),
        row({
            period: "2026-03-31",
            quarter: "1Q",
            forecast_eps: 50,
            disclosed_date: "2025-11-10",
            shares_outstanding: 200,
        }),
    ];
    const normalized = normalizePerShareRowsForDisplay(
        rows,
        [action("2025-09-30", 0.5)],
        "2026-01-01",
    );
    assert.equal(normalized[0].forecast_eps, 50);
    assert.equal(normalized[1].forecast_eps, 50);
});

test("uses the original prior-FY disclosure date for initial forecast EPS", () => {
    const rows = [
        row({ period: "2024-03-31", disclosed_date: "2024-05-10", eps: 40, shares_outstanding: 100 }),
        row({
            period: "2025-03-31",
            disclosed_date: "2025-05-10",
            eps: 60,
            initial_forecast_eps: 100,
            shares_outstanding: 200,
        }),
    ];
    const normalized = normalizePerShareRowsForDisplay(
        rows,
        [action("2025-03-30", 0.5)],
        "2025-08-01",
    );
    assert.equal(normalized[1].eps, 60);
    assert.equal(normalized[1].initial_forecast_eps, 50);
});

test("reconstructs mixed-basis annual dividends without adjusting post-split components twice", () => {
    const rows = [
        row({
            period: "2026-03-31",
            quarter: "1Q",
            disclosed_date: "2025-08-07",
            forecast_dividend_annual: 150,
            shares_outstanding: 100,
        }),
        row({
            period: "2026-03-31",
            quarter: "3Q",
            disclosed_date: "2026-02-09",
            dividend_q2: 95,
            forecast_dividend_annual: 215,
            shares_outstanding: 100,
        }),
        row({
            period: "2026-03-31",
            quarter: "FY",
            disclosed_date: "2026-05-14",
            eps: 94.93,
            dividend_q2: 95 / 6,
            dividend_fy_end: 130,
            dividend_annual: 225,
            forecast_dividend_annual: 145 + 5 / 6,
            shares_outstanding: 600,
        }),
    ];
    const normalized = normalizePerShareRowsForDisplay(
        rows,
        [action("2026-03-30", 1 / 6)],
        "2026-08-21",
    )[2];

    assert.equal(normalized.dividend_annual, 37.5);
    assert.equal(normalized.forecast_dividend_annual, 37.5);
    assert.equal(normalized.adjustment_audit?.dividend_annual?.method, "component-basis-inference");
});
