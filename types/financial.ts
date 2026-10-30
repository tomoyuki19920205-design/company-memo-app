export interface FinancialRecord {
    ticker: string;
    period: string;
    quarter: string;
    sales: number | null;
    cost_of_sales?: number | null;
    gross_profit: number | null;
    selling_general_and_administrative_expenses?: number | null;
    operating_profit: number | null;
    non_operating_income?: number | null;
    non_operating_expenses?: number | null;
    profit_before_tax: number | null;
    ordinary_profit: number | null;
    extraordinary_income?: number | null;
    extraordinary_losses?: number | null;
    income_taxes?: number | null;
    net_income: number | null;
    eps: number | null;
    source: string;
    updated_at: string;
    /** Optional provenance when a data source exposes statement scope. */
    consolidation_scope?: "consolidated" | "non_consolidated";
}
