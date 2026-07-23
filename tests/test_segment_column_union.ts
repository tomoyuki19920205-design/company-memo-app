import assert from "node:assert/strict";
import test from "node:test";

import {
    buildSegmentColumnUnion,
    buildSegmentValueMap,
    type SegmentColumnIdentityInput,
} from "../lib/segment-column-union";


const key = (name: string) => name.toLowerCase().replace(/\s+/g, "");
const row = (
    period: string,
    segment_name: string,
    segment_order?: number,
): SegmentColumnIdentityInput => ({ period, segment_name, segment_order });


test("latest FY columns retain their existing order", () => {
    const latest = [row("2026-03-31", "Beta"), row("2026-03-31", "Alpha")];
    assert.deepEqual(
        buildSegmentColumnUnion(latest, latest, key).map((item) => item.displayKey),
        ["beta", "alpha"],
    );
});

test("historical-only columns are appended", () => {
    const latest = [row("2026-03-31", "Current")];
    const all = [...latest, row("2025-03-31", "Historical")];
    assert.deepEqual(
        buildSegmentColumnUnion(all, latest, key).map((item) => item.displayKey),
        ["current", "historical"],
    );
});

test("historical order is newest period then segment order then identity", () => {
    const latest = [row("2026-03-31", "Current")];
    const all = [
        ...latest,
        row("2024-03-31", "Old"),
        row("2025-03-31", "Second", 2),
        row("2025-03-31", "First", 1),
        row("2025-03-31", "Alpha", 2),
    ];
    assert.deepEqual(
        buildSegmentColumnUnion(all, latest, key).map((item) => item.displayKey),
        ["current", "first", "alpha", "second", "old"],
    );
});

test("aliases with one canonical identity remain one column", () => {
    const canonicalKey = (name: string) =>
        name === "Automotive alias" ? "automotive-id" : key(name);
    const latest = [row("2026-03-31", "Automotive")];
    const all = [...latest, row("2025-03-31", "Automotive alias")];
    const groups = buildSegmentColumnUnion(
        all,
        latest,
        (name) => name.startsWith("Automotive") ? "automotive-id" : canonicalKey(name),
    );
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].names, ["Automotive", "Automotive alias"]);
});

test("different canonical identities remain separate despite similar labels", () => {
    const latest = [row("2026-03-31", "Construction Business")];
    const all = [
        ...latest,
        row("2025-03-31", "Construction Business Consulting"),
    ];
    assert.equal(buildSegmentColumnUnion(all, latest, key).length, 2);
});

test("multiple equivalent references do not duplicate a column", () => {
    const latest = [row("2026-03-31", "Automotive")];
    const all = [
        ...latest,
        row("2025-03-31", "Automotive"),
        row("2025-03-31", "Automotive"),
    ];
    assert.equal(buildSegmentColumnUnion(all, latest, key).length, 1);
});

test("unique-baseline provenance row is displayed once", () => {
    const latest = [row("2025-08-31", "Current")];
    const all = [
        ...latest,
        row("2024-08-31", "A0Public Relations Consulting"),
    ];
    const groups = buildSegmentColumnUnion(all, latest, key);
    assert.equal(groups.filter((item) => item.displayKey === "a0publicrelationsconsulting").length, 1);
});

test("all 14 fixed regression identities enter the union", () => {
    const missingNames = [
        "Automotive",
        "The Americas Food And Beverages",
        "CIVILENGINEERINGBUSINESS",
        "ENVIRONMENTALDEVELOPMENTBUSINESS",
        "Total Of Reportable Segments And Others Member 208269",
        "Total Of Reportable Segments And Others Member 209429",
        "A0Public Relations Consulting",
        "CONSTRUCTIONBUSINESS Reportable Sugments Member",
        "Civil Engineering And Construction Consult",
        "Total Of Reportable Segments And Others Member 213107",
        "Contracted Cell Manufacturing Business",
        "Renewable Energy Business",
        "Total Of Reportable Segments And Others Member 220541",
        "Total Of Reportable Segments And Others Member 221112",
    ];
    const latest = [row("2026-12-31", "Current")];
    const all = [
        ...latest,
        ...missingNames.map((name, index) =>
            row(`2025-${String((index % 12) + 1).padStart(2, "0")}-28`, name, index),
        ),
    ];
    const keys = new Set(
        buildSegmentColumnUnion(all, latest, key).map((item) => item.displayKey),
    );
    assert.equal(missingNames.filter((name) => !keys.has(key(name))).length, 0);
    assert.equal(keys.size, 15);
});

test("all 14 fixed regression values land in the correct period cells", () => {
    const fixtures = [
        ["192826", "2025-03-31", "FY", "Automotive", 433625, null],
        ["195434", "2025-03-31", "FY", "The Americas Food And Beverages", 91822, 25769],
        ["207992", "2025-06-30", "1Q", "CIVILENGINEERINGBUSINESS", 1042, 52],
        ["207993", "2025-06-30", "1Q", "ENVIRONMENTALDEVELOPMENTBUSINESS", 16, 8],
        ["208269", "2025-03-31", "FY", "Total Of Reportable Segments And Others Member 208269", 1142137, 32145],
        ["209429", "2025-12-31", "2Q", "Total Of Reportable Segments And Others Member 209429", 1338, 399],
        ["209543", "2024-08-31", "FY", "A0Public Relations Consulting", 4521, 1075],
        ["210649", "2025-06-30", "1Q", "CONSTRUCTIONBUSINESS Reportable Sugments Member", 596, -27],
        ["212501", "2025-03-31", "1Q", "Civil Engineering And Construction Consult", 10, -50],
        ["213107", "2026-03-31", "1Q", "Total Of Reportable Segments And Others Member 213107", 16845, 1406],
        ["217238", "2024-09-30", "FY", "Contracted Cell Manufacturing Business", 768, -374],
        ["219810", "2025-03-31", "2Q", "Renewable Energy Business", null, -46],
        ["220541", "2026-03-31", "1Q", "Total Of Reportable Segments And Others Member 220541", 8704, 647],
        ["221112", "2026-03-31", "1Q", "Total Of Reportable Segments And Others Member 221112", 46874, null],
    ] as const;
    const segments = fixtures.map(([, period, quarter, segment_name, sales, profit]) => ({
        period,
        quarter,
        segment_name,
        segment_sales: sales,
        segment_profit: profit,
    }));
    const groups = buildSegmentColumnUnion(segments, [], key);
    const columns = groups.map((group) => ({
        display_key: group.displayKey,
        salesKey: `seg:${group.displayKey}:sales`,
        profitKey: `seg:${group.displayKey}:profit`,
    }));
    const values = buildSegmentValueMap(segments, columns, key);
    for (const [, period, quarter, name, sales, profit] of fixtures) {
        const displayKey = key(name);
        const periodValues = values.get(`${period}|${quarter}`);
        assert.ok(periodValues);
        assert.equal(periodValues[`seg:${displayKey}:sales`], sales);
        assert.equal(periodValues[`seg:${displayKey}:profit`], profit);
    }
});

test("zero and missing remain distinct in cell assignment", () => {
    const columns = [{
        display_key: "segment",
        salesKey: "seg:segment:sales",
        profitKey: "seg:segment:profit",
    }];
    const values = buildSegmentValueMap(
        [{
            period: "2025-03-31",
            quarter: "FY",
            segment_name: "Segment",
            segment_sales: 0,
            segment_profit: null,
        }],
        columns,
        key,
    );
    assert.equal(values.get("2025-03-31|FY")?.["seg:segment:sales"], 0);
    assert.equal(values.get("2025-03-31|FY")?.["seg:segment:profit"], null);
});

test("stale repair representatives remain in the union", () => {
    const latest = [
        row("2025-03-31", "Steel Structures Construction Business"),
        row("2025-03-31", "Real Estate Business"),
    ];
    assert.deepEqual(
        buildSegmentColumnUnion(latest, latest, key).map((item) => item.displayKey),
        ["steelstructuresconstructionbusiness", "realestatebusiness"],
    );
});

test("empty canonical winner input creates no quarantine or zero-payload columns", () => {
    assert.deepEqual(buildSegmentColumnUnion([], [], key), []);
});

test("empty and duplicate display keys are ignored safely", () => {
    const rows = [row("2025-03-31", ""), row("2025-03-31", "")];
    assert.deepEqual(buildSegmentColumnUnion(rows, [], key), []);
});

test("period order is deterministic across repeated calls", () => {
    const latest = [row("2026-03-31", "Current")];
    const all = [
        ...latest,
        row("2025-03-31", "Zeta"),
        row("2025-03-31", "Alpha"),
        row("2024-03-31", "Beta"),
    ];
    const first = buildSegmentColumnUnion(all, latest, key);
    const second = buildSegmentColumnUnion(all, latest, key);
    assert.deepEqual(first, second);
});
