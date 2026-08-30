import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    appendCategorySelections,
    selectionStatus,
    updateAllSelections,
    updateCodeSelection,
} from "../lib/screener-category-filters";

const codes = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

test("market checkboxes support multiple code selections", () => {
    let selected: string[] = [];
    selected = updateCodeSelection(selected, "0111", true);
    selected = updateCodeSelection(selected, "0113", true);
    assert.deepEqual(selected, ["0111", "0113"]);
    selected = updateCodeSelection(selected, "0111", false);
    assert.deepEqual(selected, ["0113"]);
});

test("17-sector select-all supports all, none, indeterminate, and reselect-all", () => {
    const options = codes(17, "s17-");
    let selected = updateAllSelections(options, true);
    assert.equal(selected.length, 17);
    assert.deepEqual(selectionStatus(selected, options), { all: true, indeterminate: false, selectedCount: 17 });
    selected = updateCodeSelection(selected, options[4], false);
    assert.deepEqual(selectionStatus(selected, options), { all: false, indeterminate: true, selectedCount: 16 });
    selected = updateAllSelections(options, true);
    assert.equal(selected.length, 17);
    selected = updateAllSelections(options, false);
    assert.deepEqual(selected, []);
    assert.deepEqual(selectionStatus(selected, options), { all: false, indeterminate: false, selectedCount: 0 });
});

test("33-sector select-all supports all, none, and partial selection", () => {
    const options = codes(33, "s33-");
    let selected = updateAllSelections(options, true);
    assert.equal(selected.length, 33);
    selected = updateAllSelections(options, false);
    assert.equal(selected.length, 0);
    selected = options.slice(0, 3);
    assert.deepEqual(selectionStatus(selected, options), { all: false, indeterminate: true, selectedCount: 3 });
});

test("filter requests preserve exact category codes across pagination and sort", () => {
    const selections = { markets: ["0111", "0113"], sectors17: ["10", "15"], sectors33: ["2050"] };
    for (const [page, sort] of [["1", "market_cap"], ["2", "forward_per"]]) {
        const params = appendCategorySelections(new URLSearchParams({ page, sort }), selections);
        assert.equal(params.get("markets"), "0111,0113");
        assert.equal(params.get("sectors17"), "10,15");
        assert.equal(params.get("sectors33"), "2050");
        assert.equal(params.get("page"), page);
        assert.equal(params.get("sort"), sort);
    }
});

test("zero selections omit category filters and the component no longer renders select multiple", () => {
    const params = appendCategorySelections(new URLSearchParams(), { markets: [], sectors17: [], sectors33: [] });
    assert.equal(params.toString(), "");
    const component = readFileSync(new URL("../components/ScreenerPage.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(component, /<select\s+multiple/);
    assert.match(component, /\.indeterminate = status\.indeterminate/);
});
