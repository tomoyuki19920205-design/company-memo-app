export interface FinancialRecord {
    ticker: string;
    period: string;
    quarter: string;
    sales: number | null;
    gross_profit: number | null;
    selling_general_and_administrative_expenses?: number | null;
    operating_profit: number | null;
    profit_before_tax: number | null;
    ordinary_profit: number | null;
    net_income: number | null;
    eps: number | null;
    source: string;
    updated_at: string;
    /** Optional provenance when a data source exposes statement scope. */
    consolidation_scope?: "consolidated" | "non_consolidated";
}
