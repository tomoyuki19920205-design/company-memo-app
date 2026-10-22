"use client";

import { useEffect, useRef, useState } from "react";
import { MARGIN_SECTORS, buildMarginChartPoints, buildMarginMarketChartPoints, type MarginChartPoint,
  type MarginFrequency, type MarginIndexBars, type MarginViewRow } from "@/lib/margin-interest";

const format = (value: number | null, digits = 2) => value === null ? "—" :
  value.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function SectorChart({ name, points, frequency }: {
  name: string; points: MarginChartPoint[]; frequency: MarginFrequency;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = 520, height = 284, left = 62, right = 66, top = 20, bottom = 222;
  const plotWidth = width - left - right, plotHeight = bottom - top;
  const prices = points.filter((point) => point.high !== null && point.low !== null);
  const minPrice = prices.length ? Math.min(...prices.map((point) => point.low!)) : 0;
  const maxPrice = prices.length ? Math.max(...prices.map((point) => point.high!)) : 1;
  const pricePad = Math.max((maxPrice - minPrice) * 0.08, maxPrice * 0.005, 1);
  const priceBottom = Math.max(0, minPrice - pricePad), priceTop = maxPrice + pricePad;
  const maxMoney = Math.max(...points.map((point) => point.marginOku ?? 0), 1) * 1.12;
  const step = plotWidth / Math.max(points.length, 1);
  const candleWidth = Math.max(2, Math.min(12, step * 0.5));
  const barWidth = Math.max(3, Math.min(18, step * 0.75));
  const priceY = (value: number) => top + (priceTop - value) / (priceTop - priceBottom) * plotHeight;
  const moneyY = (value: number) => bottom - value / maxMoney * plotHeight;
  const active = hovered === null ? null : points[hovered];
  const latest = points.at(-1);
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
    .filter((index) => index >= 0 && index < points.length);

  return <article className="margin-chart-card" data-sector={name}>
    <header><h2>{name}</h2>{latest?.provisional && <span className="margin-week-status provisional">
      暫定・{latest.date}</span>}{points.some((point) => point.missing) &&
      <span className="margin-week-status missing" title={points.filter((point) => point.missing)
        .map((point) => point.date).join("、")}>週末残高欠損</span>}</header>
    <div className="margin-chart-legend"><span className="margin-candle-key">指数ローソク足</span>
      <span className="margin-bar-key">信用買い残金額</span></div>
    <div ref={host} className="margin-chart-host">
      {!visible ? <div className="margin-chart-placeholder">表示範囲に入ると描画します</div>
        : !points.length ? <div className="margin-chart-placeholder">指定期間のデータなし</div>
          : <div className="margin-chart-plot">
            <svg viewBox={`0 0 ${width} ${height}`} role="img"
              aria-label={`${name}の${frequency === "daily" ? "日足" : "週足"}指数と信用買い残金額`}
              onPointerLeave={() => setHovered(null)} onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width * width;
                setHovered(Math.max(0, Math.min(points.length - 1, Math.floor((x - left) / step))));
              }}>
              {[0, 0.5, 1].map((fraction) => <g key={fraction}>
                <line className="margin-chart-gridline" x1={left} x2={width - right}
                  y1={top + fraction * plotHeight} y2={top + fraction * plotHeight} />
                <text className="margin-chart-axis-text" x={left - 6} y={top + fraction * plotHeight + 4}
                  textAnchor="end">{format(priceTop - fraction * (priceTop - priceBottom), 0)}</text>
                <text className="margin-chart-axis-text" x={width - right + 6} y={top + fraction * plotHeight + 4}>
                  {format((1 - fraction) * maxMoney, 0)}</text>
              </g>)}
              <text className="margin-chart-axis-title" x={left} y={11}>指数（pt）</text>
              <text className="margin-chart-axis-title" x={width - right} y={11} textAnchor="end">買い残（億円）</text>
              {points.map((point, index) => point.marginOku === null ? null : <rect key={`bar-${point.date}`}
                data-date={point.date} className="margin-chart-bar"
                x={left + step * (index + 0.5) - barWidth / 2} y={moneyY(point.marginOku)}
                width={barWidth} height={bottom - moneyY(point.marginOku)} />)}
              {points.map((point, index) => point.open === null || point.high === null ||
                point.low === null || point.close === null ? null : <g key={`candle-${point.date}`}
                data-date={point.date} className={point.close >= point.open ? "margin-chart-up" : "margin-chart-down"}>
                <line x1={left + step * (index + 0.5)} x2={left + step * (index + 0.5)}
                  y1={priceY(point.high)} y2={priceY(point.low)} />
                <rect x={left + step * (index + 0.5) - candleWidth / 2}
                  y={priceY(Math.max(point.open, point.close))} width={candleWidth}
                  height={Math.max(2, Math.abs(priceY(point.open) - priceY(point.close)))} />
              </g>)}
              {active && <line className="margin-chart-crosshair"
                x1={left + step * (hovered! + 0.5)} x2={left + step * (hovered! + 0.5)} y1={top} y2={bottom} />}
              {ticks.map((index) => <text key={index} className="margin-chart-axis-text"
                x={left + step * (index + 0.5)} y={height - 18} textAnchor="middle">
                {points[index].date.slice(5)}</text>)}
              <text className="margin-chart-axis-title" x={left + plotWidth / 2} y={height - 2}
                textAnchor="middle">残高基準日</text>
            </svg>
            {active && <div className="margin-chart-tooltip" role="status">
              <strong>{active.date}{active.provisional ? "（暫定）" : ""}{active.missing ? "（買い残欠損）" : ""}</strong>
              <span>始値 {format(active.open)} pt</span><span>高値 {format(active.high)} pt</span>
              <span>安値 {format(active.low)} pt</span><span>終値 {format(active.close)} pt</span>
              <span>信用買い残 {format(active.marginOku)} 億円</span>
            </div>}
          </div>}
    </div>
  </article>;
}

export default function MarginSectorCharts({ viewRows, calendarDays, indexBars, weeklyBars, frequency }: {
  viewRows: MarginViewRow[]; calendarDays: string[]; indexBars: MarginIndexBars; weeklyBars: MarginIndexBars;
  frequency: MarginFrequency;
}) {
  return <div className="margin-chart-grid" aria-label="市場全体と東証33業種の複合チャート">
    <SectorChart name="市場全体（TOPIX）" frequency={frequency} points={buildMarginMarketChartPoints(
      viewRows, calendarDays, indexBars, frequency, weeklyBars)} />
    {MARGIN_SECTORS.map((sector) => <SectorChart key={sector.code} name={sector.name}
      frequency={frequency} points={buildMarginChartPoints(
        viewRows, calendarDays, indexBars, sector.code, sector.indexCode, frequency, weeklyBars)} />)}
  </div>;
}
