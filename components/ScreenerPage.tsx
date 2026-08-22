"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SCREENER_METRICS, type ScreenerRow } from "@/lib/screener";

type Option = { code: string; name: string };
type Options = { markets: Option[]; sectors17: Option[]; sectors33: Option[] };
type Range = { min: string; max: string };
const DEFAULT_COLUMNS = ["forward_per", "forecast_sales_growth_yoy_pct", "forward_per_per_forecast_sales_growth", "forward_peg", "return_20d_pct", "market_cap"];

function selectedValues(event: React.ChangeEvent<HTMLSelectElement>) {
    return Array.from(event.target.selectedOptions, (option) => option.value);
}

export default function ScreenerPage() {
    const [options, setOptions] = useState<Options>({ markets: [], sectors17: [], sectors33: [] });
    const [ranges, setRanges] = useState<Record<string, Range>>({});
    const [columns, setColumns] = useState(DEFAULT_COLUMNS);
    const [markets, setMarkets] = useState<string[]>([]);
    const [sectors17, setSectors17] = useState<string[]>([]);
    const [sectors33, setSectors33] = useState<string[]>([]);
    const [flags, setFlags] = useState<Record<string, boolean>>({ exclude_stale: true });
    const [sort, setSort] = useState("market_cap");
    const [direction, setDirection] = useState("desc");
    const [rows, setRows] = useState<ScreenerRow[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/api/screener?mode=options").then((response) => response.json()).then((data) => {
            if (!data.error) setOptions(data);
        }).catch(() => undefined);
    }, []);

    const queryString = useCallback((targetPage: number) => {
        const params = new URLSearchParams({ page: String(targetPage), page_size: "50", columns: columns.join(","), sort, direction });
        for (const [key, range] of Object.entries(ranges)) {
            if (range.min !== "") params.set(`${key}_min`, range.min);
            if (range.max !== "") params.set(`${key}_max`, range.max);
        }
        if (markets.length) params.set("markets", markets.join(","));
        if (sectors17.length) params.set("sectors17", sectors17.join(","));
        if (sectors33.length) params.set("sectors33", sectors33.join(","));
        for (const [key, enabled] of Object.entries(flags)) if (enabled) params.set(key, "true");
        return params.toString();
    }, [columns, direction, flags, markets, ranges, sectors17, sectors33, sort]);

    const search = useCallback(async (targetPage = 1) => {
        setLoading(true); setError("");
        try {
            const response = await fetch(`/api/screener?${queryString(targetPage)}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "検索に失敗しました");
            setRows(data.rows); setCount(data.count); setPage(data.page);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "検索に失敗しました");
        } finally { setLoading(false); }
    }, [queryString]);

    useEffect(() => { void search(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const visibleMetrics = useMemo(() => SCREENER_METRICS.filter((metric) => columns.includes(metric.key)), [columns]);
    const format = (value: unknown, digits = 2) => value === null || value === undefined ? "—" : Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });

    return <main className="screener-page">
        <header className="screener-titlebar">
            <div><h1>株式スクリーニング</h1><p>最新nightly snapshot・全{count.toLocaleString()}件</p></div>
            <Link href="/" className="screener-nav">Company Viewerへ</Link>
        </header>

        <section className="screener-panel">
            <h2>数値範囲</h2>
            <div className="range-grid">
                {SCREENER_METRICS.map((metric) => <div className="range-item" key={metric.key}>
                    <label>{metric.label}</label>
                    <div><input aria-label={`${metric.label} 下限`} type="number" step="any" placeholder="以上" value={ranges[metric.key]?.min ?? ""} onChange={(e) => setRanges((old) => ({ ...old, [metric.key]: { min: e.target.value, max: old[metric.key]?.max ?? "" } }))} />
                    <span>–</span><input aria-label={`${metric.label} 上限`} type="number" step="any" placeholder="以下" value={ranges[metric.key]?.max ?? ""} onChange={(e) => setRanges((old) => ({ ...old, [metric.key]: { min: old[metric.key]?.min ?? "", max: e.target.value } }))} /></div>
                </div>)}
            </div>
        </section>

        <section className="screener-panel filter-grid">
            {(["markets", "sectors17", "sectors33"] as const).map((key) => {
                const labels = { markets: "上場市場", sectors17: "17業種", sectors33: "33業種" };
                const setters = { markets: setMarkets, sectors17: setSectors17, sectors33: setSectors33 };
                return <label key={key}>{labels[key]}（複数選択）<select multiple value={{ markets, sectors17, sectors33 }[key]} onChange={(e) => setters[key](selectedValues(e))}>{options[key].map((option) => <option key={option.code} value={option.code}>{option.code} {option.name}</option>)}</select></label>;
            })}
            <div className="flag-list"><span>条件</span>
                {([ ["new_ytd_high_last_5d", "年初来高値更新"], ["turnaround", "黒字転換"], ["loss_expansion", "赤字拡大"], ["profit_to_loss", "黒字→赤字"], ["exclude_stale", "stale price除外"] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={!!flags[key]} onChange={(e) => setFlags((old) => ({ ...old, [key]: e.target.checked }))} />{label}</label>)}
            </div>
        </section>

        <section className="screener-panel">
            <h2>表示列</h2><div className="column-selector">{SCREENER_METRICS.map((metric) => <label key={metric.key}><input type="checkbox" checked={columns.includes(metric.key)} onChange={(e) => setColumns((old) => e.target.checked ? [...old, metric.key] : old.filter((key) => key !== metric.key))} />{metric.label}</label>)}</div>
            <div className="search-actions"><label>並び順<select value={sort} onChange={(e) => { const next = e.target.value; setSort(next); if (next === "forward_per_per_forecast_sales_growth") setDirection("asc"); }}>{SCREENER_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><select aria-label="昇順降順" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="desc">降順</option><option value="asc">昇順</option></select><button onClick={() => void search(1)} disabled={loading}>{loading ? "検索中…" : "検索"}</button></div>
        </section>

        {error && <p className="screener-error">{error}</p>}
        <div className="screener-results"><table><thead><tr><th>銘柄</th><th>会社名</th><th>市場</th><th>33業種</th><th>価格</th><th>価格日/status</th>{visibleMetrics.map((metric) => <th key={metric.key}>{metric.label}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={String(row.ticker)}><td><Link href={`/?ticker=${row.ticker}`}>{row.ticker}</Link></td><td><Link href={`/?ticker=${row.ticker}`}>{row.company_name}</Link></td><td>{row.market_name ?? row.market_code}</td><td>{row.sector33_name ?? row.sector33_code}</td><td>{format(row.latest_valid_price, 2)}</td><td>{row.price_as_of}<br/><small>{row.price_status}{Number(row.price_stale_sessions) > 0 ? ` (${row.price_stale_sessions}営業日)` : ""}</small></td>{visibleMetrics.map((metric) => <td key={metric.key}>{format(row[metric.key], metric.digits)}</td>)}</tr>)}</tbody>
        </table></div>
        <nav className="pagination"><button disabled={page <= 1 || loading} onClick={() => void search(page - 1)}>前へ</button><span>{page} / {Math.max(1, Math.ceil(count / 50))}</span><button disabled={page * 50 >= count || loading} onClick={() => void search(page + 1)}>次へ</button></nav>
    </main>;
}
