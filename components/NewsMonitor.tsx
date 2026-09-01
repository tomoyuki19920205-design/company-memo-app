"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import SectorReportMarkdown from "@/components/SectorReportMarkdown";
import { loadCompanyMaster, loadNewsStream } from "@/lib/viewer-api";
import { isNYMarketReport, isSafeSourceUrl, isSectorReport } from "@/lib/news-filter";
import type { EarningsRelevance, NewsDirection, NewsQuery, NewsStreamItem } from "@/types/news";
import TopNavigation from "@/components/TopNavigation";

const LAST_SEEN_KEY = "last_seen_news_timestamp";
const dateTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
const sourceDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", "/") : dateTime(value);
const periods = { today: 1, "3d": 3, "7d": 7, "30d": 30, all: 0 } as const;

export default function NewsMonitor() {
    const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const [search, setSearch] = useState(params?.get("ticker") ?? "");
    const [period, setPeriod] = useState<keyof typeof periods>("7d");
    const [reportType, setReportType] = useState<"company_news" | "sector_weekly" | "ny_market_daily" | "">("");
    const [direction, setDirection] = useState<NewsDirection | "">("");
    const [importance, setImportance] = useState<NewsQuery["importance"] | "">("");
    const [category, setCategory] = useState("");
    const [relevance, setRelevance] = useState<EarningsRelevance | "">("");
    const [sort, setSort] = useState<"newest" | "importance" | "published">("newest");
    const [rows, setRows] = useState<NewsStreamItem[]>([]);
    const [names, setNames] = useState(new Map<string, string>());
    const [selected, setSelected] = useState<NewsStreamItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [offset, setOffset] = useState(0);
    const [lastSeen, setLastSeen] = useState("");

    const since = useMemo(() => periods[period] ? new Date(Date.now() - periods[period] * 86400000).toISOString() : undefined, [period]);
    const fetchRows = useCallback(async (append = false) => {
        setLoading(true); setError("");
        const nextOffset = append ? offset + 50 : 0;
        try {
            const data = await loadNewsStream({ search: search || undefined, since, reportType: reportType || undefined, direction: direction || undefined, importance: importance || undefined, category: category || undefined, earningsRelevance: relevance || undefined, sort, limit: 50, offset: nextOffset });
            setRows((current) => append ? [...current, ...data] : data);
            setOffset(nextOffset);
        } catch (err) { setError(err instanceof Error ? err.message : "ニュース取得に失敗しました"); }
        finally { setLoading(false); }
    }, [search, since, reportType, direction, importance, category, relevance, sort, offset]);

    useEffect(() => { const timer = setTimeout(() => { void fetchRows(false); }, 200); return () => clearTimeout(timer); }, [search, since, reportType, direction, importance, category, relevance, sort]);
    useEffect(() => { loadCompanyMaster().then((items) => setNames(new Map(items.map((item) => [item.ticker, item.company_name])))); const previous = localStorage.getItem(LAST_SEEN_KEY) ?? ""; setLastSeen(previous); localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()); }, []);

    return <main className="news-monitor">
        <header className="news-monitor-header"><div><TopNavigation active="news" /><h1>News Monitor</h1><p>企業ニュース、東証33業種週次、NY市場モーニングレポートを新着順で確認</p></div></header>
        <div className="news-filters">
            <label>期間<select value={period} onChange={(e) => setPeriod(e.target.value as keyof typeof periods)}><option value="today">今日</option><option value="3d">3日</option><option value="7d">7日</option><option value="30d">30日</option><option value="all">全期間</option></select></label>
            <label>銘柄 / 企業 / 業種 / レポート<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="7203 / 会社名 / 鉄鋼 / NY市場" /></label>
            <label>種別<select value={reportType} onChange={(e) => setReportType(e.target.value as typeof reportType)}><option value="">すべて</option><option value="company_news">会社ニュース</option><option value="sector_weekly">業種レポート</option><option value="ny_market_daily">NY市場レポート</option></select></label>
            <label>方向<select value={direction} onChange={(e) => setDirection(e.target.value as NewsDirection | "")}><option value="">すべて</option>{["positive","negative","mixed","neutral"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>重要度<select value={importance} onChange={(e) => setImportance(e.target.value as NewsQuery["importance"] | "")}><option value="">すべて</option>{["A+","A","B","C","high","medium","low"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>会社カテゴリ<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="orders" disabled={reportType !== "" && reportType !== "company_news"} /></label>
            <label>決算関連<select value={relevance} onChange={(e) => setRelevance(e.target.value as EarningsRelevance | "")} disabled={reportType !== "" && reportType !== "company_news"}><option value="">すべて</option>{["direct","likely","general","context","unknown"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>並び順<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="newest">Newest</option><option value="importance">Importance</option><option value="published">Published date</option></select></label>
        </div>
        {error && <div className="error-bar">{error}</div>}
        <div className="news-monitor-layout"><section className="news-feed" aria-live="polite">
            {!loading && rows.length === 0 && <p className="news-empty">条件に一致するニュースはありません</p>}
            {rows.map((row) => {
                const sector = isSectorReport(row);
                const nyMarket = isNYMarketReport(row);
                const cardClass = sector ? "sector-report-card" : nyMarket ? "ny-market-report-card" : `temporal-${row.temporal_status}`;
                return <article className={`news-card ${cardClass}`} key={row.stream_id} onClick={() => setSelected(row)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(row); }} role="button" tabIndex={0}>
                    <div className="news-card-meta"><time>{dateTime(row.sort_at)}</time>{sector ? <span>東証33業種</span> : nyMarket ? <span>NY市場</span> : <Link href={`/?ticker=${encodeURIComponent(row.ticker)}`} onClick={(e) => e.stopPropagation()}>{row.ticker} {names.get(row.ticker) ?? row.company_name ?? ""}</Link>}{lastSeen && row.created_at > lastSeen && <b className="new-badge">NEW</b>}</div>
                    <h2>{row.title}</h2><div className="news-badges"><span>{row.category}</span><span className={`news-badge direction-${row.direction}`}>{row.direction}</span><span className={`news-badge importance-${row.importance.replace("+", "-plus")}`}>{row.importance}</span>{!sector && !nyMarket && <span>{row.earnings_relevance}</span>}</div>
                    {nyMarket ? <NYMarketCardSummary row={row} /> : sector ? <ul className="sector-summary-bullets">{row.summary_bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul> : <p>{row.summary}</p>}
                    <small>{nyMarket ? "NY市場モーニングレポート" : sector ? "東証33業種週次レポート" : row.source_name}</small>
                </article>;
            })}
            {loading && <p className="news-empty">読み込み中...</p>}
            {!loading && rows.length > 0 && rows.length % 50 === 0 && <button className="btn btn-load" onClick={() => void fetchRows(true)}>さらに読み込む</button>}
        </section>
        <aside className="news-detail">{selected ? <><button className="news-detail-close" onClick={() => setSelected(null)}>×</button>{isNYMarketReport(selected) ? <NYMarketDetail row={selected} /> : isSectorReport(selected) ? <SectorDetail row={selected} /> : <CompanyDetail row={selected} names={names} />}</> : <p className="news-empty">ニュースを選択すると詳細を表示します</p>}</aside></div>
    </main>;
}

function CompanyDetail({ row, names }: { row: Extract<NewsStreamItem, { report_type: "company_news" }>; names: Map<string, string> }) {
    return <><h2>{row.title}</h2><p><Link href={`/?ticker=${row.ticker}`}>{row.ticker} {names.get(row.ticker) ?? row.company_name}</Link></p><dl><dt>公開</dt><dd>{dateTime(row.published_at)}</dd><dt>確認</dt><dd>{dateTime(row.checked_at)}</dd><dt>Source</dt><dd>{row.source_name}</dd><dt>分類</dt><dd>{row.category} / {row.direction} / {row.importance}</dd><dt>決算関連</dt><dd>{row.earnings_relevance}</dd><dt>Temporal</dt><dd>{row.temporal_status}{row.valid_until ? ` (until ${dateTime(row.valid_until)})` : ""}</dd></dl><h3>Summary</h3><p>{row.summary}</p><h3>Why it matters</h3><p>{row.why_it_matters}</p>{row.evidence_excerpt && <><h3>Evidence excerpt</h3><blockquote>{row.evidence_excerpt}</blockquote></>}<div className="news-tags">{row.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{row.source_url && isSafeSourceUrl(row.source_url) && <a className="btn btn-load" href={row.source_url} target="_blank" rel="noopener noreferrer">原文を開く</a>}</>;
}

function indexMove(row: Extract<NewsStreamItem, { report_type: "ny_market_daily" }>, aliases: string[]): string | null {
    const normalized = new Map(Object.entries(row.index_moves).map(([key, value]) => [key.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""), value]));
    const value = aliases.map((alias) => normalized.get(alias)).find((item) => item !== undefined);
    const change = typeof value === "number" ? value : value && typeof value === "object" && "change_pct" in value ? (value as { change_pct?: unknown }).change_pct : null;
    return typeof change === "number" ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : null;
}

export function NYMarketCardSummary({ row }: { row: Extract<NewsStreamItem, { report_type: "ny_market_daily" }> }) {
    const indexes = [
        ["S&P", indexMove(row, ["sp500", "sandp500"])],
        ["SOX", indexMove(row, ["sox"])],
        ["Dow", indexMove(row, ["dow", "dowjones"])],
        ["Russell", indexMove(row, ["russell2000"])],
    ].filter((item): item is [string, string] => item[1] !== null);
    return <><div className="ny-market-indexes">{indexes.map(([name, value]) => <span key={name}>{name} {value}</span>)}</div><ul className="sector-summary-bullets">{row.summary_bullets.slice(0, 6).map((bullet, index) => <li key={index}>{bullet}</li>)}</ul></>;
}

export function NYMarketDetail({ row }: { row: Extract<NewsStreamItem, { report_type: "ny_market_daily" }> }) {
    return <div className="sector-report-detail ny-market-report-detail"><h2>{row.title}</h2><dl><dt>作成日時</dt><dd>{dateTime(row.sort_at)}</dd><dt>レポート日 JST</dt><dd>{row.report_date_jst.replaceAll("-", "/")}</dd><dt>対象NY市場営業日</dt><dd>{row.market_session_date.replaceAll("-", "/")}</dd><dt>市場状態</dt><dd>{row.market_status}</dd></dl><h3>Full Report</h3><SectorReportMarkdown markdown={row.report_markdown} /><h3>Sources</h3><ul className="sector-source-list">{row.sources.map((source, index) => <li key={`${source.url}-${index}`}>{isSafeSourceUrl(source.url) ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}<small>{source.publisher}{source.published_at ? ` / ${sourceDate(source.published_at)}` : ""}</small></li>)}</ul></div>;
}

function SectorDetail({ row }: { row: Extract<NewsStreamItem, { report_type: "sector_weekly" }> }) {
    return <div className="sector-report-detail"><h2>{row.title}</h2><dl><dt>作成日時</dt><dd>{dateTime(row.sort_at)}</dd><dt>対象期間</dt><dd>{dateTime(row.period_start)} ～ {dateTime(row.period_end)}</dd><dt>業種</dt><dd>{String(row.sector_code).padStart(2, "0")} {row.sector_name}</dd><dt>重要度</dt><dd>{row.importance}</dd><dt>総合方向</dt><dd>{row.direction}</dd><dt>Source</dt><dd>{row.sources.length}件</dd></dl><h3>Summary</h3><ul className="sector-summary-bullets">{row.summary_bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul><h3>Full Report</h3><SectorReportMarkdown markdown={row.full_report_md} />
        <h3>注目銘柄</h3>{row.watchlist_companies.length ? <ol>{row.watchlist_companies.map((company) => <li key={company.code}><Link href={`/?ticker=${company.code}`}>{company.code} {company.name}</Link> <span className={`news-badge direction-${company.direction}`}>{company.direction}</span></li>)}</ol> : <p>該当なし</p>}
        <h3>翌週以降の監視ポイント</h3>{row.next_week_watchpoints.length ? <ul>{row.next_week_watchpoints.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>該当なし</p>}
        <h3>見落とし候補</h3>{row.missed_candidates.length ? <ul>{row.missed_candidates.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>該当なし</p>}
        <h3>Sources</h3><ul className="sector-source-list">{row.sources.map((source, index) => <li key={`${source.url}-${index}`}>{isSafeSourceUrl(source.url) ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}<small>{source.source_name} / {source.source_type}{source.published_at ? ` / ${sourceDate(source.published_at)}` : ""}</small></li>)}</ul>
    </div>;
}
