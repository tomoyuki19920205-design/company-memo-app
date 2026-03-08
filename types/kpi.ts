export interface KpiRecord {
    pubdate: string | null;
    period: string | null;
    quarter: string | null;
    metric_name: string | null;
    metric_value: number | null;
    unit: string | null;
    segment_name: string | null;
    table_title: string | null;
    page_no: number | null;
    confidence: number | null;
    source_type: string | null;
}
