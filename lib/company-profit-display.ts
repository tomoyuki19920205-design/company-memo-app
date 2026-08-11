export type ProfitDisplayMetric = "operating_profit" | "profit_before_tax";

export interface CompanyProfitDisplayConfig {
    metric: ProfitDisplayMetric;
    label: "営業利益" | "税引前利益";
    marginLabel: "営業利益率" | "税引前利益率";
}

interface FiscalPeriodPoint {
    period: string;
    quarter: "1Q" | "2Q" | "3Q" | "FY";
}

interface CompanyProfitDisplayRule {
    display: CompanyProfitDisplayConfig;
    ifrsFrom?: FiscalPeriodPoint;
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

const QUARTER_ORDER: Readonly<Record<string, number>> = {
    "1Q": 0,
    "2Q": 1,
    "3Q": 2,
    "FY": 3,
};

/** Explicit verified rules only. There is no NULL-based automatic fallback. */
export const COMPANY_PROFIT_DISPLAY_CONFIG: Readonly<Record<string, CompanyProfitDisplayRule>> = {
    "5713": { display: PBT_PROFIT_DISPLAY },
    "2282": { display: PBT_PROFIT_DISPLAY },
    "8031": { display: PBT_PROFIT_DISPLAY },
    "8058": { display: PBT_PROFIT_DISPLAY },
    "4819": { display: PBT_PROFIT_DISPLAY },
    "7198": { display: PBT_PROFIT_DISPLAY, ifrsFrom: { period: "2019-03-31", quarter: "FY" } },
    "8473": { display: PBT_PROFIT_DISPLAY, ifrsFrom: { period: "2019-03-31", quarter: "FY" } },
    "8698": { display: PBT_PROFIT_DISPLAY, ifrsFrom: { period: "2021-03-31", quarter: "1Q" } },
    "8253": { display: PBT_PROFIT_DISPLAY, ifrsFrom: { period: "2019-03-31", quarter: "FY" } },
    "7157": { display: PBT_PROFIT_DISPLAY, ifrsFrom: { period: "2024-03-31", quarter: "1Q" } },
    "8630": { display: PBT_PROFIT_DISPLAY, ifrsFrom: { period: "2025-03-31", quarter: "FY" } },
};

function isAtOrAfter(point: FiscalPeriodPoint, boundary: FiscalPeriodPoint): boolean {
    const periodComparison = point.period.localeCompare(boundary.period);
    if (periodComparison !== 0) return periodComparison > 0;
    return (QUARTER_ORDER[point.quarter] ?? -1) >= (QUARTER_ORDER[boundary.quarter] ?? 99);
}

export function getCompanyProfitDisplay(
    ticker: string | null | undefined,
    period?: string,
    quarter?: string,
): CompanyProfitDisplayConfig {
    const rule = ticker ? COMPANY_PROFIT_DISPLAY_CONFIG[ticker] : undefined;
    if (!rule) return DEFAULT_PROFIT_DISPLAY;
    if (!rule.ifrsFrom || period === undefined || quarter === undefined) return rule.display;
    if (!(quarter in QUARTER_ORDER)) return DEFAULT_PROFIT_DISPLAY;
    return isAtOrAfter(
        { period, quarter: quarter as FiscalPeriodPoint["quarter"] },
        rule.ifrsFrom,
    ) ? rule.display : DEFAULT_PROFIT_DISPLAY;
}

export function presentsProfitBeforeTax(
    ticker: string | null | undefined,
    period?: string,
    quarter?: string,
): boolean {
    return getCompanyProfitDisplay(ticker, period, quarter).metric === "profit_before_tax";
}
