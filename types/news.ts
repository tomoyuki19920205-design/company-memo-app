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

export interface SectorReportSource {
    title: string;
    url: string;
    source_name: string;
    source_type: string;
    published_at: string | null;
}

export interface SectorWatchlistCompany {
    code: string;
    name: string;
    direction: "positive" | "negative" | "mixed" | "neutral";
}

export interface CompanyNewsStreamItem extends NewsEvent {
    report_type: "company_news";
    stream_id: string;
    title: string;
    sort_at: string;
    sector_code: null;
    sector_name: null;
    summary_bullets: null;
    period_start: null;
    period_end: null;
    full_report_md: null;
    watchlist_companies: null;
    next_week_watchpoints: null;
    missed_candidates: null;
    sources: null;
}

export interface SectorReportStreamItem {
    report_type: "sector_weekly";
    stream_id: string;
    title: string;
    sort_at: string;
    published_at: string;
    checked_at: string;
    created_at: string;
    ticker: null;
    company_name: null;
    sector_code: number;
    sector_name: string;
    category: "sector_report";
    direction: "positive" | "negative" | "mixed" | "neutral";
    importance: "A+" | "A" | "B" | "C";
    importance_rank: number;
    earnings_relevance: null;
    summary: null;
    summary_bullets: string[];
    why_it_matters: null;
    evidence_excerpt: null;
    temporal_status: null;
    valid_until: null;
    tags: string[];
    source_type: null;
    source_name: null;
    source_url: null;
    period_start: string;
    period_end: string;
    full_report_md: string;
    watchlist_companies: SectorWatchlistCompany[];
    next_week_watchpoints: string[];
    missed_candidates: string[];
    sources: SectorReportSource[];
}

export type NewsStreamItem = CompanyNewsStreamItem | SectorReportStreamItem;

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
    importance?: NewsImportance | "A+" | "A" | "B" | "C";
    category?: string;
    earningsRelevance?: EarningsRelevance;
    sort?: "newest" | "importance" | "published";
    limit?: number;
    offset?: number;
    reportType?: "company_news" | "sector_weekly";
}
