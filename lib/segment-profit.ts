import type { SegmentRecord } from "@/types/segment";

export function segmentProfitLabel(basis?: string | null): string {
    const labels: Record<string, string> = {
        gross_profit: "売上総利益", operating_profit: "営業利益",
        ordinary_profit: "経常利益", profit_before_tax: "税引前利益",
    };
    return labels[basis ?? ""] ? `セグメント利益（${labels[basis!]}ベース）` : "セグメント利益";
}

export function compatibleSegmentPeriods(current?: SegmentRecord, previous?: SegmentRecord): boolean {
    if (!current || !previous || current.period !== previous.period) return false;
    if ((current.profit_basis ?? null) !== (previous.profit_basis ?? null)) return false;
    if ((current.segment_definition ?? null) !== (previous.segment_definition ?? null)) return false;
    if ((current.period_start ?? null) !== (previous.period_start ?? null)) return false;
    return true;
}
