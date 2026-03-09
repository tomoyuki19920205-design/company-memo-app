"use client";

import React, { useMemo } from "react";
import type { SegmentRecord } from "@/types/segment";
import { formatMillions } from "@/lib/format";

interface SegmentTableProps {
    data: SegmentRecord[];
    loading: boolean;
}

// Quarter ソート順
const QUARTER_ORDER: Record<string, number> = {
    "1Q": 0,
    "2Q": 1,
    "3Q": 2,
    "4Q": 3,
    "FY": 4,
};

interface SegmentGroup {
    period: string;
    quarter: string;
    segments: {
        name: string;
        sales: number | null;
        profit: number | null;
        profitRate: number | null;
    }[];
}

function calcProfitRate(
    profit: number | null,
    sales: number | null
): number | null {
    if (profit === null || sales === null || sales === 0) return null;
    return (profit / sales) * 100;
}

export default function SegmentTable({ data, loading }: SegmentTableProps) {
    // period/quarter ごとにグループ化して表示順にソート
    const groups = useMemo<SegmentGroup[]>(() => {
        if (!data || data.length === 0) return [];

        const map = new Map<string, SegmentGroup>();

        for (const row of data) {
            const key = `${row.period}|${row.quarter}`;
            if (!map.has(key)) {
                map.set(key, {
                    period: row.period,
                    quarter: row.quarter,
                    segments: [],
                });
            }
            map.get(key)!.segments.push({
                name: row.segment_name,
                sales: row.segment_sales,
                profit: row.segment_profit,
                profitRate: calcProfitRate(
                    row.segment_profit,
                    row.segment_sales
                ),
            });
        }

        // ソート: period DESC → quarter DESC
        return Array.from(map.values()).sort((a, b) => {
            const periodCmp = b.period.localeCompare(a.period);
            if (periodCmp !== 0) return periodCmp;
            const qa = QUARTER_ORDER[a.quarter] ?? 9;
            const qb = QUARTER_ORDER[b.quarter] ?? 9;
            return qb - qa;
        });
    }, [data]);

    if (loading) {
        return (
            <div className="data-section segment-section">
                <h2 className="section-title">📊 セグメント業績</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div className="data-section segment-section">
            <h2 className="section-title">📊 セグメント業績</h2>
            {groups.length === 0 ? (
                <div className="no-data-message">セグメントデータなし</div>
            ) : (
                <div className="segment-scroll-area">
                    {groups.map((group) => (
                        <div
                            key={`${group.period}-${group.quarter}`}
                            className="segment-group"
                        >
                            <div className="segment-group-header">
                                <span className="segment-period">
                                    {group.period}
                                </span>
                                <span className="segment-quarter">
                                    {group.quarter}
                                </span>
                            </div>
                            <table className="segment-table">
                                <thead>
                                    <tr>
                                        <th>セグメント名</th>
                                        <th className="num-col">売上</th>
                                        <th className="num-col">利益</th>
                                        <th className="num-col">利益率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.segments.map((seg, idx) => (
                                        <tr key={`${seg.name}-${idx}`}>
                                            <td className="segment-name-col">
                                                {seg.name}
                                            </td>
                                            <td className="num-col">
                                                {seg.sales !== null
                                                    ? formatMillions(seg.sales)
                                                    : "–"}
                                            </td>
                                            <td className="num-col">
                                                {seg.profit !== null
                                                    ? formatMillions(seg.profit)
                                                    : "–"}
                                            </td>
                                            <td className="num-col">
                                                {seg.profitRate !== null
                                                    ? `${seg.profitRate.toFixed(1)}%`
                                                    : "–"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
