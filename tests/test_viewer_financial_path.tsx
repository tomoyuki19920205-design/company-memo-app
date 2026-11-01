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

test("official 2221 upper-half revision appears before the independent FY guidance", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "2221", period: "2027-03-31", quarter: "1Q", sales: 7_000, gross_profit: null, operating_profit: 100, source: "jquants", updated_at: "" },
        { ticker: "2221", period: "2027-03-31", quarter: "2Q", sales: 14_880, gross_profit: null, operating_profit: -260, ordinary_profit: 1_100, net_income: 770, source: "tdnet_forecast", updated_at: "", disclosure_datetime: "2026-10-30T15:30:00+09:00", source_url: "https://www2.jpx.co.jp/disc/22210/140120261030560533.pdf", sales_accounting_scope: "consolidated", operating_profit_accounting_scope: "consolidated" },
        { ticker: "2221", period: "2027-03-31", quarter: "FY", sales: 30_600, gross_profit: null, operating_profit: 300, source: "jquants_forecast_fy", updated_at: "" },
    ];
    const html = renderToStaticMarkup(<FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />);
    const half = html.indexOf('data-forecast-quarter="2Q"');
    const full = html.indexOf('data-forecast-quarter="FY"');
    assert.ok(half >= 0 && full > half);
    assert.match(html.slice(half, full), /14,880/);
    assert.match(html.slice(half, full), /−260|−260|\-260/);
    assert.match(html.slice(full), /30,600/);
    assert.match(html.slice(half, full), /出典/);
});

test("official non-disclosure is distinct from unresolved guidance", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "1787", period: "2027-03-31", quarter: "1Q", sales: 4_000, gross_profit: null, operating_profit: 300, source: "jquants", updated_at: "" },
        { ticker: "1787", period: "2027-03-31", quarter: "2Q", sales: null, gross_profit: null, operating_profit: null, source: "tdnet_forecast", forecast_status: "not_disclosed", updated_at: "" },
        { ticker: "1787", period: "2027-03-31", quarter: "FY", sales: 15_200, gross_profit: null, operating_profit: 1_307, source: "jquants_forecast_fy", updated_at: "" },
    ];
    const html = renderToStaticMarkup(<FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />);
    assert.match(html, /最新2Q予想[\s\S]*非開示/);
    assert.match(html, /最新FY予想[\s\S]*15,200/);
});

test("bank 2Q guidance shows disclosed ordinary profit and net income without inventing operating profit", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "7380", period: "2027-03-31", quarter: "1Q", sales: 39_287, gross_profit: null, operating_profit: 11_235, source: "jquants", updated_at: "" },
        { ticker: "7380", period: "2027-03-31", quarter: "2Q", sales: null, gross_profit: null, operating_profit: null, ordinary_profit: 21_000, net_income: 14_500, source: "tdnet_forecast", updated_at: "" },
    ];
    const html = renderToStaticMarkup(<FinancialsTable data={transformFinancialRows(rows)} industry="銀行業" loading={false} segments={[]} />);
    const half = html.slice(html.indexOf('data-forecast-quarter="2Q"'));
    assert.match(half, /売上<\/span><span[^>]*>—/);
    assert.match(half, /営業利益<\/span><span[^>]*>—/);
    assert.match(half, /経常利益<\/span><span[^>]*>21,000/);
    assert.match(half, /親会社株主帰属純利益<\/span><span[^>]*>14,500/);
    assert.doesNotMatch(half, /取得未完了/);
});

test("published 2002 2Q actual suppresses old 2Q guidance and preserves FY", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "2002", period: "2027-03-31", quarter: "2Q", sales: 441_756, gross_profit: null, operating_profit: 22_823, source: "jquants", updated_at: "" },
        { ticker: "2002", period: "2027-03-31", quarter: "2Q", sales: 440_000, gross_profit: null, operating_profit: 20_000, source: "jquants_forecast", updated_at: "" },
        { ticker: "2002", period: "2027-03-31", quarter: "FY", sales: 900_000, gross_profit: null, operating_profit: 48_000, source: "jquants_forecast_fy", updated_at: "" },
    ];
    const html = renderToStaticMarkup(<FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />);
    assert.doesNotMatch(html, /data-forecast-quarter="2Q"/);
    assert.match(html, /data-forecast-quarter="FY"/);
    assert.match(rowMarkup(html, "cumulative", "2027-03-31", "2Q"), /441,756/);
});

test("later withdrawal takes precedence over a saved numeric 2Q forecast", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "2221", period: "2027-03-31", quarter: "2Q", sales: 14_880, gross_profit: null, operating_profit: -260, source: "tdnet_forecast", disclosure_datetime: "2026-10-30T06:00:00Z", updated_at: "" },
        { ticker: "2221", period: "2027-03-31", quarter: "2Q", sales: null, gross_profit: null, operating_profit: null, source: "tdnet_forecast", forecast_status: "withdrawn", disclosure_datetime: "2026-10-31T06:00:00Z", updated_at: "" },
    ];
    const html = renderToStaticMarkup(<FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />);
    const half = html.slice(html.indexOf('data-forecast-quarter="2Q"'));
    assert.match(half, /撤回/);
    assert.doesNotMatch(half, /14,880/);
});

test("June 20 fiscal end keeps 2Q and FY on the exact company period", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "7962", period: "2026-06-20", quarter: "FY", sales: 35_000, gross_profit: null, operating_profit: 900, source: "jquants", updated_at: "" },
        { ticker: "7962", period: "2027-06-20", quarter: "2Q", sales: 19_300, gross_profit: null, operating_profit: 200, source: "jquants_forecast", updated_at: "", sales_accounting_scope: "consolidated", operating_profit_accounting_scope: "consolidated" },
        { ticker: "7962", period: "2027-06-20", quarter: "FY", sales: 42_000, gross_profit: null, operating_profit: 1_440, source: "jquants_forecast_fy", updated_at: "" },
        { ticker: "7962", period: "2027-06-30", quarter: "FY", sales: 42_000, gross_profit: null, operating_profit: 1_440, source: "tdnet_forecast", updated_at: "" },
    ];
    const html = renderToStaticMarkup(<FinancialsTable data={transformFinancialRows(rows)} loading={false} segments={[]} />);
    const half = html.indexOf('data-forecast-quarter="2Q"');
    const full = html.indexOf('data-forecast-quarter="FY"');
    assert.match(html.slice(half, full), /2027-06-20[\s\S]*19,300/);
    assert.match(html.slice(full), /2027-06-20[\s\S]*42,000/);
    assert.doesNotMatch(html.slice(half, full), /2027-06-30/);
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

test("shared Viewer PL keeps 6623 and 9513 base tables without the added detail region", () => {
    const aichi = transformFinancialRows([
        { ticker: "6623", period: "2026-03-31", quarter: "1Q", sales: 30_000, gross_profit: 6_000, operating_profit: 2_000, source: "official_ir_verified", updated_at: "" },
        { ticker: "6623", period: "2026-03-31", quarter: "FY", sales: 129_382, gross_profit: 24_000, operating_profit: 11_153, source: "official_ir_verified", updated_at: "" },
    ]);
    const segments = [{
        ticker: "6623", period: "2026-03-31", quarter: "FY",
        segment_name: "電力機器", segment_sales: 38_004, segment_profit: 5_750,
        source: "official_ir_verified",
    }];
    const aichiHtml = renderToStaticMarkup(
        <FinancialsTable data={aichi} loading={false} segments={segments} />,
    );
    assert.match(rowMarkup(aichiHtml, "cumulative", "2026-03-31", "FY"), />129,382</);
    assert.match(rowMarkup(aichiHtml, "standalone", "2026-03-31", "1Q"), />30,000</);
    assert.match(rowMarkup(aichiHtml, "standalone", "2026-03-31", "FY"), />–</);
    assert.match(aichiHtml, /累計セグメント/);
    assert.match(aichiHtml, /電力機器/);
    assert.match(aichiHtml, />38,004</);

    const jpower = transformFinancialRows([
        { ticker: "9513", period: "2026-03-31", quarter: "FY", sales: 987_654, gross_profit: 150_000, operating_profit: 80_000, source: "jquants", updated_at: "" },
    ]);
    const jpowerHtml = renderToStaticMarkup(
        <FinancialsTable data={jpower} loading={false} segments={[]} />,
    );
    for (const html of [aichiHtml, jpowerHtml]) {
        assert.match(html, /累計PL（百万円）/);
        assert.match(html, /Q単体PL（百万円）/);
        assert.doesNotMatch(html, /PL詳細|累計PL詳細|Q単体PL詳細/);
    }
    assert.match(rowMarkup(jpowerHtml, "cumulative", "2026-03-31", "FY"), />987,654</);
    assert.doesNotMatch(jpowerHtml, /129,382|電力機器/);
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

test("JGAAP bank displays source ordinary profit and matching period labels", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "8316", period: "2026-03-31", quarter: "1Q", sales: 2_444_404, gross_profit: null, operating_profit: null, ordinary_profit: 483_337, source: "jquants", updated_at: "" },
        { ticker: "8316", period: "2026-03-31", quarter: "2Q", sales: 5_205_887, gross_profit: null, operating_profit: null, ordinary_profit: 1_278_123, source: "jquants", updated_at: "" },
    ];
    const records = transformFinancialRows(rows);
    const html = renderToStaticMarkup(
        <FinancialsTable data={records} industry="銀行業" loading={false} segments={[]} />,
    );
    assert.ok(records.every((item) => item.operating_profit === null));
    assert.match(html, /経常利益率/);
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "2Q"),
        /data-profit-metric="ordinary_profit"[^>]*>1,278,123/);
    assert.match(rowMarkup(html, "standalone", "2026-03-31", "2Q"), />794,786</);
    assert.doesNotMatch(html, /営業利益率/);
});

test("mixed financial subjects appear on their own rows and missing profit is an em dash", () => {
    const rows: ViewerFinancialRow[] = [
        { ticker: "8410", period: "2026-03-31", quarter: "1Q", sales: 100, gross_profit: null, operating_profit: 0, ordinary_profit: 10, source: "jquants", updated_at: "" },
        { ticker: "8410", period: "2026-03-31", quarter: "2Q", sales: 250, gross_profit: null, operating_profit: null, ordinary_profit: -20, source: "jquants", updated_at: "" },
        { ticker: "8410", period: "2026-03-31", quarter: "3Q", sales: 350, gross_profit: null, operating_profit: null, ordinary_profit: null, source: "jquants", updated_at: "" },
    ];
    const html = renderToStaticMarkup(
        <FinancialsTable data={transformFinancialRows(rows)} industry="銀行業" loading={false} segments={[]} />,
    );
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "1Q"), /営業利益<\/span>0/);
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "2Q"), /経常利益<\/span>-20/);
    assert.match(rowMarkup(html, "cumulative", "2026-03-31", "3Q"), /data-profit-metric="missing"[^>]*>—/);
    assert.match(rowMarkup(html, "standalone", "2026-03-31", "2Q"), /data-profit-metric="ordinary_profit"[^>]*><span[^>]*>経常利益<\/span>—/);
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
