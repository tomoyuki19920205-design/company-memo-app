"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCompanyMaster, loadNewsEvents } from "@/lib/viewer-api";
import { isSafeSourceUrl } from "@/lib/news-filter";
import type { EarningsRelevance, NewsDirection, NewsEvent, NewsImportance } from "@/types/news";

const LAST_SEEN_KEY = "last_seen_news_timestamp";
const dateTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const periods = { today: 1, "3d": 3, "7d": 7, "30d": 30, all: 0 } as const;

export default function NewsMonitor() {
    const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const [search, setSearch] = useState(params?.get("ticker") ?? "");
    const [period, setPeriod] = useState<keyof typeof periods>("7d");
    const [direction, setDirection] = useState<NewsDirection | "">("");
    const [importance, setImportance] = useState<NewsImportance | "">("");
    const [category, setCategory] = useState("");
    const [relevance, setRelevance] = useState<EarningsRelevance | "">("");
    const [sort, setSort] = useState<"newest" | "importance" | "published">("newest");
    const [rows, setRows] = useState<NewsEvent[]>([]);
    const [names, setNames] = useState(new Map<string, string>());
    const [selected, setSelected] = useState<NewsEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [offset, setOffset] = useState(0);
    const [lastSeen, setLastSeen] = useState("");

    const since = useMemo(() => periods[period] ? new Date(Date.now() - periods[period] * 86400000).toISOString() : undefined, [period]);
    const fetchRows = useCallback(async (append = false) => {
        setLoading(true); setError("");
        const nextOffset = append ? offset + 50 : 0;
        try {
            const data = await loadNewsEvents({ search: search || undefined, since, direction: direction || undefined, importance: importance || undefined, category: category || undefined, earningsRelevance: relevance || undefined, sort, limit: 50, offset: nextOffset });
            setRows((current) => append ? [...current, ...data] : data);
            setOffset(nextOffset);
        } catch (err) { setError(err instanceof Error ? err.message : "ニュース取得に失敗しました"); }
        finally { setLoading(false); }
    }, [search, since, direction, importance, category, relevance, sort, offset]);

    useEffect(() => { const timer = setTimeout(() => { void fetchRows(false); }, 200); return () => clearTimeout(timer); }, [search, since, direction, importance, category, relevance, sort]);
    useEffect(() => { loadCompanyMaster().then((items) => setNames(new Map(items.map((item) => [item.ticker, item.company_name])))); const previous = localStorage.getItem(LAST_SEEN_KEY) ?? ""; setLastSeen(previous); localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()); }, []);

    return <main className="news-monitor">
        <header className="news-monitor-header"><div><Link href="/">← Company Viewer</Link><h1>News Monitor</h1><p>企業業績に関わる定性情報を新着順で確認</p></div></header>
        <div className="news-filters">
            <label>期間<select value={period} onChange={(e) => setPeriod(e.target.value as keyof typeof periods)}><option value="today">今日</option><option value="3d">3日</option><option value="7d">7日</option><option value="30d">30日</option><option value="all">全期間</option></select></label>
            <label>銘柄/企業<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="7203 / 会社名" /></label>
            <label>方向<select value={direction} onChange={(e) => setDirection(e.target.value as NewsDirection | "")}><option value="">すべて</option>{["positive","negative","mixed","neutral"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>重要度<select value={importance} onChange={(e) => setImportance(e.target.value as NewsImportance | "")}><option value="">すべて</option>{["high","medium","low"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>カテゴリ<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="orders" /></label>
            <label>決算関連<select value={relevance} onChange={(e) => setRelevance(e.target.value as EarningsRelevance | "")}><option value="">すべて</option>{["direct","likely","general","context","unknown"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>並び順<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="newest">Newest</option><option value="importance">Importance</option><option value="published">Published date</option></select></label>
        </div>
        {error && <div className="error-bar">{error}</div>}
        <div className="news-monitor-layout"><section className="news-feed" aria-live="polite">
            {!loading && rows.length === 0 && <p className="news-empty">条件に一致するニュースはありません</p>}
            {rows.map((row) => <article className={`news-card temporal-${row.temporal_status}`} key={row.event_id} onClick={() => setSelected(row)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(row); }} role="button" tabIndex={0}>
                <div className="news-card-meta"><time>{dateTime(row.published_at)}</time><Link href={`/?ticker=${encodeURIComponent(row.ticker)}`} onClick={(e) => e.stopPropagation()}>{row.ticker} {names.get(row.ticker) ?? ""}</Link>{lastSeen && row.created_at > lastSeen && <b className="new-badge">NEW</b>}</div>
                <h2>{row.headline}</h2><div className="news-badges"><span>{row.category}</span><span className={`news-badge direction-${row.direction}`}>{row.direction}</span><span className={`news-badge importance-${row.importance}`}>{row.importance}</span><span>{row.earnings_relevance}</span></div>
                <p>{row.summary}</p><small>{row.source_name}</small>
            </article>)}
            {loading && <p className="news-empty">読み込み中...</p>}
            {!loading && rows.length === 50 && <button className="btn btn-load" onClick={() => void fetchRows(true)}>さらに読み込む</button>}
        </section>
        <aside className="news-detail">{selected ? <><button className="news-detail-close" onClick={() => setSelected(null)}>×</button><h2>{selected.headline}</h2><p><Link href={`/?ticker=${selected.ticker}`}>{selected.ticker} {names.get(selected.ticker)}</Link></p><dl><dt>公開</dt><dd>{dateTime(selected.published_at)}</dd><dt>確認</dt><dd>{dateTime(selected.checked_at)}</dd><dt>Source</dt><dd>{selected.source_name}</dd><dt>分類</dt><dd>{selected.category} / {selected.direction} / {selected.importance}</dd><dt>決算関連</dt><dd>{selected.earnings_relevance}</dd><dt>Temporal</dt><dd>{selected.temporal_status}{selected.valid_until ? ` (until ${dateTime(selected.valid_until)})` : ""}</dd></dl><h3>Summary</h3><p>{selected.summary}</p><h3>Why it matters</h3><p>{selected.why_it_matters}</p>{selected.evidence_excerpt && <><h3>Evidence excerpt</h3><blockquote>{selected.evidence_excerpt}</blockquote></>}<div className="news-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{isSafeSourceUrl(selected.source_url) && <a className="btn btn-load" href={selected.source_url} target="_blank" rel="noopener noreferrer">原文を開く</a>}</> : <p className="news-empty">ニュースを選択すると詳細を表示します</p>}</aside></div>
    </main>;
}
