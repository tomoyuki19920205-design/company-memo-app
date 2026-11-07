export interface SegmentRecord {
    ticker: string;
    period: string;
    quarter: string;
    segment_name: string;
    segment_sales: number | null;
    segment_profit: number | null;
    profit_basis?: string | null;
    profit_label?: string | null;
    sales_basis?: string | null;
    sales_label?: string | null;
    accounting_scope?: string | null;
    currency?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    segment_definition?: string | null;
    /** Exact printed header, only exposed for a fully verified unique period. */
    business_key?: string | null;
    comparison_definition?: string | null;
    source?: string;
    /** source_priority: api_latest_segments の優先順位 (小さいほど優先) */
    source_priority?: number | null;
    /** Per-metric source for badge display (set by overlay resolution) */
    _salesSource?: string;
    /** Per-metric source for badge display (set by overlay resolution) */
    _profitSource?: string;
}
