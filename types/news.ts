export type NewsDirection = "positive" | "negative" | "mixed" | "neutral" | "unknown";
export type NewsImportance = "high" | "medium" | "low";
export type EarningsRelevance = "direct" | "likely" | "general" | "context" | "unknown";
export type TemporalStatus = "current" | "ongoing" | "historical" | "expired" | "unknown";

export interface NewsEvent {
    event_id: string;
    ticker: string;
    company_name?: string | null;
    importance_rank?: number;
    headline: string;
    published_at: string;
    checked_at: string;
    source_type: string;
    source_name: string;
    source_url: string;
    category: string;
    direction: NewsDirection;
    importance: NewsImportance;
    earnings_relevance: EarningsRelevance;
    summary: string;
    why_it_matters: string;
    evidence_excerpt: string | null;
    temporal_status: TemporalStatus;
    valid_until: string | null;
    tags: string[];
    created_at: string;
}

export interface LatestNewsScanRun {
    scan_run_id: string;
    ticker: string;
    checked_at: string;
    status: "completed" | "failed";
    items_found: number;
    sources_checked_count: number | null;
}

export interface NewsQuery {
    ticker?: string;
    search?: string;
    since?: string;
    direction?: NewsDirection;
    importance?: NewsImportance;
    category?: string;
    earningsRelevance?: EarningsRelevance;
    sort?: "newest" | "importance" | "published";
    limit?: number;
    offset?: number;
}
