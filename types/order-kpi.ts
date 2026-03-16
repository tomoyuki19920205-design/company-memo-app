// ============================================================
// types/order-kpi.ts — 受注KPI 型定義
// ============================================================

/**
 * Supabase order_kpis テーブルから取得する受注KPIアイテム。
 */
export interface OrderKpiItem {
    id: number;
    ticker: string;
    canonical_kpi_name: "orders_received" | "order_backlog" | "carried_forward_construction";
    normalized_value: number | null;
    unit_normalized: string | null;
    review_status: "auto_accepted" | "needs_review" | "ambiguous" | "rejected" | "manual_corrected";
    confidence_score: number | null;
    filing_date: string | null;
    source_system: string | null;
    source_type: string | null;
    raw_label: string | null;
    source_page?: number | null;
    source_locator?: string | null;
    extraction_method?: string | null;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    review_note?: string | null;
}

/**
 * canonical_kpi_name → 日本語ラベルの変換。
 */
export function formatOrderKpiLabel(canonical: string): string {
    switch (canonical) {
        case "orders_received":
            return "受注高";
        case "order_backlog":
            return "受注残";
        case "carried_forward_construction":
            return "繰越工事高";
        default:
            return canonical;
    }
}

/**
 * review_status → 日本語badge表示の変換。
 */
export function formatReviewStatus(status: string): {
    label: string;
    className: string;
} {
    switch (status) {
        case "auto_accepted":
            return { label: "自動確定", className: "badge-accepted" };
        case "needs_review":
            return { label: "要確認", className: "badge-review" };
        case "ambiguous":
            return { label: "曖昧", className: "badge-ambiguous" };
        case "rejected":
            return { label: "却下", className: "badge-rejected" };
        case "manual_corrected":
            return { label: "手修正", className: "badge-corrected" };
        default:
            return { label: status, className: "badge-default" };
    }
}

/**
 * review_status が承認/却下操作の対象かどうか判定する。
 */
export function isReviewableStatus(status: string): boolean {
    return status === "needs_review" || status === "ambiguous";
}

/**
 * 表示順を保証するためのKPI固定順リスト。
 */
export const ORDER_KPI_DISPLAY_ORDER: OrderKpiItem["canonical_kpi_name"][] = [
    "orders_received",
    "order_backlog",
    "carried_forward_construction",
];
