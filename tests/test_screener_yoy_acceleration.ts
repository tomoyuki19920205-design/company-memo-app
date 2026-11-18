import assert from "node:assert/strict";
import test from "node:test";
import { SCREENER_METRICS, SNAPSHOT_METRIC_KEYS } from "../lib/screener";
import { DETAILED_FILTER_DEFINITIONS } from "../lib/screener-filter-definitions";
import { buildScreenerQuery, createInitialFilterState } from "../lib/screener-filter-workflow";

const keys = ["sales_yoy_acceleration_pp", "operating_profit_yoy_acceleration_pp"];

test("both acceleration metrics are range conditions, two decimals, in the existing API allowlist", () => {
    for (const key of keys) {
        assert.equal(SCREENER_METRICS.find(m => m.key === key)?.digits, 2);
        assert.equal(DETAILED_FILTER_DEFINITIONS.find(m => m.key === key)?.kind, "range");
        assert.ok(SNAPSHOT_METRIC_KEYS.has(key));
    }
    assert.equal(SCREENER_METRICS.find(m => m.key === keys[0])?.label, "売上高YoY加速度（pt）");
    assert.equal(SCREENER_METRICS.find(m => m.key === keys[1])?.label, "営業利益YoY加速度（pt）");
});

test("negative decimal ranges coexist with growthBEAT without changing its parameters", () => {
    const filters = createInitialFilterState();
    filters.ranges = { sales_yoy_acceleration_pp: { min: "-15.125", max: "25.005" },
        operating_profit_yoy_acceleration_pp: { min: "0", max: "" },
        sales_growth_beat_pp: { min: "3.125", max: "" }, forward_per: { min: "", max: "15" } };
    const params = new URLSearchParams(buildScreenerQuery({ page: 1, filters, columns: keys, sort: keys[0], direction: "asc" }));
    assert.equal(params.get(`${keys[0]}_min`), "-15.125");
    assert.equal(params.get(`${keys[0]}_max`), "25.005");
    assert.equal(params.get(`${keys[1]}_min`), "0");
    assert.equal(params.has(`${keys[1]}_max`), false);
    assert.equal(params.get("sales_growth_beat_pp_min"), "3.125");
    assert.equal(params.get("forward_per_max"), "15");
});

test("legacy growthBEAT definitions remain identical", () => {
    assert.deepEqual(SCREENER_METRICS.filter(m => m.key.endsWith("growth_beat_pp")), [
        { key: "sales_growth_beat_pp", label: "売上growth beat(pp)", digits: 2 },
        { key: "operating_profit_growth_beat_pp", label: "営業利益growth beat(pp)", digits: 2 },
    ]);
});
