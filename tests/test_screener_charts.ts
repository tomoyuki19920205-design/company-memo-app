import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    chunkTickers,
    groupAdjustedChartRows,
    normalizeChartTickers,
    parseChartPeriod,
    sliceChartPeriod,
    toAdjustedChartPoint,
    type ChartPricePoint,
    type RawMarketDataRow,
} from "../lib/screener-chart-data";
import { chartCardMetricKeys, latestChartReturn, loadChartPreference } from "../lib/screener-chart-ui";
import { createInitialFilterState } from "../lib/screener-filter-workflow";

const splitRow = (overrides: Partial<RawMarketDataRow> = {}): RawMarketDataRow => ({
    ticker: "1333", date: "2025-12-26", open: 3913, high: 3957, low: 3903, close: 3953,
    volume: 198800, adj_close: 1317.6666666667, adj_volume: 596400, ...overrides,
});

test("batch ticker normalization accepts exact current result tickers only", () => {
    assert.deepEqual(normalizeChartTickers("8923,285A,8923,bad,12345,,7203"), ["8923", "285A", "7203"]);
    assert.deepEqual(normalizeChartTickers(""), []);
    assert.deepEqual(chunkTickers(["1", "2", "3", "4", "5", "6", "7"], 3), [["1", "2", "3"], ["4", "5", "6"], ["7"]]);
});

test("period parser rejects unsupported periods", () => {
    assert.equal(parseChartPeriod("1m"), "1m");
    assert.equal(parseChartPeriod("1y"), "1y");
    assert.equal(parseChartPeriod("5y"), null);
});

test("stored J-Quants adjusted close basis scales every OHLC field and uses adjusted volume", () => {
    const point = toAdjustedChartPoint(splitRow())!;
    assert.ok(Math.abs(point.open - 1304.3333333334) < 1e-6);
    assert.ok(Math.abs(point.high - 1319) < 1e-6);
    assert.ok(Math.abs(point.low - 1301) < 1e-6);
    assert.ok(Math.abs(point.close - 1317.6666666667) < 1e-6);
    assert.equal(point.volume, 596400);
});

test("reverse split basis and adjusted-volume fallback remain coherent", () => {
    const point = toAdjustedChartPoint(splitRow({ ticker: "1491", open: 55, high: 56, low: 53, close: 54, adj_close: 1080, volume: 1_611_000, adj_volume: null }))!;
    assert.deepEqual({ open: point.open, high: point.high, low: point.low, close: point.close, volume: point.volume }, { open: 1100, high: 1120, low: 1060, close: 1080, volume: 80550 });
});

test("invalid or incomplete price rows become missing history instead of crashing", () => {
    assert.equal(toAdjustedChartPoint(splitRow({ close: 0 })), null);
    assert.equal(toAdjustedChartPoint(splitRow({ high: null })), null);
});

test("grouping cannot mix a ticker outside the requested/current result", () => {
    const rows = [splitRow(), splitRow({ ticker: "9999" })];
    const grouped = groupAdjustedChartRows(rows, ["1333"], "1y");
    assert.deepEqual(Object.keys(grouped), ["1333"]);
    assert.equal(grouped["1333"].length, 1);
});

test("1M/3M/6M/1Y periods slice a cached 1Y series client-side", () => {
    const start = Date.UTC(2025, 7, 1);
    const points: ChartPricePoint[] = Array.from({ length: 380 }, (_, index) => {
        const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
        return { date, open: 100, high: 101, low: 99, close: 100, volume: 10 };
    });
    assert.ok(sliceChartPeriod(points, "1m").length <= 32);
    assert.ok(sliceChartPeriod(points, "3m").length > sliceChartPeriod(points, "1m").length);
    assert.ok(sliceChartPeriod(points, "6m").length > sliceChartPeriod(points, "3m").length);
    assert.ok(sliceChartPeriod(points, "1y").length > sliceChartPeriod(points, "6m").length);
});

test("chart cards use applied range metrics plus explicit sort without duplicates", () => {
    const filters = createInitialFilterState();
    filters.detailedKeys = ["forward_per", "forward_per_per_forecast_sales_growth"];
    filters.ranges.forward_per = { min: "", max: "15" };
    filters.ranges.forward_per_per_forecast_sales_growth = { min: "", max: "0.5" };
    assert.deepEqual(chartCardMetricKeys(filters, ["forward_per", "forward_per_per_forecast_sales_growth", "forward_peg"], "forward_per", true), ["forward_per", "forward_per_per_forecast_sales_growth"]);
    assert.deepEqual(chartCardMetricKeys(filters, ["forward_per", "forward_per_per_forecast_sales_growth", "forward_peg"], "forward_peg", true), ["forward_per", "forward_per_per_forecast_sales_growth", "forward_peg"]);
});

test("chart cards include only the resolved active technical period", () => {
    const filters = createInitialFilterState();
    filters.technicalFilters = [{ id: "rise", family: "rise_rate", period: "20d", min: "15", max: "", enabled: false }];
    assert.deepEqual(chartCardMetricKeys(filters, ["rise_rate_5d_pct", "rise_rate_20d_pct", "rise_rate_60d_pct"], "rise_rate_5d_pct", false), ["rise_rate_20d_pct"]);
});

test("latest return and view preferences handle valid and stale values", () => {
    assert.equal(latestChartReturn([{ close: 100 }, { close: 105 }]), 5.000000000000004);
    assert.equal(latestChartReturn([{ close: 100 }]), null);
    const storage = { getItem: (key: string) => key === "mode" ? "chart" : "invalid" };
    assert.equal(loadChartPreference(storage, "mode", ["table", "chart"], "table"), "chart");
    assert.equal(loadChartPreference(storage, "period", ["1m", "6m"], "6m"), "6m");
});

test("screening UI fetches charts only in chart mode and cancels stale requests", () => {
    const source = readFileSync("components/ScreenerPage.tsx", "utf8");
    assert.match(source, /viewMode !== "chart"/);
    assert.match(source, /\/api\/screener\/charts\?tickers=/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /requestId !== chartRequestRef\.current/);
    assert.match(source, />表<\/button>/);
    assert.match(source, />チャート<\/button>/);
});

test("chart component contains lazy rendering, OHLCV tooltip, and graceful states", () => {
    const source = readFileSync("components/ScreenerChartGrid.tsx", "utf8");
    assert.match(source, /IntersectionObserver/);
    assert.match(source, /O \{number\(active\.open/);
    assert.match(source, /出来高 \{number\(active\.volume/);
    assert.match(source, /チャート読み込み中/);
    assert.match(source, /チャート取得失敗/);
    assert.match(source, /株価履歴なし/);
});

test("chart API is authenticated, batch-only, current-universe limited, and partial-failure safe", () => {
    const source = readFileSync("app/api/screener/charts/route.ts", "utf8");
    assert.match(source, /auth\.getUser\(\)/);
    assert.match(source, /chunkTickers\(allowedTickers\)/);
    assert.match(source, /from\("screener_metrics_current"\)/);
    assert.match(source, /Promise\.allSettled/);
    assert.match(source, /partialFailures/);
});
