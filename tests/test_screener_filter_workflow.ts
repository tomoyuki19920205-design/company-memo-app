import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    DETAILED_FILTER_DEFINITIONS,
    addDetailedFilter,
    filterDetailedDefinitions,
    removeDetailedFilter,
} from "../lib/screener-filter-definitions";
import {
    buildScreenerQuery,
    createInitialFilterState,
    snapshotFilterState,
} from "../lib/screener-filter-workflow";
import {
    addTechnicalFilter,
    resolveTechnicalMetric,
    technicalFilterLabel,
    updateTechnicalPeriod,
} from "../lib/screener-technical-filters";

const component = readFileSync(new URL("../components/ScreenerPage.tsx", import.meta.url), "utf8");

test("technical picker exposes one generic entry per family", () => {
    assert.equal(DETAILED_FILTER_DEFINITIONS.filter((item) => item.key.startsWith("technical:")).length, 6);
    assert.ok(DETAILED_FILTER_DEFINITIONS.some((item) => item.key === "technical:new_ytd_high" && item.kind === "technical_boolean"));
    assert.ok(DETAILED_FILTER_DEFINITIONS.some((item) => item.key === "forward_per_per_forecast_sales_growth"));
    assert.equal(DETAILED_FILTER_DEFINITIONS.some((item) => item.key === "bullish_candle_ratio_3d_pct"), false);
    assert.deepEqual(filterDetailedDefinitions("PER").map((item) => item.key), [
        "forward_per", "actual_per", "forward_per_per_forecast_sales_growth",
    ]);
});

test("period mapping supports two periods of one family and rejects exact duplicates", () => {
    let filters = addTechnicalFilter([], "bullish_candle_ratio");
    assert.equal(filters[0].period, "3d");
    filters = addTechnicalFilter(filters, "bullish_candle_ratio");
    assert.equal(filters.length, 2);
    assert.notEqual(filters[0].period, filters[1].period);
    const before = filters;
    filters = updateTechnicalPeriod(filters, filters[1].id, "3d");
    assert.deepEqual(filters, before);
    assert.equal(resolveTechnicalMetric("bullish_candle_ratio", "10d"), "bullish_candle_ratio_10d_pct");
    assert.equal(resolveTechnicalMetric("rise_rate", "60d"), "rise_rate_60d_pct");
    assert.equal(technicalFilterLabel({ family: "decline_rate", period: "1d" }), "値下がり率（当日）");
});

test("generic technical filters resolve into AND query parameters", () => {
    const filters = createInitialFilterState();
    filters.technicalFilters = [
        { id: "a", family: "bullish_candle_ratio", period: "3d", min: "66.67", max: "", enabled: false },
        { id: "b", family: "bullish_candle_ratio", period: "10d", min: "", max: "50", enabled: false },
        { id: "c", family: "new_ytd_high", period: "5d", min: "", max: "", enabled: true },
    ];
    const params = new URLSearchParams(buildScreenerQuery({ page: 1, filters, columns: [], sort: "market_cap", direction: "desc" }));
    assert.equal(params.get("bullish_candle_ratio_3d_pct_min"), "66.67");
    assert.equal(params.get("bullish_candle_ratio_10d_pct_max"), "50");
    assert.equal(params.get("new_ytd_high_last_5d"), "true");
});

test("a metric can be added once, removed, and added again", () => {
    let keys = addDetailedFilter([], "forward_per");
    assert.deepEqual(keys, ["forward_per"]);
    assert.strictEqual(addDetailedFilter(keys, "forward_per"), keys);
    keys = removeDetailedFilter(keys, "forward_per");
    assert.deepEqual(keys, []);
    assert.deepEqual(addDetailedFilter(keys, "forward_per"), ["forward_per"]);
});

test("multiple range cards produce the existing AND query parameters", () => {
    const filters = createInitialFilterState();
    filters.detailedKeys = ["forward_per", "forecast_sales_growth_yoy_pct", "forward_per_per_forecast_sales_growth"];
    filters.ranges = {
        forward_per: { min: "", max: "15" },
        forecast_sales_growth_yoy_pct: { min: "10", max: "" },
        forward_per_per_forecast_sales_growth: { min: "", max: "0.5" },
    };
    const params = new URLSearchParams(buildScreenerQuery({ page: 1, filters, columns: [], sort: "market_cap", direction: "desc" }));
    assert.equal(params.get("forward_per_max"), "15");
    assert.equal(params.get("forecast_sales_growth_yoy_pct_min"), "10");
    assert.equal(params.get("forward_per_per_forecast_sales_growth_max"), "0.5");
});

test("applied snapshot is isolated from later draft changes and pagination uses it", () => {
    const draft = createInitialFilterState();
    draft.markets.push("0111");
    draft.ranges.forward_per = { min: "", max: "15" };
    const applied = snapshotFilterState(draft);
    draft.technicalFilters.push({ id: "a", family: "rise_rate", period: "20d", min: "10", max: "", enabled: false });
    draft.markets.push("0113");
    draft.ranges.forward_per.max = "20";
    const pageTwo = new URLSearchParams(buildScreenerQuery({ page: 2, filters: applied, columns: ["forward_per"], sort: "forward_per", direction: "asc" }));
    assert.equal(pageTwo.get("markets"), "0111");
    assert.equal(pageTwo.get("forward_per_max"), "15");
    assert.equal(pageTwo.get("page"), "2");
    assert.equal(pageTwo.get("rise_rate_20d_pct_min"), null);
});

test("component uses two panes, modal picker, and explicit draft-to-applied search", () => {
    assert.match(component, /className="screener-workspace"/);
    assert.match(component, /className="screener-condition-pane"/);
    assert.match(component, /className="screener-result-pane"/);
    assert.match(component, /role="dialog" aria-modal="true"/);
    assert.match(component, /const \[draftFilters, setDraftFiltersState\]/);
    assert.match(component, /snapshotFilterState\(draftFiltersRef\.current\)/);
    assert.match(component, /const \[appliedFilters, setAppliedFilters\]/);
    assert.doesNotMatch(component, /className="range-grid"/);
});
