import assert from "node:assert/strict";
import test from "node:test";
import { collectAllPages } from "../lib/screener-options";
import { METRIC_KEYS, SCREENER_METRICS } from "../lib/screener";

test("category options read beyond the Supabase 1000-row default", async () => {
    const source = Array.from({ length: 2505 }, (_, index) => index);
    const calls: Array<[number, number]> = [];
    const rows = await collectAllPages(async (from, to) => {
        calls.push([from, to]);
        return source.slice(from, to + 1);
    });
    assert.deepEqual(rows, source);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("inverse sales valuation metric replaces the old API/UI identity", () => {
    assert.equal(METRIC_KEYS.has("forward_per_per_forecast_sales_growth"), true);
    assert.equal(METRIC_KEYS.has("forecast_sales_growth_per_forward_per"), false);
    assert.equal(
        SCREENER_METRICS.find((metric) => metric.key === "forward_per_per_forecast_sales_growth")?.label,
        "PER/予想売上成長率",
    );
});

test("formal three-day candle ratios are exposed to filters, sort, and columns", () => {
    assert.equal(METRIC_KEYS.has("bullish_candle_ratio_3d_pct"), true);
    assert.equal(METRIC_KEYS.has("bearish_candle_ratio_3d_pct"), true);
    assert.equal(SCREENER_METRICS.find((metric) => metric.key === "bullish_candle_ratio_3d_pct")?.label, "陽線率3日(%)");
    assert.equal(SCREENER_METRICS.find((metric) => metric.key === "bearish_candle_ratio_3d_pct")?.label, "陰線率3日(%)");
});
