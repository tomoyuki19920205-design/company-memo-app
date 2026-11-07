import type { SegmentRecord } from "@/types/segment";

export function segmentProfitLabel(basis?: string | null): string {
    const labels: Record<string, string> = {
        gross_profit: "売上総利益", operating_profit: "営業利益",
        ordinary_profit: "経常利益", profit_before_tax: "税引前利益",
    };
    return labels[basis ?? ""] ? `セグメント利益（${labels[basis!]}ベース）` : "セグメント利益";
}

export function segmentComparisonReason(current?: SegmentRecord, previous?: SegmentRecord): string | null {
    if (!current) return "当四半期のセグメントデータが未取得";
    if (!previous) return "前四半期のセグメントデータが未取得";
    if (current.period !== previous.period) return "決算年度が異なるため単独計算不可";
    if ((current.profit_basis ?? null) !== (previous.profit_basis ?? null)) return "利益基準が異なるため単独計算不可";
    if ((current.segment_definition ?? null) !== (previous.segment_definition ?? null)) return "セグメント区分が異なるため単独計算不可";
    if ((current.period_start ?? null) !== (previous.period_start ?? null)) return "累計開始日が異なるため単独計算不可";
    return null;
}

export function compatibleSegmentPeriods(current?: SegmentRecord, previous?: SegmentRecord): boolean {
    return segmentComparisonReason(current, previous) === null;
}
