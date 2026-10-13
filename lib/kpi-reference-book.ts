import type { FinancialRecord } from "../types/financial";
import type { KpiValueMap } from "./kpi-api";
import { buildFinancialTableModel } from "./financial-table-model";
import { FORECAST_SOURCES, buildCumulativeRows, buildQStandaloneRows, sortForDisplay } from "./quarter-math";
import { selectProfitDisplay } from "./company-profit-display";
import type { Book, ReferenceCell, Target } from "./kpi-formula";

export const kpiMapKey = (target: Target) => `${target.scope}|${target.period}|${target.quarter}`;
export const kpiSlot = (target: Target) => Number(target.metric.slice(4));
export function buildKpiBook(ticker: string, data: FinancialRecord[], values: KpiValueMap, industry?: string | null): Book {
    const model = buildFinancialTableModel(data, industry);
    // Append still-loaded history outside the five-period display window. Existing
    // formulas keep reading that period when a new FY pushes it off the screen.
    const actual = sortForDisplay(data.filter(record => !FORECAST_SOURCES.has(record.source ?? "")));
    const visible = new Set(model.cumulativeRows.map(row => `${row.period}|${row.quarter}`));
    const cumulativeRows = [...model.cumulativeRows, ...buildCumulativeRows(actual, industry).filter(row => !visible.has(`${row.period}|${row.quarter}`))];
    const standaloneRows = [...model.standaloneRows, ...buildQStandaloneRows(actual, industry).filter(row => !visible.has(`${row.period}|${row.quarter}`))];
    const recordFor = (period: string, quarter: string, forecast: boolean, source?: string) => data.find(record =>
        record.period === period && record.quarter === quarter && FORECAST_SOURCES.has(record.source ?? "") === forecast && (!source || record.source === source));
    const make = (period: string, quarter: string, scope: "cum" | "q", forecast: boolean, record: FinancialRecord | undefined,
        amounts: (number | null)[], profit: { metric: string | null; label: string; marginLabel: string }) => {
        const basis = record?.consolidation_scope ?? "unknown";
        const metrics = ["sales", "gross_profit", "gross_margin", "sg_and_a", profit.metric ?? "missing_profit", `margin:${profit.metric ?? "missing_profit"}`, "net_income", "eps"];
        const labels = ["売上高", "売上総利益", "粗利率", "販管費", profit.label, profit.marginLabel, "純利益", "EPS"];
        return amounts.map((value, col): ReferenceCell => {
            const unit = col === 2 || col === 5 ? "割合（1 = 100%）" : col === 7 ? "円" : "百万円";
            return {
                target: { ticker, period, quarter, scope, kind: forecast ? "forecast" : "actual", basis, metric: metrics[col] },
                // api_financials already returns money in million_yen; EPS remains yen.
                value: value === null ? null : col === 2 || col === 5 ? value / 100 : value,
                label: `${period} ${quarter} ${forecast ? "予想" : scope === "q" ? "単独四半期実績" : "累計実績"} / ${basis === "consolidated" ? "連結" : basis === "non_consolidated" ? "非連結" : "連結区分未記録"} / ${labels[col]}`,
                unit,
            };
        });
    };
    const cumulative = cumulativeRows.map(row => {
        const record = recordFor(row.period, row.quarter, false, row.source);
        return make(row.period, row.quarter, "cum", false, record,
            [row.sales, row.grossProfit, row.grossMarginRate, row.sgAndA, row.operatingProfit, row.opMargin, record?.net_income ?? null, record?.eps ?? null], row.profitDisplay);
    });
    const standalone = standaloneRows.map(row => {
        const record = recordFor(row.period, row.quarter, false);
        // EPS and net income are not standalone fields in the existing PL model.
        // Never silently reuse their cumulative values in a standalone reference.
        return make(row.period, row.quarter, "q", false, record,
            [row.sales, row.grossProfit, row.grossMarginRate, row.sgAndA, row.operatingProfit, row.opMargin, null, null], row.profitDisplay);
    });
    const forecast = model.forecastFYRows.map(record => {
        const profit = selectProfitDisplay(record, industry);
        const margin = record.sales !== null && record.sales !== 0 && profit.value !== null ? profit.value / record.sales * 100 : null;
        const cells = make(record.period, record.quarter, "cum", true, record, [record.sales, record.gross_profit, null, null, profit.value, margin, record.net_income, record.eps], profit);
        cells.push({ ...cells[4], target: { ...cells[4].target, metric: profit.metric === "ordinary_profit" ? "unshown_ordinary_profit" : "ordinary_profit" }, value: profit.metric === "ordinary_profit" ? null : record.ordinary_profit, label: cells[4].label.replace(profit.label, "経常利益") });
        return cells;
    });
    const kpi = cumulativeRows.map(row => [1, 2, 3].map(slot => ({
        target: { ticker, period: row.period, quarter: row.quarter, scope: "cum" as const, kind: "actual" as const, basis: "user", metric: `kpi_${slot}` },
        value: values[`cum|${row.period}|${row.quarter}`]?.[slot] ?? "",
        label: `${row.period} ${row.quarter} 累計 / KPI${slot}`, unit: "入力値",
    })));
    return { sheets: { CUM: cumulative, Q: standalone, FY: forecast, KPI: kpi }, visibleKpiRows: model.cumulativeRows.length };
}
