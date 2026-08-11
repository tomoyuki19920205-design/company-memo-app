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
    assert.match(html, /営業利益/);
    assert.doesNotMatch(html, /税引前利益/);
});

test("FinancialsTable preserves the approved 5713 PBT presentation", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "5713", period: "2026-03-31", quarter: "1Q", sales: 379_600, gross_profit: null, operating_profit: null, profit_before_tax: 37_901, source: "tdnet_xbrl", updated_at: "" },
        { ticker: "5713", period: "2026-03-31", quarter: "2Q", sales: 783_361, gross_profit: null, operating_profit: null, profit_before_tax: 77_815, source: "tdnet_xbrl", updated_at: "" },
        { ticker: "5713", period: "2026-03-31", quarter: "3Q", sales: 1_250_721, gross_profit: null, operating_profit: null, profit_before_tax: 148_258, source: "tdnet_xbrl", updated_at: "" },
        { ticker: "5713", period: "2026-03-31", quarter: "FY", sales: 1_741_586, gross_profit: null, operating_profit: null, profit_before_tax: 255_680, source: "tdnet_xbrl", updated_at: "" },
    ];
    const records = transformFinancialRows(rows);
    const html = renderToStaticMarkup(
        <FinancialsTable data={records} loading={false} segments={[]} />,
    );

    assert.ok(records.every((item) => item.operating_profit === null));
    assert.match(html, /税引前利益/);
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "FY"), />255,680</);
    assert.match(rowMarkup(html, "standalone", "2026-03-31", "2Q"), />39,914</);
    assert.match(rowMarkup(html, "standalone", "2026-03-31", "3Q"), />70,443</);
    assert.match(rowMarkup(html, "standalone", "2026-03-31", "FY"), />107,422</);
});

test("FinancialsTable presents PBT for the four newly configured exact tickers", () => {
    for (const ticker of ["2282", "8031", "8058", "4819"]) {
        const rows: ViewerFinancialRow[] = [
            { ticker, period: "2027-03-31", quarter: "1Q", sales: 100, gross_profit: null, operating_profit: null, profit_before_tax: 30, source: "jquants", updated_at: "" },
            { ticker, period: "2027-03-31", quarter: "2Q", sales: 250, gross_profit: null, operating_profit: null, profit_before_tax: 75, source: "jquants", updated_at: "" },
        ];
        const records = transformFinancialRows(rows);
        const html = renderToStaticMarkup(
            <FinancialsTable data={records} loading={false} segments={[]} />,
        );

        assert.ok(records.every((item) => item.operating_profit === null));
        assert.match(html, /税引前利益/);
        assert.match(rowMarkup(html, "cumulative", "2027-03-31", "2Q"), />75</);
        assert.match(rowMarkup(html, "standalone", "2027-03-31", "2Q"), />45</);
    }
});

test("FinancialsTable presents PBT for the six financial IFRS issuers", () => {
    for (const ticker of ["7198", "8473", "8698", "8253", "7157", "8630"]) {
        const rows: ViewerFinancialRow[] = [
            { ticker, period: "2026-03-31", quarter: "1Q", sales: 100, gross_profit: null, operating_profit: null, profit_before_tax: 30, source: "jquants", updated_at: "" },
            { ticker, period: "2026-03-31", quarter: "2Q", sales: 250, gross_profit: null, operating_profit: null, profit_before_tax: 75, source: "jquants", updated_at: "" },
        ];
        const records = transformFinancialRows(rows);
        const html = renderToStaticMarkup(
            <FinancialsTable data={records} loading={false} segments={[]} />,
        );

        assert.ok(records.every((item) => item.operating_profit === null));
        assert.match(html, /税引前利益/);
        assert.match(rowMarkup(html, "cumulative", "2026-03-31", "2Q"), />75</);
        assert.match(rowMarkup(html, "standalone", "2026-03-31", "2Q"), />45</);
    }
});

test("8630 legacy JGAAP rows never consume PBT while IFRS rows do", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "8630", period: "2025-03-31", quarter: "3Q", sales: 900, gross_profit: null, operating_profit: 80, profit_before_tax: 999, source: "jquants", updated_at: "" },
        { ticker: "8630", period: "2025-03-31", quarter: "FY", sales: 1_200, gross_profit: null, operating_profit: null, profit_before_tax: 120, source: "jquants", updated_at: "" },
        { ticker: "8630", period: "2026-03-31", quarter: "1Q", sales: 300, gross_profit: null, operating_profit: null, profit_before_tax: 25, source: "jquants", updated_at: "" },
    ];
    const html = renderToStaticMarkup(
        <FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />,
    );

    assert.match(rowMarkup(html, "cumulative", "2025-03-31", "3Q"), />80</);
    assert.doesNotMatch(rowMarkup(html, "cumulative", "2025-03-31", "3Q"), />999</);
    assert.match(rowMarkup(html, "cumulative", "2025-03-31", "FY"), />120</);
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "1Q"), />25</);
    assert.doesNotMatch(rowMarkup(html, "standalone", "2025-03-31", "FY"), />40</);
});

test("8253 FY2026 never revives nonconsolidated operating income 55,536", () => {
    const rows: ViewerFinancialRow[] = [{
        ticker: "8253",
        period: "2026-03-31",
        quarter: "FY",
        sales: 420_000,
        gross_profit: null,
        operating_profit: null,
        profit_before_tax: 88_000,
        source: "jquants",
        updated_at: "",
    }];
    const html = renderToStaticMarkup(
        <FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />,
    );

    assert.match(html, /税引前利益/);
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "FY"), />88,000</);
    assert.doesNotMatch(html, /55,536/);
});

test("7203, 7741, and excluded 8053 retain operating-profit presentation", () => {
    const controls = [
        { ticker: "7203", operatingProfit: 100 },
        { ticker: "7741", operatingProfit: 82_626 },
        { ticker: "8053", operatingProfit: 200 },
    ];
    for (const { ticker, operatingProfit } of controls) {
        const rows: ViewerFinancialRow[] = [{
            ticker,
            period: "2027-03-31",
            quarter: "1Q",
            sales: 1_000,
            gross_profit: null,
            operating_profit: operatingProfit,
            profit_before_tax: 999_999,
            source: "tdnet_xbrl",
            updated_at: "",
        }];
        const records = transformFinancialRows(rows);
        const html = renderToStaticMarkup(
            <FinancialsTable data={records} loading={false} segments={[]} />,
        );

        assert.match(html, /営業利益/);
        assert.doesNotMatch(html, /税引前利益/);
        assert.match(
            rowMarkup(html, "cumulative", "2027-03-31", "1Q"),
            new RegExp(operatingProfit.toLocaleString("en-US")),
        );
        assert.doesNotMatch(html, /999,999/);
    }
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

test("8113 forecast remains available but never enters the actual PL model", () => {
    const rows: ViewerFinancialRow[] = [
        {
            ticker: "8113",
            period: "2025-12-31",
            quarter: "FY",
            sales: 989_000,
            gross_profit: null,
            operating_profit: null,
            source: "jquants",
            updated_at: "2026-02-13T15:00:00+09:00",
        },
        {
            ticker: "8113",
            period: "2025-12-31",
            quarter: "FY",
            sales: null,
            gross_profit: null,
            operating_profit: 146_000,
            source: "jquants_nxf",
            updated_at: "2025-02-14T15:00:00+09:00",
        },
    ];

    const model = buildFinancialTableModel(transformFinancialRows(rows));

    assert.equal(model.cumulativeRows.length, 1);
    assert.equal(model.cumulativeRows[0].operatingProfit, null);
    assert.equal(model.forecastFYRows.length, 1);
    assert.equal(model.forecastFYRows[0].operating_profit, 146_000);
    assert.equal(model.forecastFYRows[0].source, "jquants_nxf");
});

test("actual/forecast view migration prevents metric-level scope mixing", () => {
    const migration = readFileSync(
        fileURLToPath(
            new URL(
                "../migrations/010_split_actual_and_forecast_financial_views.sql",
                import.meta.url,
            ),
        ),
        "utf8",
    );

    assert.match(migration, /CREATE OR REPLACE VIEW public\.api_latest_financials_canonical AS/);
    assert.match(migration, /source NOT IN \([\s\S]*'jquants_nxf'/);
    assert.match(migration, /CREATE OR REPLACE VIEW public\.api_latest_financials_canonical_forecast AS/);
    assert.match(migration, /source IN \([\s\S]*'jquants_nxf'/);
});

test("PBT view migration exposes the metric while preserving scope separation", () => {
    const migration = readFileSync(
        fileURLToPath(
            new URL(
                "../migrations/011_add_profit_before_tax_to_financial_views.sql",
                import.meta.url,
            ),
        ),
        "utf8",
    );

    assert.match(migration, /metric = 'profit_before_tax'/);
    assert.match(migration, /source NOT IN \([\s\S]*'jquants_nxf'/);
    assert.match(migration, /source IN \([\s\S]*'jquants_nxf'/);
});
