import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    attachAndFilterCanonicalPbr,
    canonicalPbrForScreenerRow,
    parsePbrRange,
    sortRowsByPbr,
    type PbrSourceRow,
} from "../lib/screener-pbr";
import { DETAILED_FILTER_DEFINITIONS } from "../lib/screener-filter-definitions";
import {
    buildScreenerQuery,
    createInitialFilterState,
    snapshotFilterState,
} from "../lib/screener-filter-workflow";
import type { ScreenerRow } from "../lib/screener";

const routeSource = readFileSync(new URL("../app/api/screener/route.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/ScreenerPage.tsx", import.meta.url), "utf8");

function row(ticker: string, price: number | null = 100): ScreenerRow {
    return {
        ticker,
        company_name: ticker,
        latest_valid_price: price,
        price_as_of: "2026-09-16",
        market_cap: 1000,
    };
}

function bps(ticker: string, value: number | string | null, disclosedDate = "2026-08-01"): PbrSourceRow {
    return {
        ticker,
        period: "2026-03-31",
        quarter: "FY",
        disclosed_date: disclosedDate,
        bps: value,
    };
}

function tickers(rows: ScreenerRow[]): string[] {
    return rows.map((candidate) => String(candidate.ticker));
}

test("PBR is a valuation range beside PER with the requested label", () => {
    const keys = DETAILED_FILTER_DEFINITIONS.map((definition) => definition.key);
    assert.equal(DETAILED_FILTER_DEFINITIONS.find((definition) => definition.key === "pbr")?.label, "PBR（倍）");
    assert.equal(DETAILED_FILTER_DEFINITIONS.find((definition) => definition.key === "pbr")?.kind, "range");
    assert.equal(DETAILED_FILTER_DEFINITIONS.find((definition) => definition.key === "pbr")?.group, "バリュエーション");
    assert.equal(keys.indexOf("pbr"), keys.indexOf("actual_per") + 1);
});

test("canonical PBR reuses Viewer valuation, latest actual BPS, and split basis", () => {
    assert.equal(canonicalPbrForScreenerRow(
        row("A", 100),
        [bps("A", 100, "2026-05-01"), bps("A", 125, "2026-08-01")],
        [],
    ), 0.8);
    assert.equal(canonicalPbrForScreenerRow(
        row("B", 500),
        [bps("B", 400, "2026-06-16")],
        [{ ticker: "B", date: "2026-07-30", adj_factor: 0.5 }],
    ), 2.5);
});

test("missing, non-numeric, and nonpositive PBR inputs are null", () => {
    assert.equal(canonicalPbrForScreenerRow(row("A", null), [bps("A", 100)], []), null);
    assert.equal(canonicalPbrForScreenerRow(row("A", 0), [bps("A", 100)], []), null);
    assert.equal(canonicalPbrForScreenerRow(row("A", -1), [bps("A", 100)], []), null);
    assert.equal(canonicalPbrForScreenerRow(row("A"), [], []), null);
    assert.equal(canonicalPbrForScreenerRow(row("A"), [bps("A", "not-a-number")], []), null);
    assert.equal(canonicalPbrForScreenerRow(row("A"), [bps("A", 0)], []), null);
});

test("no PBR condition returns the exact original result, including missing values", () => {
    const rows = [row("NULL"), row("ZERO"), row("VALUE")];
    const result = attachAndFilterCanonicalPbr(rows, new Map([
        ["NULL", null], ["ZERO", 0], ["VALUE", 1.25],
    ]), { min: null, max: null, active: false });
    assert.strictEqual(result, rows);
});

test("PBR lower bound is numeric and inclusive for decimals", () => {
    const rows = [row("LOW"), row("BOUND"), row("HIGH"), row("NULL")];
    const result = attachAndFilterCanonicalPbr(rows, new Map([
        ["LOW", 0.79], ["BOUND", 0.8], ["HIGH", 1.25], ["NULL", null],
    ]), { min: 0.8, max: null, active: true });
    assert.deepEqual(tickers(result), ["BOUND", "HIGH"]);
});

test("PBR upper bound is numeric and inclusive for decimals", () => {
    const rows = [row("LOW"), row("BOUND"), row("HIGH"), row("NULL")];
    const result = attachAndFilterCanonicalPbr(rows, new Map([
        ["LOW", 0.8], ["BOUND", 1.25], ["HIGH", 1.251], ["NULL", null],
    ]), { min: null, max: 1.25, active: true });
    assert.deepEqual(tickers(result), ["LOW", "BOUND"]);
});

test("PBR two-sided range includes both exact boundaries", () => {
    const rows = [row("BELOW"), row("MIN"), row("MID"), row("MAX"), row("ABOVE")];
    const result = attachAndFilterCanonicalPbr(rows, new Map([
        ["BELOW", 0.799], ["MIN", 0.8], ["MID", 1], ["MAX", 1.25], ["ABOVE", 1.251],
    ]), { min: 0.8, max: 1.25, active: true });
    assert.deepEqual(tickers(result), ["MIN", "MID", "MAX"]);
});

test("null and missing PBR are excluded instead of treated as zero", () => {
    const rows = [row("MISSING"), row("NULL"), row("VALUE")];
    const result = attachAndFilterCanonicalPbr(rows, new Map([
        ["NULL", null], ["VALUE", 0.8],
    ]), { min: null, max: 1, active: true });
    assert.deepEqual(tickers(result), ["VALUE"]);
    assert.equal(result.some((candidate) => candidate.ticker === "MISSING" || candidate.ticker === "NULL"), false);
});

test("empty and invalid API values are ignored; reversed range matches nothing", () => {
    assert.deepEqual(parsePbrRange(new URLSearchParams("pbr_min=&pbr_max=abc")), {
        min: null, max: null, active: false,
    });
    const reversed = parsePbrRange(new URLSearchParams("pbr_min=1.25&pbr_max=0.8"));
    assert.deepEqual(reversed, { min: 1.25, max: 0.8, active: true });
    assert.deepEqual(attachAndFilterCanonicalPbr(
        [row("A"), row("B")],
        new Map([["A", 0.8], ["B", 1.25]]),
        reversed,
    ), []);
});

test("draft PBR changes only apply on search snapshot, survive page and sort, and reset", () => {
    const applied = createInitialFilterState();
    const draft = snapshotFilterState(applied);
    draft.detailedKeys.push("pbr");
    draft.ranges.pbr = { min: "0.8", max: "1.25" };

    const beforeSearch = new URLSearchParams(buildScreenerQuery({
        page: 1, filters: applied, columns: [], sort: "market_cap", direction: "desc",
    }));
    assert.equal(beforeSearch.get("pbr_min"), null);
    assert.equal(beforeSearch.get("pbr_max"), null);

    const afterSearch = snapshotFilterState(draft);
    const pageTwoSorted = new URLSearchParams(buildScreenerQuery({
        page: 2, filters: afterSearch, columns: ["pbr"], sort: "pbr", direction: "asc",
    }));
    assert.equal(pageTwoSorted.get("pbr_min"), "0.8");
    assert.equal(pageTwoSorted.get("pbr_max"), "1.25");
    assert.equal(pageTwoSorted.get("page"), "2");
    assert.equal(pageTwoSorted.get("sort"), "pbr");

    const reset = new URLSearchParams(buildScreenerQuery({
        page: 1, filters: createInitialFilterState(), columns: [], sort: "market_cap", direction: "desc",
    }));
    assert.equal(reset.get("pbr_min"), null);
    assert.equal(reset.get("pbr_max"), null);
});

test("PBR sorting is numeric, stable by ticker, and keeps null last", () => {
    const rows = [
        { ...row("C"), pbr: null },
        { ...row("B"), pbr: 1.25 },
        { ...row("A"), pbr: 0.8 },
        { ...row("D"), pbr: 1.25 },
    ];
    assert.deepEqual(tickers(sortRowsByPbr(rows, true)), ["A", "B", "D", "C"]);
    assert.deepEqual(tickers(sortRowsByPbr(rows, false)), ["B", "D", "A", "C"]);
});

test("API performs canonical PBR filtering before pagination and UI keeps explicit apply/reset flow", () => {
    assert.match(routeSource, /collectAllPages<ScreenerRow>/);
    assert.match(routeSource, /canonicalPbrForScreenerRow/);
    assert.match(routeSource, /attachAndFilterCanonicalPbr/);
    assert.match(routeSource, /rows\.slice\(from, from \+ pageSize\)/);
    assert.ok(routeSource.indexOf("attachAndFilterCanonicalPbr") < routeSource.lastIndexOf("rows.slice(from, from + pageSize)"));
    assert.match(componentSource, /snapshotFilterState\(draftFiltersRef\.current\)/);
    assert.match(componentSource, /setDraftFilters\(createInitialFilterState\(\)\)/);
});
