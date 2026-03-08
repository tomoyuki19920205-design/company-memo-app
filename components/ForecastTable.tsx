"use client";

import React from "react";
import type { ForecastRevision } from "@/types/forecast";
import { formatNumber, formatPercent, displayValue, formatDate } from "@/lib/format";
import ResizableTable, { type ColumnDef } from "@/components/ResizableTable";

interface ForecastTableProps {
    data: ForecastRevision[];
    loading: boolean;
}

const COLUMNS: ColumnDef[] = [
    { key: "pubdate", label: "発表日", initialWidth: 90 },
    { key: "title", label: "タイトル", initialWidth: 180 },
    { key: "period", label: "Period", initialWidth: 90 },
    { key: "quarter", label: "Q", initialWidth: 50 },
    { key: "metric", label: "指標名", initialWidth: 100 },
    { key: "before", label: "修正前", initialWidth: 90, className: "num-col" },
    { key: "after", label: "修正後", initialWidth: 90, className: "num-col" },
    { key: "delta", label: "差額", initialWidth: 90, className: "num-col" },
    { key: "pct", label: "変化率", initialWidth: 70, className: "num-col" },
    { key: "source", label: "Source", initialWidth: 60 },
];

export default function ForecastTable({ data, loading }: ForecastTableProps) {
    if (loading) {
        return (
            <div className="data-section">
                <h2 className="section-title">📝 Forecast Revision</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div className="data-section">
            <h2 className="section-title">📝 Forecast Revision</h2>
            {data.length === 0 ? (
                <div className="no-data-message">該当なし</div>
            ) : (
                <ResizableTable columns={COLUMNS} storageKey="forecast">
                    {(widths) => (
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ width: widths[0] }}>{formatDate(row.pubdate)}</td>
                                    <td style={{ width: widths[1] }} className="title-col">{displayValue(row.title)}</td>
                                    <td style={{ width: widths[2] }}>{displayValue(row.period)}</td>
                                    <td style={{ width: widths[3] }}>{displayValue(row.quarter)}</td>
                                    <td style={{ width: widths[4] }}>{displayValue(row.metric_name)}</td>
                                    <td style={{ width: widths[5] }} className="num-col">{formatNumber(row.before_value)}</td>
                                    <td style={{ width: widths[6] }} className="num-col">{formatNumber(row.after_value)}</td>
                                    <td style={{ width: widths[7] }} className="num-col">{formatNumber(row.delta_value)}</td>
                                    <td style={{ width: widths[8] }} className="num-col">{row.delta_pct !== null ? formatPercent(row.delta_pct) : "–"}</td>
                                    <td style={{ width: widths[9] }} className="source-col">{displayValue(row.source_type)}</td>
                                </tr>
                            ))}
                        </tbody>
                    )}
                </ResizableTable>
            )}
        </div>
    );
}
