"use client";

import React from "react";
import type { KpiRecord } from "@/types/kpi";
import { formatNumber, displayValue, formatDate } from "@/lib/format";
import ResizableTable, { type ColumnDef } from "@/components/ResizableTable";

interface KpiTableProps {
    data: KpiRecord[];
    loading: boolean;
}

const COLUMNS: ColumnDef[] = [
    { key: "pubdate", label: "発表日", initialWidth: 90 },
    { key: "period", label: "Period", initialWidth: 90 },
    { key: "quarter", label: "Q", initialWidth: 50 },
    { key: "metric", label: "指標名", initialWidth: 120 },
    { key: "value", label: "値", initialWidth: 100, className: "num-col" },
    { key: "unit", label: "単位", initialWidth: 60 },
    { key: "segment", label: "セグメント", initialWidth: 100 },
    { key: "table_title", label: "テーブル名", initialWidth: 150 },
    { key: "source", label: "Source", initialWidth: 60 },
];

export default function KpiTable({ data, loading }: KpiTableProps) {
    if (loading) {
        return (
            <div className="data-section">
                <h2 className="section-title">📈 KPI</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div className="data-section">
            <h2 className="section-title">📈 KPI</h2>
            {data.length === 0 ? (
                <div className="no-data-message">該当なし</div>
            ) : (
                <ResizableTable columns={COLUMNS} storageKey="kpi">
                    {(widths) => (
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ width: widths[0] }}>{formatDate(row.pubdate)}</td>
                                    <td style={{ width: widths[1] }}>{displayValue(row.period)}</td>
                                    <td style={{ width: widths[2] }}>{displayValue(row.quarter)}</td>
                                    <td style={{ width: widths[3] }}>{displayValue(row.metric_name)}</td>
                                    <td style={{ width: widths[4] }} className="num-col">{formatNumber(row.metric_value)}</td>
                                    <td style={{ width: widths[5] }}>{displayValue(row.unit)}</td>
                                    <td style={{ width: widths[6] }}>{displayValue(row.segment_name)}</td>
                                    <td style={{ width: widths[7] }} className="title-col">{displayValue(row.table_title)}</td>
                                    <td style={{ width: widths[8] }} className="source-col">{displayValue(row.source_type)}</td>
                                </tr>
                            ))}
                        </tbody>
                    )}
                </ResizableTable>
            )}
        </div>
    );
}
