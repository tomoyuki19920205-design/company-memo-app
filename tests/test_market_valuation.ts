import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { calculateValuation } from "../lib/viewer-api";
import { selectPerShareDisplayRows } from "../components/PerShareTable";
import type { MarketDataRecord, PerShareRecord } from "../types/market-data";


const market = (marketCap: number | null): MarketDataRecord => ({
    ticker: "2163",
    date: "2026-08-12",
    open: 950,
    high: 990,
    low: 940,
    close: 981,
    volume: 1,
    turnover: 1,
    adj_close: 981,
    market_cap: marketCap,
});

const perShare: PerShareRecord = {
    ticker: "2163",
    period: "2027-01-31",
    quarter: "1Q",
    disclosed_date: "2026-06-10",
    eps: 1,
    diluted_eps: null,
    bps: 1,
    dividend_q1: null,
    dividend_q2: null,
    dividend_q3: null,
    dividend_fy_end: null,
    dividend_annual: null,
    payout_ratio: null,
    forecast_eps: 1,
    initial_forecast_eps: null,
    forecast_dividend_annual: null,
    forecast_payout_ratio: null,
    shares_outstanding: 10_627_920,
    treasury_stock: 28_257,
    avg_shares: null,
    total_assets: null,
    equity: null,
    equity_ratio: null,
    source: "jquants",
    updated_at: "2026-08-12T00:00:00Z",
};


test("market_data.market_cap is the canonical Viewer value", () => {
    const expected = 20_852_341_504;
    assert.equal(calculateValuation(market(expected), [perShare]).market_cap, expected);
});


test("null canonical market cap does not trigger an inaccurate browser fallback", () => {
    assert.equal(calculateValuation(market(null), [perShare]).market_cap, null);
});


test("cached tickers always refetch latest market data before valuation", () => {
    const componentPath = fileURLToPath(
        new URL("../components/CompanyViewer.tsx", import.meta.url),
    );
    const source = readFileSync(componentPath, "utf8");
    const cacheBranch = source.slice(
        source.indexOf("if (cached)"),
        source.indexOf("} else {", source.indexOf("if (cached)")),
    );

    assert.match(cacheBranch, /loadLatestMarketData\(ticker\)/);
    assert.match(cacheBranch, /loadPerShareData\(ticker\)/);
    assert.match(cacheBranch, /loadCorporateActions\(ticker\)/);
    assert.doesNotMatch(cacheBranch, /calculateValuation\(cached\.marketData/);
});


test("PER and dividend yield use the latest disclosure in the latest fiscal year", () => {
    const initial = {
        ...perShare,
        period: "2027-03-31",
        quarter: "FY",
        disclosed_date: "2026-05-07",
        forecast_eps: 130.32,
        forecast_dividend_annual: 105,
    };
    const revised = {
        ...perShare,
        period: "2027-03-31",
        quarter: "1Q",
        disclosed_date: "2026-08-03",
        forecast_eps: 219.24,
        forecast_dividend_annual: 176,
    };
    const valuation = calculateValuation(
        { ...market(42_502_400_000), ticker: "7480", close: 3200, date: "2026-08-19" },
        [initial, revised],
    );

    assert.equal(valuation.per, 14.6);
    assert.equal(valuation.div_yield, 5.5);
    assert.equal(valuation.eps_used, 219.24);
    assert.equal(valuation.dividend_used, 176);
    assert.equal(valuation.forecast_period, "2027-03-31");
    assert.equal(valuation.forecast_disclosed_date, "2026-08-03");
});


test("PBR uses the latest non-null actual BPS, not a null forecast-only FY row", () => {
    const forecastOnly = {
        ...perShare,
        period: "2027-03-31",
        quarter: "FY",
        disclosed_date: "2026-05-07",
        bps: null,
    };
    const latestActual = {
        ...perShare,
        period: "2027-03-31",
        quarter: "1Q",
        disclosed_date: "2026-08-03",
        bps: 1305.72,
    };
    const valuation = calculateValuation(
        { ...market(null), close: 3200, date: "2026-08-19" },
        [forecastOnly, latestActual],
    );

    assert.equal(valuation.pbr, 2.45);
    assert.equal(valuation.bps_used, 1305.72);
});


test("split adjustment aligns pre-split EPS, BPS, and DPS with raw close", () => {
    const preSplit = {
        ...perShare,
        disclosed_date: "2026-06-16",
        forecast_eps: 100,
        bps: 400,
        forecast_dividend_annual: 20,
    };
    const valuation = calculateValuation(
        { ...market(null), close: 500, date: "2026-08-19" },
        [preSplit],
        [{ date: "2026-07-30", adj_factor: 0.5 }],
    );

    assert.equal(valuation.eps_used, 50);
    assert.equal(valuation.bps_used, 200);
    assert.equal(valuation.dividend_used, 10);
    assert.equal(valuation.per, 10);
    assert.equal(valuation.pbr, 2.5);
    assert.equal(valuation.div_yield, 2);
});


test("same-day action is not applied twice to a same-day disclosure", () => {
    const sameDay = {
        ...perShare,
        disclosed_date: "2026-07-30",
        forecast_eps: 50,
        forecast_dividend_annual: 10,
    };
    const valuation = calculateValuation(
        { ...market(null), close: 500, date: "2026-08-19" },
        [sameDay],
        [{ date: "2026-07-30", adj_factor: 0.5 }],
    );

    assert.equal(valuation.eps_used, 50);
    assert.equal(valuation.dividend_used, 10);
});


test("null latest forecast fails closed instead of falling back to an older FY", () => {
    const old = {
        ...perShare,
        quarter: "FY",
        disclosed_date: "2026-05-01",
        forecast_eps: 100,
        forecast_dividend_annual: 20,
    };
    const withdrawn = {
        ...perShare,
        quarter: "1Q",
        disclosed_date: "2026-08-01",
        forecast_eps: null,
        forecast_dividend_annual: null,
    };
    const valuation = calculateValuation(market(null), [old, withdrawn]);

    assert.equal(valuation.per, null);
    assert.equal(valuation.div_yield, null);
    assert.equal(valuation.eps_used, null);
    assert.equal(valuation.dividend_used, null);
});


test("an explicit zero dividend forecast displays a zero yield", () => {
    const zeroDividend = { ...perShare, forecast_dividend_annual: 0 };
    const valuation = calculateValuation(market(null), [zeroDividend]);

    assert.equal(valuation.dividend_used, 0);
    assert.equal(valuation.div_yield, 0);
    assert.equal(valuation.dividend_basis, "forecast");
});


test("per-share table uses the same latest fiscal disclosure as valuation", () => {
    const initial = {
        ...perShare,
        period: "2027-03-31",
        quarter: "FY",
        disclosed_date: "2026-05-07",
        eps: null,
        forecast_eps: 130.32,
        forecast_dividend_annual: 105,
    };
    const revised = {
        ...perShare,
        period: "2027-03-31",
        quarter: "1Q",
        disclosed_date: "2026-08-03",
        forecast_eps: 219.24,
        forecast_dividend_annual: 176,
        bps: 1305.72,
    };
    const actual = {
        ...perShare,
        period: "2026-03-31",
        quarter: "FY",
        disclosed_date: "2026-05-07",
        eps: 129.04,
    };

    const rows = selectPerShareDisplayRows([initial, revised, actual]);

    assert.equal(rows[0], revised);
    assert.equal(rows[1], actual);
});
