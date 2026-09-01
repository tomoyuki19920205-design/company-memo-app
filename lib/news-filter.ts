import type { NewsEvent, NewsQuery, NewsStreamItem, NYMarketReportStreamItem, SectorReportStreamItem } from "@/types/news";

const IMPORTANCE_RANK = { high: 0, medium: 1, low: 2 } as const;

export function filterNewsEvents(rows: NewsEvent[], query: NewsQuery): NewsEvent[] {
    const search = query.search?.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) => {
        if (query.ticker && row.ticker !== query.ticker) return false;
        if (query.since && new Date(row.published_at) < new Date(query.since)) return false;
        if (query.direction && row.direction !== query.direction) return false;
        if (query.importance && row.importance !== query.importance) return false;
        if (query.category && row.category !== query.category) return false;
        if (query.earningsRelevance && row.earnings_relevance !== query.earningsRelevance) return false;
        if (search && !`${row.ticker} ${row.company_name ?? ""} ${row.headline}`.toLocaleLowerCase().includes(search)) return false;
        return true;
    });
    return filtered.sort((a, b) => {
        if (query.sort === "importance") {
            const delta = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
            if (delta) return delta;
        }
        const key = query.sort === "newest" ? "created_at" : "published_at";
        return new Date(b[key]).getTime() - new Date(a[key]).getTime();
    });
}

export function isSafeSourceUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

export function isSectorReport(row: NewsStreamItem): row is SectorReportStreamItem {
    return row.report_type === "sector_weekly";
}

export function isNYMarketReport(row: NewsStreamItem): row is NYMarketReportStreamItem {
    return row.report_type === "ny_market_daily";
}
