"use client";

import React from "react";
import type { PerShareRecord } from "@/types/market-data";

interface PerShareTableProps {
    data: PerShareRecord[];
    loading: boolean;
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

function PerShareTable({ data, loading }: PerShareTableProps) {
    if (loading) {
        return (
            <div className="per-share-section">
                <h3 className="per-share-title">1株指標</h3>
                <div className="per-share-loading">読込中...</div>
            </div>
        );
    }

    // FY行だけ年度ベースで表示
    const fyRows = data.filter((r) => r.quarter === "FY");

    // 実績行 (eps あり) を period 降順で最大4件
    const actualFyRows = fyRows
        .filter((r) => r.eps !== null)
        .sort((a, b) => b.period.localeCompare(a.period))
        .slice(0, 4);

    // 最新実績の period（予想行フィルタ用）
    const latestActualPeriod =
        actualFyRows.length > 0 ? actualFyRows[0].period : "";

    // 予想専用行: eps=null かつ forecast_eps あり かつ period > 最新実績
    // NxFEPS から生成した翌期予想行。実績が来たら自動的にフィルタ対象外になる。
    const forecastOnlyRow = fyRows
        .filter(
            (r) =>
                r.eps === null &&
                r.forecast_eps !== null &&
                r.period > latestActualPeriod,
        )
        .sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;

    if (fyRows.length === 0 && data.length === 0) {
        return (
            <div className="per-share-section">
                <h3 className="per-share-title">1株指標</h3>
                <div className="per-share-empty">データなし</div>
            </div>
        );
    }

    // 表示行: [翌期予想専用行(最大1)] + [実績FY行(最大4)]
    const rows: PerShareRecord[] = [
        ...(forecastOnlyRow ? [forecastOnlyRow] : []),
        ...actualFyRows,
    ];

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
                                <td className="per-share-num">{fmt(r.eps)}</td>
                                <td className="per-share-num forecast-val">
                                    {r.eps === null
                                        ? fmt(r.forecast_eps ?? r.initial_forecast_eps)
                                        : fmt(r.initial_forecast_eps)}
                                </td>
                                <td className="per-share-num">
                                    {fmt(r.dividend_annual)}
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
