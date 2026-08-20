"use client";

import React from "react";
import type { PerShareRecord } from "@/types/market-data";

interface PerShareTableProps {
    data: PerShareRecord[];
    loading: boolean;
}

export function epsResultClass(
    actual: number | null,
    initialForecast: number | null,
): "per-share-eps-beat" | "per-share-eps-miss" | null {
    if (
        actual === null ||
        initialForecast === null ||
        !Number.isFinite(actual) ||
        !Number.isFinite(initialForecast)
    ) return null;
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const actualRounded = round(actual);
    const forecastRounded = round(initialForecast);
    if (actualRounded > forecastRounded) return "per-share-eps-beat";
    if (actualRounded < forecastRounded) return "per-share-eps-miss";
    return null;
}

function fmt(val: number | null): string {
    if (val === null) return "—";
    return val.toLocaleString("ja-JP", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}


/** period "2025-03-31" → "2025.3" */
function shortPeriod(period: string): string {
    const m = period.match(/^(\d{4})-(\d{2})/);
    if (!m) return period;
    return `${m[1]}.${parseInt(m[2])}`;
}

export function selectPerShareDisplayRows(data: PerShareRecord[]): PerShareRecord[] {
    const actualFyRows = data
        .filter((row) => row.quarter === "FY" && row.eps !== null)
        .sort((a, b) => b.period.localeCompare(a.period))
        .slice(0, 4);
    const latestActualPeriod = actualFyRows[0]?.period ?? "";
    const forecastPeriods = data
        .filter((row) =>
            row.period > latestActualPeriod &&
            (row.forecast_eps !== null || row.forecast_dividend_annual !== null),
        )
        .map((row) => row.period);
    const latestForecastPeriod = forecastPeriods.sort((a, b) => b.localeCompare(a))[0];
    const forecastRow = latestForecastPeriod
        ? data
            .filter((row) => row.period === latestForecastPeriod)
            .sort((a, b) =>
                (b.disclosed_date ?? "").localeCompare(a.disclosed_date ?? ""),
            )[0] ?? null
        : null;

    return [...(forecastRow ? [forecastRow] : []), ...actualFyRows];
}

function PerShareTable({ data, loading }: PerShareTableProps) {
    if (loading) {
        return (
            <div className="per-share-section">
                <h3 className="per-share-title">1株指標</h3>
                <div className="per-share-loading">読込中...</div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="per-share-section">
                <h3 className="per-share-title">1株指標</h3>
                <div className="per-share-empty">データなし</div>
            </div>
        );
    }

    // 最新年度はFY固定ではなく最新開示を表示し、過年度はFY実績を表示する。
    const rows = selectPerShareDisplayRows(data);

    if (rows.length === 0) {
        return (
            <div className="per-share-section">
                <h3 className="per-share-title">1株指標</h3>
                <div className="per-share-empty">データなし</div>
            </div>
        );
    }

    return (
        <div className="per-share-section" id="per-share-table">
            <h3 className="per-share-title">1株指標</h3>
            <div className="per-share-table-wrap">
                <table className="per-share-table">
                    <thead>
                        <tr>
                            <th>年度</th>
                            <th>EPS (実績)</th>
                            <th>EPS (予想)</th>
                            <th>配当 (実績)</th>
                            <th>配当 (予想)</th>
                            <th>BPS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={`${r.period}-${r.quarter}`}>
                                <td className="per-share-period">
                                    {shortPeriod(r.period)}
                                </td>
                                <td className={["per-share-num", epsResultClass(r.quarter === "FY" ? r.eps : null, r.initial_forecast_eps)].filter(Boolean).join(" ")}>{fmt(r.quarter === "FY" ? r.eps : null)}</td>
                                <td className="per-share-num forecast-val">
                                    {r.quarter === "FY" && r.eps !== null
                                        ? fmt(r.initial_forecast_eps)
                                        : fmt(r.forecast_eps ?? r.initial_forecast_eps)}
                                </td>
                                <td className="per-share-num">
                                    {fmt(r.quarter === "FY" ? r.dividend_annual : null)}
                                </td>
                                <td className="per-share-num forecast-val">
                                    {fmt(r.forecast_dividend_annual)}
                                </td>
                                <td className="per-share-num">{fmt(r.bps)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default React.memo(PerShareTable);
