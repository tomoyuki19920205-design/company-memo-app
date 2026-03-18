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

function fmtInt(val: number | null): string {
    if (val === null) return "—";
    return val.toLocaleString("ja-JP");
}

/** period "2025-03-31" → "2025.3" */
function shortPeriod(period: string): string {
    const m = period.match(/^(\d{4})-(\d{2})/);
    if (!m) return period;
    return `${m[1]}.${parseInt(m[2])}`;
}

export default function PerShareTable({ data, loading }: PerShareTableProps) {
    if (loading) {
        return (
            <div className="per-share-section">
                <h3 className="per-share-title">1株指標</h3>
                <div className="per-share-loading">読込中...</div>
            </div>
        );
    }

    // FY行だけ一覧表示 (年度ベース)
    const fyRows = data.filter((r) => r.quarter === "FY");
    if (fyRows.length === 0) {
        // FYが無ければ最新の行を表示
        if (data.length === 0) {
            return (
                <div className="per-share-section">
                    <h3 className="per-share-title">1株指標</h3>
                    <div className="per-share-empty">データなし</div>
                </div>
            );
        }
    }

    const rows = fyRows.length > 0 ? fyRows : data.slice(0, 5);

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
                                    {fmt(r.forecast_eps)}
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
