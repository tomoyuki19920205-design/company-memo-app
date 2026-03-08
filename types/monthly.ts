export interface MonthlyRecord {
    pubdate: string | null;
    year_month: string | null;
    metric_name: string | null;
    metric_value: number | null;
    unit: string | null;
    segment_name: string | null;
    confidence: number | null;
    source_type: string | null;
}
