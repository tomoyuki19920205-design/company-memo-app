"use client";

import React from "react";
import type { MonthlyRecord } from "@/types/monthly";
import { formatNumber, displayValue, formatDate } from "@/lib/format";
import ResizableTable, { type ColumnDef } from "@/components/ResizableTable";

interface MonthlyTableProps {
    data: MonthlyRecord[];
    loading: boolean;
}

const COLUMNS: ColumnDef[] = [
    { key: "pubdate", label: "発表日", initialWidth: 90 },
    { key: "year_month", label: "年月", initialWidth: 80 },
    { key: "metric", label: "指標名", initialWidth: 120 },
    { key: "value", label: "値", initialWidth: 100, className: "num-col" },
    { key: "unit", label: "単位", initialWidth: 60 },
    { key: "segment", label: "セグメント", initialWidth: 100 },
    { key: "source", label: "Source", initialWidth: 60 },
];

export default function MonthlyTable({ data, loading }: MonthlyTableProps) {
    if (loading) {
        return (
            <div className="data-section">
                <h2 className="section-title">📅 Monthly</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div className="data-section">
            <h2 className="section-title">📅 Monthly</h2>
            {data.length === 0 ? (
                <div className="no-data-message">該当なし</div>
            ) : (
                <ResizableTable columns={COLUMNS} storageKey="monthly">
                    {(widths) => (
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ width: widths[0] }}>{formatDate(row.pubdate)}</td>
                                    <td style={{ width: widths[1] }}>{displayValue(row.year_month) || formatDate(row.pubdate)}</td>
                                    <td style={{ width: widths[2] }}>{displayValue(row.metric_name)}</td>
                                    <td style={{ width: widths[3] }} className="num-col">{formatNumber(row.metric_value)}</td>
                                    <td style={{ width: widths[4] }}>{displayValue(row.unit)}</td>
                                    <td style={{ width: widths[5] }}>{displayValue(row.segment_name)}</td>
                                    <td style={{ width: widths[6] }} className="source-col">{displayValue(row.source_type)}</td>
                                </tr>
                            ))}
                        </tbody>
                    )}
                </ResizableTable>
            )}
        </div>
    );
}
