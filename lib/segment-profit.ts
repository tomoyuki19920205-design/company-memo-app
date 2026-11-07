import type { SegmentRecord } from "@/types/segment";

export function segmentProfitLabel(basis?: string | null): string {
    const labels: Record<string, string> = {
        gross_profit: "売上総利益", operating_profit: "営業利益",
        ordinary_profit: "経常利益", profit_before_tax: "税引前利益",
        adjusted_operating_profit: "調整後営業利益", core_operating_profit: "コア営業利益",
        business_profit: "事業利益", before_goodwill_amortization: "のれん等償却前利益",
        ebitda: "EBITDA", adjusted_ebitda: "調整後EBITDA",
        ebit: "EBIT", adjusted_ebit: "調整後EBIT",
        company_defined_unknown: "基準未確定",
    };
    return labels[basis ?? ""] ? `セグメント利益（${labels[basis!]}ベース）` : "セグメント利益";
}

export function segmentComparisonReason(current?: SegmentRecord, previous?: SegmentRecord, metric: "sales" | "profit" = "profit"): string | null {
    if (!current) return "当四半期のセグメントデータが未取得";
    if (!previous) return "前四半期のセグメントデータが未取得";
    if (current.period !== previous.period) return "決算年度が異なるため単独計算不可";
    if (metric === "profit" && (current.profit_basis === "company_defined_unknown" || previous.profit_basis === "company_defined_unknown")) return "利益基準が未確定のため単独計算不可";
    if (metric === "profit" && (current.profit_basis ?? null) !== (previous.profit_basis ?? null)) return "利益基準が異なるため単独計算不可";
    if (metric === "sales" && (current.sales_basis ?? null) !== (previous.sales_basis ?? null)) return "売上基準が異なるため単独計算不可";
    if ((current.accounting_scope ?? null) !== (previous.accounting_scope ?? null)) return "連結区分が異なるため単独計算不可";
    if ((current.currency ?? null) !== (previous.currency ?? null)) return "通貨が異なるため単独計算不可";
    if ((current.segment_definition ?? null) !== (previous.segment_definition ?? null)) return "セグメント区分が異なるため単独計算不可";
    if ((current.period_start ?? null) !== (previous.period_start ?? null)) return "累計開始日が異なるため単独計算不可";
    return null;
}

export function compatibleSegmentPeriods(current?: SegmentRecord, previous?: SegmentRecord): boolean {
    return segmentComparisonReason(current, previous) === null;
}


export function segmentSalesLabel(basis?: string | null): string {
    const labels: Record<string, string> = {
        external_customers: "外部顧客売上", including_intersegment: "売上（内部取引込み）",
        customer_contract_revenue: "顧客契約収益", construction_revenue: "完成工事高",
        disclosed_revenue: "セグメント売上",
    };
    return labels[basis ?? ""] ?? "セグメント売上";
}
