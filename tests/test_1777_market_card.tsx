import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ValuationCard from "../components/ValuationCard";
import { calculateValuation } from "../lib/viewer-api";
import type { MarketDataRecord, PerShareRecord } from "../types/market-data";

test("1777 NSE close and existing official per-share inputs reach the card", () => {
    const market: MarketDataRecord = {
        ticker: "1777", date: "2026-10-29", open: 2329, high: 2352,
        low: 2302, close: 2345, volume: null, turnover: null,
        adj_close: 2345, market_cap: 28_140_000_000, source: "nse_daily_report",
    };
    const perShare = [{
        ticker: "1777", period: "2027-03-31", quarter: "1Q",
        disclosed_date: "2026-07-31", eps: 70.23, diluted_eps: null,
        bps: 1373.77, dividend_q1: null, dividend_q2: null,
        dividend_q3: null, dividend_fy_end: null, dividend_annual: null,
        payout_ratio: null, forecast_eps: 288.11, forecast_eps_basis_factor: 1,
        initial_forecast_eps: null, forecast_dividend_annual: 95,
        forecast_payout_ratio: null, shares_outstanding: 12_000_000,
        treasury_stock: 35_861, avg_shares: 11_964_139,
        total_assets: 24_924_000_000, equity: 16_436_000_000,
        equity_ratio: 0.659, source: "jquants", updated_at: "2026-07-31",
    }] satisfies PerShareRecord[];
    const valuation = calculateValuation(market, perShare);
    assert.equal(valuation.stock_price, 2345);
    assert.equal(valuation.price_date, "2026-10-29");
    assert.equal(valuation.price_source, "nse_daily_report");
    assert.equal(valuation.market_cap, 28_140_000_000);
    assert.equal(valuation.per, 8.14);
    assert.equal(valuation.pbr, 1.71);
    assert.equal(valuation.div_yield, 4.05);
    assert.equal(valuation.eps_used, 288.11);
    const html = renderToStaticMarkup(<ValuationCard valuation={valuation} loading={false} compact />);
    for (const item of ["2,345", "8.14", "1.71", "4.05", "2026-10-29", "名証公式日報",
        "https://www.nse.or.jp/market/condition/report/files/20261029.pdf"]) {
        assert.ok(html.includes(item), item);
    }
});
