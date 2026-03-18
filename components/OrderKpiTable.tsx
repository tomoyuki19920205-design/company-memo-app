"use client";

import React, { useMemo } from "react";
import type { OrderKpiItem } from "@/types/order-kpi";
import { formatOrderKpiLabel, ORDER_KPI_DISPLAY_ORDER } from "@/types/order-kpi";

/** 数値をカンマ区切りで表示 */
function fmtNum(v: number | null | undefined): string {
    if (v == null) return "—";
    return v.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

/**
 * fiscal_year を解析して { year, month } を返す
 * "2026年3月期" → { year: 2026, month: 3 }
 * "2025年12月期" → { year: 2025, month: 12 }
 * "" / null → null
 */
function parseFiscalYear(fy: string | null | undefined): { year: number; month: number } | null {
    if (!fy) return null;
    const m = fy.match(/(\d{4})年(\d{1,2})月期/);
    if (!m) return null;
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

/**
 * PERIOD表示を生成
 * fiscal_year + quarter が使える → "2026/3期 3Q"
 * fiscal_year のみ → "2026/3期"
 * 両方なし → filing_date からのフォールバック
 */
function fmtPeriod(item: OrderKpiItem): string {
    const fy = parseFiscalYear(item.fiscal_year);
    if (fy) {
        return `${fy.year}/${fy.month}期`;
    }
    // フォールバック: filing_date から推定
    if (item.filing_date) {
        return item.filing_date.substring(0, 7).replace("-", "/");
    }
    return "—";
}

function fmtQuarter(item: OrderKpiItem): string {
    if (item.quarter) return item.quarter;
    return "—";
}

/** ピボット行の型 */
interface PivotRow {
    periodDisplay: string;
    quarterDisplay: string;
    sortKey: string; // fiscal_year + quarter でソート
    values: Record<string, number | null>;
}

interface Props {
    data: OrderKpiItem[];
    loading: boolean;
}

export default function OrderKpiTable({ data, loading }: Props) {
    const { rows, kpiColumns } = useMemo(() => {
        if (!data || data.length === 0) return { rows: [] as PivotRow[], kpiColumns: [] as string[] };

        const kpiSet = new Set<string>();
        const rowMap = new Map<string, PivotRow>();

        for (const item of data) {
            const periodDisplay = fmtPeriod(item);
            const quarterDisplay = fmtQuarter(item);
            const pivotKey = `${periodDisplay}|${quarterDisplay}`;

            kpiSet.add(item.canonical_kpi_name);

            // ソートキー: fiscal_year数値 + quarter番号 (降順用)
            const fy = parseFiscalYear(item.fiscal_year);
            const qNum = item.quarter?.match(/(\d)/)?.[1] ?? "9";
            const sortKey = fy
                ? `${fy.year}${String(fy.month).padStart(2, "0")}_${qNum}`
                : `${item.filing_date ?? "0000-00-00"}_${qNum}`;

            if (!rowMap.has(pivotKey)) {
                rowMap.set(pivotKey, {
                    periodDisplay,
                    quarterDisplay,
                    sortKey,
                    values: {},
                });
            }

            const row = rowMap.get(pivotKey)!;
            if (row.values[item.canonical_kpi_name] == null) {
                row.values[item.canonical_kpi_name] = item.normalized_value;
            }
        }

        const kpiColumns = ORDER_KPI_DISPLAY_ORDER.filter(k => kpiSet.has(k));

        // 降順ソート (最新が上)
        const rows = Array.from(rowMap.values()).sort((a, b) =>
            b.sortKey.localeCompare(a.sortKey)
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

    if (rows.length === 0) return null;

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
                                <td className="order-kpi-td-period">{row.periodDisplay}</td>
                                <td className="order-kpi-td-quarter">{row.quarterDisplay}</td>
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
