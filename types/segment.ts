export interface SegmentRecord {
    ticker: string;
    period: string;
    quarter: string;
    segment_name: string;
    segment_sales: number | null;
    segment_profit: number | null;
    source?: string;
    /** Per-metric source for badge display (set by overlay resolution) */
    _salesSource?: string;
    /** Per-metric source for badge display (set by overlay resolution) */
    _profitSource?: string;
}
