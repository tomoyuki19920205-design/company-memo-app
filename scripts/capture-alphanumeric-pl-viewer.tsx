import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FinancialsTable from "../components/FinancialsTable";
import { buildFinancialTableModel } from "../lib/financial-table-model";
import {
    transformFinancialRows,
    type ViewerFinancialRow,
} from "../lib/financial-transform";

async function main() {
const tickers = ["418A", "472A", "4180", "4720"] as const;
const outputArg = process.argv.indexOf("--output");
if (outputArg < 0 || !process.argv[outputArg + 1]) {
    throw new Error("--output is required");
}
const output = resolve(process.argv[outputArg + 1]);
mkdirSync(output, { recursive: true });

const env: Record<string, string> = {};
for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    env[key] = parts.join("=").trim().replace(/^["']|["']$/g, "");
}
const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!baseUrl || !anonKey) throw new Error("Viewer Supabase environment is incomplete");

const generatedAt = new Date().toISOString();
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const command =
    "npm exec tsx scripts/capture-alphanumeric-pl-viewer.tsx -- --output " + output;
const endpoint = baseUrl + "/rest/v1/api_latest_financials_canonical";

const sha256 = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");

const report = (
    kind: string,
    filesAndFunctions: string[],
    results: unknown,
    remainingIssues: string[] = [],
) => ({
    generated_at: generatedAt,
    branch,
    commit,
    environment: "production Supabase PostgREST anon SELECT + local Company Viewer transform/SSR",
    command,
    kind,
    files_and_functions: filesAndFunctions,
    results,
    payload_sha256: sha256(JSON.stringify(results)),
    remaining_issues: remainingIssues,
});

const rawByTicker: Record<string, ViewerFinancialRow[]> = {};
const requests: Record<string, unknown> = {};
for (const ticker of tickers) {
    const params = new URLSearchParams({
        select: "ticker,period,quarter,sales,gross_profit,operating_profit,source,updated_at",
        ticker: "eq." + ticker,
        order: "period.desc,quarter.desc",
        limit: "100",
    });
    const url = endpoint + "?" + params.toString();
    const response = await fetch(url, {
        headers: {
            apikey: anonKey,
            Authorization: "Bearer " + anonKey,
        },
    });
    if (!response.ok) {
        throw new Error(ticker + " Viewer API failed: " + response.status + " " + await response.text());
    }
    rawByTicker[ticker] = await response.json() as ViewerFinancialRow[];
    requests[ticker] = {
        method: "GET",
        url,
        headers: {
            apikey: "[REDACTED]",
            Authorization: "Bearer [REDACTED]",
        },
        status: response.status,
        row_count: rawByTicker[ticker].length,
    };
}

const transformed: Record<string, ReturnType<typeof transformFinancialRows>> = {};
const cumulative: Record<string, unknown> = {};
const standalone: Record<string, unknown> = {};
const renderResults: Record<string, unknown> = {};

for (const ticker of tickers) {
    transformed[ticker] = transformFinancialRows(rawByTicker[ticker]);
    const model = buildFinancialTableModel(transformed[ticker]);
    cumulative[ticker] = model.cumulativeRows;
    standalone[ticker] = model.standaloneRows;

    const html = renderToStaticMarkup(
        <FinancialsTable data={transformed[ticker]} loading={false} segments={[]} />,
    );
    const htmlName = "viewer_render_" + ticker + ".html";
    writeFileSync(resolve(output, htmlName), html, "utf8");
    renderResults[ticker] = {
        props: {
            data: transformed[ticker],
            loading: false,
            segments: [],
        },
        cumulative_rows: model.cumulativeRows,
        standalone_rows: model.standaloneRows,
        rendered_html: htmlName,
        rendered_html_sha256: sha256(html),
        rendered_row_attributes: {
            cumulative: model.cumulativeRows.map(
                (row) => ({ period: row.period, quarter: row.quarter }),
            ),
            standalone: model.standaloneRows.map(
                (row) => ({ period: row.period, quarter: row.quarter }),
            ),
        },
    };
}

const rowAt = (
    ticker: string,
    period: string,
    quarter: string,
) => (standalone[ticker] as Array<{
    period: string;
    quarter: string;
    sales: number | null;
    grossProfit: number | null;
    operatingProfit: number | null;
}>).find((row) => row.period === period && row.quarter === quarter);

const assertions = {
    api_nonempty_all_tickers: tickers.every((ticker) => rawByTicker[ticker].length > 0),
    ticker_identity_exact: tickers.every(
        (ticker) => rawByTicker[ticker].every((row) => row.ticker === ticker),
    ),
    uridoki_november_only: transformed["418A"].every(
        (row) => row.period.endsWith("-11-30"),
    ),
    mirrativ_december_only: transformed["472A"].every(
        (row) => row.period.endsWith("-12-31"),
    ),
    uridoki_1q_cumulative_equals_standalone:
        rowAt("418A", "2026-11-30", "1Q")?.sales === 545 &&
        rowAt("418A", "2026-11-30", "1Q")?.operatingProfit === 103,
    uridoki_2q_delta:
        rowAt("418A", "2026-11-30", "2Q")?.sales === 645 &&
        rowAt("418A", "2026-11-30", "2Q")?.operatingProfit === 116,
    uridoki_null_not_zero:
        rowAt("418A", "2026-11-30", "2Q")?.grossProfit === null,
    mirrativ_1q_cumulative_equals_standalone:
        rowAt("472A", "2026-12-31", "1Q")?.sales === 1952 &&
        rowAt("472A", "2026-12-31", "1Q")?.operatingProfit === 257,
    mirrativ_missing_3q_prevents_fy_standalone:
        rowAt("472A", "2025-12-31", "FY")?.sales === null &&
        rowAt("472A", "2025-12-31", "FY")?.grossProfit === null &&
        rowAt("472A", "2025-12-31", "FY")?.operatingProfit === null,
    numeric_issuers_normal:
        transformed["4180"].length > 0 && transformed["4720"].length > 0,
};
if (Object.values(assertions).some((value) => !value)) {
    throw new Error("Viewer verification failed: " + JSON.stringify(assertions));
}

writeFileSync(
    resolve(output, "viewer_api_samples.json"),
    JSON.stringify(report(
        "viewer_api_samples",
        [
            "lib/viewer-api.ts:loadFinancials",
            "lib/financial-transform.ts:transformFinancialRows",
            "Supabase PostgREST api_latest_financials_canonical",
        ],
        {
            endpoint,
            requests,
            raw_responses: rawByTicker,
            transformed_financials: transformed,
            assertions: {
                api_nonempty_all_tickers: assertions.api_nonempty_all_tickers,
                ticker_identity_exact: assertions.ticker_identity_exact,
            },
        },
    ), null, 2) + "\n",
    "utf8",
);

writeFileSync(
    resolve(output, "viewer_cumulative_pl_verification.json"),
    JSON.stringify(report(
        "viewer_cumulative_pl_verification",
        [
            "components/CompanyViewer.tsx",
            "lib/viewer-api.ts:loadFinancials",
            "lib/financial-table-model.ts:buildFinancialTableModel",
            "lib/quarter-math.ts:buildCumulativeRows",
        ],
        {
            cumulative_rows: cumulative,
            assertions: {
                uridoki_november_only: assertions.uridoki_november_only,
                mirrativ_december_only: assertions.mirrativ_december_only,
                numeric_issuers_normal: assertions.numeric_issuers_normal,
            },
        },
    ), null, 2) + "\n",
    "utf8",
);

writeFileSync(
    resolve(output, "viewer_standalone_quarter_verification.json"),
    JSON.stringify(report(
        "viewer_standalone_quarter_verification",
        [
            "lib/financial-table-model.ts:buildFinancialTableModel",
            "lib/quarter-math.ts:buildQStandaloneRows",
        ],
        {
            standalone_rows: standalone,
            assertions: {
                uridoki_1q_cumulative_equals_standalone:
                    assertions.uridoki_1q_cumulative_equals_standalone,
                uridoki_2q_delta: assertions.uridoki_2q_delta,
                uridoki_null_not_zero: assertions.uridoki_null_not_zero,
                mirrativ_1q_cumulative_equals_standalone:
                    assertions.mirrativ_1q_cumulative_equals_standalone,
                mirrativ_missing_3q_prevents_fy_standalone:
                    assertions.mirrativ_missing_3q_prevents_fy_standalone,
            },
        },
    ), null, 2) + "\n",
    "utf8",
);

writeFileSync(
    resolve(output, "viewer_render_path_report.json"),
    JSON.stringify(report(
        "viewer_render_path_report",
        [
            "app/page.tsx:ViewerPage",
            "components/CompanyViewer.tsx",
            "lib/viewer-api.ts:loadFinancials",
            "lib/financial-transform.ts:transformFinancialRows",
            "components/FinancialsTable.tsx",
            "lib/financial-table-model.ts:buildFinancialTableModel",
            "lib/quarter-math.ts:buildCumulativeRows/buildQStandaloneRows",
        ],
        {
            endpoint: endpoint + "?ticker=eq.{ticker}",
            route_handler: "No Next.js route handler; browser Supabase client calls PostgREST directly",
            api_client: "lib/viewer-api.ts:loadFinancials",
            build_q_standalone_caller:
                "lib/financial-table-model.ts:buildFinancialTableModel, called by FinancialsTable",
            financials_table_props:
                "FinancialsTableProps { data: FinancialRecord[], loading, selection/callback/memo/segment/KPI props }",
            cumulative_standalone_switch:
                "FinancialsTable renders side-by-side cumulativeRows and standaloneRows tables",
            local_browser:
                "Next.js started successfully; interactive page required an authenticated browser session, so exact component SSR was used",
            render_results: renderResults,
            assertions,
        },
        [
            "Interactive localhost browser was authentication-gated; SSR used the exact FinancialsTable component and production data path.",
        ],
    ), null, 2) + "\n",
    "utf8",
);

console.log(JSON.stringify({
    generated_at: generatedAt,
    output,
    row_counts: Object.fromEntries(
        tickers.map((ticker) => [ticker, rawByTicker[ticker].length]),
    ),
    assertions,
}));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
