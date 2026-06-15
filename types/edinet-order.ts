// types/edinet-order.ts
// edinet_order_data テーブルから取得するレコードの型定義

export type EdinetOrderRecord = {
    ticker: string;
    period: string;              // YYYY-MM-DD（決算期末日）
    fiscal_year: number;         // 年度（整数）
    orders_received: number | null;
    order_backlog: number | null;
    construction_carryover: number | null;
    completed_construction: number | null;
    rpo: number | null;
    source_unit: string;         // million_yen / thousand_yen / billion_yen / unknown
    confidence: "high" | "medium" | "low";
    null_reason: string | null;
};
