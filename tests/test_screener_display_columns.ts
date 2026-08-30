import assert from "node:assert/strict";
import test from "node:test";
import {
    automaticMetricColumnKeys,
    resolveMetricColumns,
} from "../lib/screener-display-columns";

const ORDER = ["forward_per", "forecast_sales_growth_yoy_pct", "market_cap", "forward_peg"];

test("no filter and implicit default sort show zero optional metrics", () => {
    assert.deepEqual(automaticMetricColumnKeys({}, ORDER, "market_cap", false), []);
});

test("either range bound makes exactly that metric active", () => {
    assert.deepEqual(automaticMetricColumnKeys({ forward_per: { max: "15" } }, ORDER, "market_cap", false), ["forward_per"]);
    assert.deepEqual(automaticMetricColumnKeys({ forward_per: { min: "10" } }, ORDER, "market_cap", false), ["forward_per"]);
});

test("two filters show two metrics and category-only state cannot add columns", () => {
    const ranges = { forward_per: { max: "15" }, forecast_sales_growth_yoy_pct: { min: "5" } };
    assert.deepEqual(automaticMetricColumnKeys(ranges, ORDER, "market_cap", false), ["forward_per", "forecast_sales_growth_yoy_pct"]);
});

test("explicit sort metric is visible with or without filters", () => {
    assert.deepEqual(automaticMetricColumnKeys({}, ORDER, "market_cap", true), ["market_cap"]);
    const ranges = { forward_per: { max: "15" }, forecast_sales_growth_yoy_pct: { min: "5" } };
    assert.deepEqual(automaticMetricColumnKeys(ranges, ORDER, "forward_peg", true), ["forward_per", "forecast_sales_growth_yoy_pct", "forward_peg"]);
});

test("manual visibility wins and remains stable across presentation-only rerenders", () => {
    const automatic = ["forward_per"];
    const overrides = { forward_per: false, market_cap: true };
    const expected = ["market_cap"];
    assert.deepEqual(resolveMetricColumns(automatic, overrides, ORDER), expected);
    assert.deepEqual(resolveMetricColumns(automatic, overrides, ORDER), expected);
});

test("new metrics follow default order while unknown legacy preference keys are ignored", () => {
    const overrides = { deleted_metric: true, forward_per: true };
    assert.deepEqual(resolveMetricColumns(["forward_peg"], overrides, ORDER), ["forward_per", "forward_peg"]);
});
