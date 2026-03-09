export interface SegmentRecord {
    ticker: string;
    period: string;
    quarter: string;
    segment_name: string;
    segment_sales: number | null;
    segment_profit: number | null;
}
