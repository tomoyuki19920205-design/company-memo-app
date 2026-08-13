import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { calculateValuation } from "../lib/viewer-api";
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
    assert.doesNotMatch(cacheBranch, /calculateValuation\(cached\.marketData/);
});
