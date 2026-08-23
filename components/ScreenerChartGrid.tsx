"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SCREENER_METRICS, type ScreenerRow } from "@/lib/screener";
import { sliceChartPeriod, type ChartPeriod, type ChartPricePoint } from "@/lib/screener-chart-data";
import { latestChartReturn } from "@/lib/screener-chart-ui";
import { DETAILED_FILTER_BY_KEY } from "@/lib/screener-filter-definitions";

const METRIC_BY_KEY = new Map(SCREENER_METRICS.map((metric) => [metric.key, metric]));

function number(value: unknown, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

function signed(value: number | null, suffix = "%") {
    if (value === null) return "—";
    return `${value >= 0 ? "+" : ""}${number(value, 2)}${suffix}`;
}

function LazyCandlestickChart({ points }: { points: ChartPricePoint[] }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const node = hostRef.current;
        if (!node) return;
        if (!("IntersectionObserver" in window)) { setVisible(true); return; }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
        }, { rootMargin: "300px" });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return <div ref={hostRef} className="mini-chart-host">
        {visible ? <CandlestickSvg points={points} /> : <div className="chart-placeholder">表示範囲に入ると描画します</div>}
    </div>;
}

function CandlestickSvg({ points }: { points: ChartPricePoint[] }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 520;
    const height = 250;
    const left = 8;
    const right = 54;
    const priceTop = 10;
    const priceBottom = 178;
    const volumeTop = 194;
    const volumeBottom = 230;
    const plotWidth = width - left - right;
    const lows = points.map((point) => point.low);
    const highs = points.map((point) => point.high);
    const minPrice = Math.min(...lows);
    const maxPrice = Math.max(...highs);
    const priceRange = Math.max(maxPrice - minPrice, Math.abs(maxPrice) * 0.01, 1);
    const paddedMin = minPrice - priceRange * 0.04;
    const paddedMax = maxPrice + priceRange * 0.04;
    const paddedRange = paddedMax - paddedMin;
    const maxVolume = Math.max(...points.map((point) => point.volume), 1);
    const step = plotWidth / Math.max(points.length, 1);
    const candleWidth = Math.max(1, Math.min(6, step * 0.64));
    const y = (price: number) => priceTop + (paddedMax - price) / paddedRange * (priceBottom - priceTop);
    const active = hovered === null ? null : points[hovered];
    if (!points.length) return <div className="chart-placeholder">株価履歴なし</div>;

    return <div className="candlestick-wrap">
        <svg className="candlestick-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${points.length}営業日のローソク足と出来高`} onPointerLeave={() => setHovered(null)} onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const chartX = (event.clientX - rect.left) / rect.width * width;
            const index = Math.max(0, Math.min(points.length - 1, Math.floor((chartX - left) / step)));
            setHovered(index);
        }}>
            <line x1={left} x2={width - right} y1={priceBottom} y2={priceBottom} className="chart-grid-line" />
            <line x1={left} x2={width - right} y1={volumeTop} y2={volumeTop} className="chart-grid-line" />
            {points.map((point, index) => {
                const x = left + step * index + step / 2;
                const up = point.close >= point.open;
                const top = y(Math.max(point.open, point.close));
                const bottom = y(Math.min(point.open, point.close));
                const volumeHeight = point.volume / maxVolume * (volumeBottom - volumeTop);
                return <g key={point.date} className={up ? "candle-up" : "candle-down"}>
                    <line x1={x} x2={x} y1={y(point.high)} y2={y(point.low)} />
                    <rect x={x - candleWidth / 2} y={top} width={candleWidth} height={Math.max(1, bottom - top)} />
                    <rect className="volume-bar" x={x - candleWidth / 2} y={volumeBottom - volumeHeight} width={candleWidth} height={volumeHeight} />
                </g>;
            })}
            {hovered !== null && <line x1={left + step * hovered + step / 2} x2={left + step * hovered + step / 2} y1={priceTop} y2={volumeBottom} className="chart-crosshair" />}
            <text x={width - right + 5} y={priceTop + 7} className="chart-axis-label">{number(paddedMax, 1)}</text>
            <text x={width - right + 5} y={priceBottom} className="chart-axis-label">{number(paddedMin, 1)}</text>
            <text x={left} y={height - 5} className="chart-axis-label">{points[0].date.slice(5)}</text>
            <text x={width - right} y={height - 5} textAnchor="end" className="chart-axis-label">{points[points.length - 1].date.slice(5)}</text>
        </svg>
        {active && <div className="chart-tooltip">
            <strong>{active.date}</strong>
            <span>O {number(active.open, 1)}</span><span>H {number(active.high, 1)}</span>
            <span>L {number(active.low, 1)}</span><span>C {number(active.close, 1)}</span>
            <span>出来高 {number(active.volume, 0)}</span>
        </div>}
    </div>;
}

function ChartCard({ row, history, period, metricKeys, booleanKeys, loading, error }: {
    row: ScreenerRow;
    history: ChartPricePoint[] | undefined;
    period: ChartPeriod;
    metricKeys: string[];
    booleanKeys: string[];
    loading: boolean;
    error: string;
}) {
    const points = useMemo(() => sliceChartPeriod(history ?? [], period), [history, period]);
    const latestReturn = latestChartReturn(points);
    const ticker = String(row.ticker);
    return <article className="chart-result-card" data-ticker={ticker}>
        <header className="chart-card-header">
            <div><Link href={`/?ticker=${ticker}`} className="chart-card-title"><strong>{ticker}</strong> {String(row.company_name ?? "")}</Link><p>{String(row.market_name ?? row.market_code ?? "—")} / {String(row.sector33_name ?? row.sector33_code ?? "—")}</p></div>
            <div className="chart-card-price"><strong>{number(row.latest_valid_price, 2)}円</strong><span className={latestReturn !== null && latestReturn < 0 ? "chart-return-negative" : "chart-return-positive"}>{signed(latestReturn)}</span></div>
        </header>
        {(row.price_status !== "current" || Number(row.price_stale_sessions) > 0) && <p className="chart-stale-note">価格基準日 {String(row.price_as_of ?? "—")} / {number(row.price_stale_sessions, 0)}営業日 stale</p>}
        {!!(metricKeys.length || booleanKeys.length) && <dl className="chart-card-metrics">{metricKeys.map((key) => {
            const metric = METRIC_BY_KEY.get(key);
            if (!metric) return null;
            return <div key={key}><dt>{metric.label}</dt><dd>{number(row[key], metric.digits)}</dd></div>;
        })}{booleanKeys.map((key) => <div key={key}><dt>{METRIC_BY_KEY.get(key)?.label ?? DETAILED_FILTER_BY_KEY.get(key)?.label ?? key}</dt><dd>該当</dd></div>)}</dl>}
        {loading && !history ? <div className="chart-placeholder">チャート読み込み中...</div>
            : error && !history ? <div className="chart-placeholder chart-error">チャート取得失敗</div>
            : points.length ? <LazyCandlestickChart points={points} />
            : <div className="chart-placeholder">株価履歴なし</div>}
    </article>;
}

export default function ScreenerChartGrid({ rows, series, period, metricKeys, booleanKeys, loading, error }: {
    rows: ScreenerRow[];
    series: Record<string, ChartPricePoint[]>;
    period: ChartPeriod;
    metricKeys: string[];
    booleanKeys: string[];
    loading: boolean;
    error: string;
}) {
    return <div className="screener-chart-grid" aria-label="チャート一覧">
        {rows.map((row) => <ChartCard key={String(row.ticker)} row={row} history={series[String(row.ticker)]} period={period} metricKeys={metricKeys} booleanKeys={booleanKeys} loading={loading} error={error} />)}
    </div>;
}
