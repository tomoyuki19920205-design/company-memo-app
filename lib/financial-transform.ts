import type { FinancialRecord } from "../types/financial";

export interface ViewerFinancialRow {
    ticker: string;
    period: string;
    quarter: string;
    sales: number | null;
    gross_profit: number | null;
    operating_profit: number | null;
    profit_before_tax?: number | null;
    source: string | null;
    updated_at: string | null;
}

const QUARTER_ORDER: Record<string, number> = {
    "1Q": 0,
    "2Q": 1,
    "3Q": 2,
    "4Q": 3,
    "FY": 4,
};

export function transformFinancialRows(rows: ViewerFinancialRow[]): FinancialRecord[] {
    const records = rows.map((row) => ({
        ticker: row.ticker,
        period: row.period,
        quarter: row.quarter,
        sales: row.sales,
        gross_profit: row.gross_profit,
        operating_profit: row.operating_profit,
        profit_before_tax: row.profit_before_tax ?? null,
        ordinary_profit: null,
        net_income: null,
        eps: null,
        source: row.source ?? "",
        updated_at: row.updated_at ?? "",
    }));

    return records.sort((a, b) => {
        const periodCmp = (b.period || "").localeCompare(a.period || "");
        if (periodCmp !== 0) return periodCmp;
        const qa = QUARTER_ORDER[a.quarter] ?? 9;
        const qb = QUARTER_ORDER[b.quarter] ?? 9;
        return qb - qa;
    });
}
