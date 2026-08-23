import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCREENER_METRICS } from "../lib/screener";
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

const component = readFileSync(new URL("../components/ScreenerPage.tsx", import.meta.url), "utf8");

test("detailed picker is generated from every numeric and boolean screening definition", () => {
    assert.equal(DETAILED_FILTER_DEFINITIONS.length, SCREENER_METRICS.length + 4);
    assert.ok(DETAILED_FILTER_DEFINITIONS.some((item) => item.key === "new_ytd_high_last_5d" && item.kind === "boolean"));
    assert.ok(DETAILED_FILTER_DEFINITIONS.some((item) => item.key === "forward_per_per_forecast_sales_growth"));
    assert.deepEqual(filterDetailedDefinitions("PER").map((item) => item.key), [
        "forward_per", "actual_per", "forward_per_per_forecast_sales_growth",
    ]);
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
    draft.markets.push("0113");
    draft.ranges.forward_per.max = "20";
    const pageTwo = new URLSearchParams(buildScreenerQuery({ page: 2, filters: applied, columns: ["forward_per"], sort: "forward_per", direction: "asc" }));
    assert.equal(pageTwo.get("markets"), "0111");
    assert.equal(pageTwo.get("forward_per_max"), "15");
    assert.equal(pageTwo.get("page"), "2");
});

test("component uses two panes, modal picker, and explicit draft-to-applied search", () => {
    assert.match(component, /className="screener-workspace"/);
    assert.match(component, /className="screener-condition-pane"/);
    assert.match(component, /className="screener-result-pane"/);
    assert.match(component, /role="dialog" aria-modal="true"/);
    assert.match(component, /const \[draftFilters, setDraftFilters\]/);
    assert.match(component, /const \[appliedFilters, setAppliedFilters\]/);
    assert.match(component, /const next = snapshotFilterState\(draftFilters\)/);
    assert.doesNotMatch(component, /className="range-grid"/);
});
