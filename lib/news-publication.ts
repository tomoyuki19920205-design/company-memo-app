/** The day bounds below are query bounds, never an asserted publication time. */
type Publication = {
    published_at: string | null;
    published_date?: string | null;
    published_precision?: "date" | "datetime" | null;
    report_type?: string;
};
export function isDateOnlyNews(row: Publication): boolean {
    return (!row.report_type || row.report_type === "company_news") && row.published_precision === "date";
}
export function publicationLabel(row: Publication): string {
    if (isDateOnlyNews(row)) {
        const d = row.published_date;
        if (row.published_at !== null || !d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "公表日時未確認";
        const parsed = new Date(d + "T00:00:00Z");
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== d) return "公表日時未確認";
        const [y,m,day] = d.split("-");
        return `${y}年${Number(m)}月${Number(day)}日（時刻不明）`;
    }
    if (!row.published_at || !Number.isFinite(new Date(row.published_at).getTime())) return "公表日時未確認";
    // Preserve the exact old format for historical records, Sector and NY.
    return new Intl.DateTimeFormat("ja-JP", {dateStyle:"short",timeStyle:"short",timeZone:"Asia/Tokyo"}).format(new Date(row.published_at));
}
type WindowQuery<Q> = { gte(column: string, value: string): Q; lt(column: string, value: string): Q; lte(column: string, value: string): Q };
/** Bounds are for filtering/sorting only; published_at is never filled in. */
export function publicationBounds(row: Publication): {start: number; end: number} | null {
    if (isDateOnlyNews(row)) {
        if (publicationLabel(row) === "公表日時未確認") return null;
        const start = Date.parse(`${row.published_date}T00:00:00+09:00`);
        return {start, end: start + 86400000};
    }
    if (!row.published_at) return null;
    const start = Date.parse(row.published_at);
    return Number.isFinite(start) ? {start, end: start} : null;
}
export function withinPublicationWindow(row: Publication, options: {since?: string; until?: string}): boolean {
    validateWindow(options);
    if (!options.since && !options.until) return true;
    const range = publicationBounds(row);
    if (!range) return false;
    return (!options.since || range.start >= Date.parse(options.since))
        && (!options.until || (range.start < Date.parse(options.until) && range.end <= Date.parse(options.until)));
}
function validateWindow(options: {since?: string; until?: string}): void {
    for (const bound of [options.since, options.until]) {
        if (bound !== undefined && (!/(Z|[+-]\d{2}:\d{2})$/.test(bound) || !Number.isFinite(Date.parse(bound)))) throw new Error("期間の日時にタイムゾーンが必要です");
    }
    if (options.since && options.until && Date.parse(options.since) >= Date.parse(options.until)) throw new Error("対象期間が不正です");
}
export function applyPublicationWindow<Q extends WindowQuery<Q>>(query: Q, options: {since?: string; until?: string}): Q {
    validateWindow(options);
    if (options.since) query = query.gte("publication_filter_start", options.since);
    if (options.until) query = query.lt("publication_filter_start", options.until).lte("publication_filter_end", options.until);
    return query;
}
