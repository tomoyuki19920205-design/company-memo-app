"use client";

import React, { useMemo } from "react";
import type { OrderKpiItem } from "@/types/order-kpi";
import { formatOrderKpiLabel, ORDER_KPI_DISPLAY_ORDER } from "@/types/order-kpi";

/** 数値をカンマ区切りで表示 */
function fmtNum(v: number | null | undefined): string {
    if (v == null) return "—";
    return v.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

/** period_label "2026-02" → "2026/02" 表示用 */
function fmtPeriod(p: string | null | undefined): string {
    if (!p) return "—";
    return p.replace(/-/g, "/");
}

/** quarter を表示用に整形 ("1Q" → "1Q", null → "—") */
function fmtQuarter(q: string | null | undefined): string {
    if (!q) return "—";
    return q;
}

/** ピボット行の型 */
interface PivotRow {
    period: string;
    quarter: string;
    filingDate: string;
    values: Record<string, number | null>;
}

interface Props {
    data: OrderKpiItem[];
    loading: boolean;
}

export default function OrderKpiTable({ data, loading }: Props) {
    // ピボット: (period, quarter) → { kpi_name: value }
    const { rows, kpiColumns } = useMemo(() => {
        if (!data || data.length === 0) return { rows: [] as PivotRow[], kpiColumns: [] as string[] };

        // 存在するKPIの集合を収集
        const kpiSet = new Set<string>();
        const rowMap = new Map<string, PivotRow>();

        for (const item of data) {
            const period = item.filing_date ?? "unknown";
            const quarter = "—"; // 現状 quarter が null の場合
            // period_label がある場合はそちらを優先
            const periodKey = `${period}|${quarter}`;

            kpiSet.add(item.canonical_kpi_name);

            if (!rowMap.has(periodKey)) {
                rowMap.set(periodKey, {
                    period,
                    quarter,
                    filingDate: item.filing_date ?? "",
                    values: {},
                });
            }

            const row = rowMap.get(periodKey)!;
            // 同一KPIが複数ある場合は confidence が高い方を優先 (best view から来るので通常は1つ)
            if (row.values[item.canonical_kpi_name] == null || 
                (item.normalized_value != null && item.normalized_value > (row.values[item.canonical_kpi_name] ?? 0))) {
                row.values[item.canonical_kpi_name] = item.normalized_value;
            }
        }

        // KPIカラムを表示順に並べる
        const kpiColumns = ORDER_KPI_DISPLAY_ORDER.filter(k => kpiSet.has(k));

        // 行をperiod降順にソート
        const rows = Array.from(rowMap.values()).sort((a, b) => 
            b.period.localeCompare(a.period)
        );

        return { rows, kpiColumns };
    }, [data]);

    if (loading) {
        return (
            <div className="order-kpi-table-card">
                <div className="order-kpi-table-header">
                    <h3 className="order-kpi-table-title">受注KPI</h3>
                </div>
                <div className="order-kpi-table-loading">読み込み中...</div>
            </div>
        );
    }

    if (rows.length === 0) {
        return null; // データなしなら非表示
    }

    return (
        <div className="order-kpi-table-card">
            <div className="order-kpi-table-header">
                <h3 className="order-kpi-table-title">受注KPI</h3>
                <span className="order-kpi-table-unit">単位: 百万円</span>
            </div>
            <div className="order-kpi-table-wrap">
                <table className="order-kpi-tbl">
                    <thead>
                        <tr>
                            <th className="order-kpi-th-period">PERIOD</th>
                            <th className="order-kpi-th-quarter">Q</th>
                            {kpiColumns.map(kpi => (
                                <th key={kpi} className="order-kpi-th-value">
                                    {formatOrderKpiLabel(kpi)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => (
                            <tr key={idx}>
                                <td className="order-kpi-td-period">{fmtPeriod(row.period)}</td>
                                <td className="order-kpi-td-quarter">{fmtQuarter(row.quarter)}</td>
                                {kpiColumns.map(kpi => (
                                    <td key={kpi} className="order-kpi-td-value">
                                        {fmtNum(row.values[kpi])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
