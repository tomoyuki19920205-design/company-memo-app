export type ProfitDisplayMetric = "operating_profit" | "profit_before_tax";

export interface CompanyProfitDisplayConfig {
    metric: ProfitDisplayMetric;
    label: "営業利益" | "税引前利益";
    marginLabel: "営業利益率" | "税引前利益率";
}

const DEFAULT_PROFIT_DISPLAY: CompanyProfitDisplayConfig = {
    metric: "operating_profit",
    label: "営業利益",
    marginLabel: "営業利益率",
};

const PBT_PROFIT_DISPLAY: CompanyProfitDisplayConfig = {
    metric: "profit_before_tax",
    label: "税引前利益",
    marginLabel: "税引前利益率",
};

/** Companies whose verified consolidated PL structure has no operating-profit subtotal. */
export const COMPANY_PROFIT_DISPLAY_CONFIG: Readonly<Record<string, CompanyProfitDisplayConfig>> = {
    "5713": PBT_PROFIT_DISPLAY,
    "2282": PBT_PROFIT_DISPLAY,
    "8031": PBT_PROFIT_DISPLAY,
    "8058": PBT_PROFIT_DISPLAY,
    "4819": PBT_PROFIT_DISPLAY,
};

export function getCompanyProfitDisplay(ticker: string | null | undefined): CompanyProfitDisplayConfig {
    return ticker ? COMPANY_PROFIT_DISPLAY_CONFIG[ticker] ?? DEFAULT_PROFIT_DISPLAY : DEFAULT_PROFIT_DISPLAY;
}

export function presentsProfitBeforeTax(ticker: string | null | undefined): boolean {
    return getCompanyProfitDisplay(ticker).metric === "profit_before_tax";
}
