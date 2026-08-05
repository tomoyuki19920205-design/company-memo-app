import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FinancialsTable from "../components/FinancialsTable";
import { buildFinancialTableModel } from "../lib/financial-table-model";
import {
    transformFinancialRows,
    type ViewerFinancialRow,
} from "../lib/financial-transform";

const fixturePath = fileURLToPath(
    new URL("./fixtures/alphanumeric-pl-viewer.json", import.meta.url),
);
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
    string,
    ViewerFinancialRow[]
>;

const rowMarkup = (
    html: string,
    table: "cumulative" | "standalone",
    period: string,
    quarter: string,
) => {
    const pattern = new RegExp(
        "<tr[^>]*data-table=\"" + table +
        "\"[^>]*data-period=\"" + period +
        "\"[^>]*data-quarter=\"" + quarter +
        "\"[^>]*>([\\s\\S]*?)</tr>",
    );
    return pattern.exec(html)?.[1] ?? "";
};

test("viewer API transformation preserves nullable values and deterministic order", () => {
    const records = transformFinancialRows(fixtures["418A"]);
    assert.deepEqual(
        records.map((item) => item.period + ":" + item.quarter),
        [
            "2026-11-30:2Q",
            "2026-11-30:1Q",
            "2025-11-30:FY",
            "2025-11-30:3Q",
        ],
    );
    assert.equal(records[0].gross_profit, null);
});

test("financial table model keeps alpha issuers separate from numeric issuers", () => {
    const uridoki = buildFinancialTableModel(transformFinancialRows(fixtures["418A"]));
    const mirrativ = buildFinancialTableModel(transformFinancialRows(fixtures["472A"]));

    assert.ok(uridoki.cumulativeRows.every((item) => item.period.endsWith("-11-30")));
    assert.ok(mirrativ.cumulativeRows.every((item) => item.period.endsWith("-12-31")));
    assert.equal(
        uridoki.standaloneRows.find((item) => item.period === "2026-11-30" && item.quarter === "2Q")!.sales,
        645,
    );
    assert.equal(
        mirrativ.standaloneRows.find((item) => item.period === "2025-12-31" && item.quarter === "FY")!.sales,
        null,
    );

    const appierValues = new Set(fixtures["4180"].map((item) => item.sales));
    const johnanValues = new Set(fixtures["4720"].map((item) => item.sales));
    assert.ok(uridoki.cumulativeRows.every((item) => !appierValues.has(item.sales ?? NaN)));
    assert.ok(mirrativ.cumulativeRows.every((item) => !johnanValues.has(item.sales ?? NaN)));
});

test("FinancialsTable SSR renders correct cumulative and standalone rows for 418A", () => {
    const html = renderToStaticMarkup(
        <FinancialsTable
            data={transformFinancialRows(fixtures["418A"])}
            loading={false}
            segments={[]}
        />,
    );
    const q1 = rowMarkup(html, "standalone", "2026-11-30", "1Q");
    const q2 = rowMarkup(html, "standalone", "2026-11-30", "2Q");

    assert.match(q1, />545</);
    assert.match(q1, />103</);
    assert.match(q2, />645</);
    assert.match(q2, />116</);
    assert.match(q2, />–</);
    assert.doesNotMatch(html, /2025-12-31/);
});

test("FinancialsTable SSR keeps 472A FY cumulative but renders no fabricated Q4", () => {
    const html = renderToStaticMarkup(
        <FinancialsTable
            data={transformFinancialRows(fixtures["472A"])}
            loading={false}
            segments={[]}
        />,
    );
    const cumulativeFY = rowMarkup(html, "cumulative", "2025-12-31", "FY");
    const standaloneFY = rowMarkup(html, "standalone", "2025-12-31", "FY");
    const standaloneQ1 = rowMarkup(html, "standalone", "2026-12-31", "1Q");

    assert.match(cumulativeFY, />7,188</);
    assert.doesNotMatch(standaloneFY, /7,188|2,276|349/);
    assert.match(standaloneFY, />–</);
    assert.match(standaloneQ1, />1,952</);
    assert.match(standaloneQ1, />257</);
    assert.doesNotMatch(html, /2026-03-31/);
});
