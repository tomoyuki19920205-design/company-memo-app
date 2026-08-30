"use client";

import Link from "next/link";
import type { LatestNewsScanRun, NewsEvent } from "@/types/news";
import { isSafeSourceUrl } from "@/lib/news-filter";

const dateTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export default function CompanyNewsSection({ ticker, rows, scan, loading }: { ticker: string; rows: NewsEvent[]; scan: LatestNewsScanRun | null; loading: boolean }) {
    return (
        <section className="company-news-section" aria-labelledby="company-news-title">
            <div className="company-news-heading">
                <div>
                    <h2 id="company-news-title">ニュース</h2>
                    {scan && <span className="news-last-checked">最終ニュースチェック: {dateTime(scan.checked_at)} · 新規ニュース {scan.items_found}件</span>}
                </div>
                <Link href={`/news?ticker=${encodeURIComponent(ticker)}`}>すべて見る</Link>
            </div>
            {loading ? <p className="news-empty">読み込み中...</p> : rows.length === 0 ? <p className="news-empty">ニュースはまだありません</p> : (
                <div className="company-news-list">
                    {rows.map((row) => <article className={`company-news-row temporal-${row.temporal_status}`} key={row.event_id}>
                        <time>{dateTime(row.published_at)}</time>
                        <span className={`news-badge direction-${row.direction}`}>{row.direction}</span>
                        <span className={`news-badge importance-${row.importance}`}>{row.importance}</span>
                        {isSafeSourceUrl(row.source_url) ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">{row.headline}</a> : <span>{row.headline}</span>}
                        <p>{row.summary}</p>
                    </article>)}
                </div>
            )}
        </section>
    );
}
