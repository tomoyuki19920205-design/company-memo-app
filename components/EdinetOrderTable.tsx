"use client";

import React, { useMemo } from "react";
import type { EdinetOrderRecord } from "@/types/edinet-order";

/** 数値（百万円）をカンマ区切りで表示。null は「—」 */
function fmtNum(v: number | null | undefined): string {
    if (v == null) return "—";
    return v.toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + "百万円";
}

/** YYYY-MM-DD → YYYY/MM/DD */
function fmtPeriod(period: string): string {
    return period.replace(/-/g, "/");
}

/** confidence → 表示テキスト */
function fmtConfidence(c: string): string {
    if (c === "high")   return "高";
    if (c === "medium") return "中";
    return "—";
}

/** confidence → CSS クラス */
function confClass(c: string): string {
    if (c === "high")   return "edinet-conf-high";
    if (c === "medium") return "edinet-conf-medium";
    return "edinet-conf-low";
}

interface Props {
    data: EdinetOrderRecord[];
    loading: boolean;
}

function EdinetOrderTable({ data, loading }: Props) {
    // confidence=low の行は数値を出さない（行自体は表示してデータなしとする）
    const rows = useMemo(() => {
        return [...data].sort((a, b) => b.period.localeCompare(a.period));
    }, [data]);

    if (loading) {
        return (
            <div className="edinet-order-table-card">
                <div className="edinet-order-table-loading">読み込み中...</div>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="edinet-order-table-card">
                <div className="edinet-order-table-loading">データなし</div>
            </div>
        );
    }

    return (
        <div className="edinet-order-table-card">
            <div className="edinet-order-table-meta">
                <span className="edinet-order-table-source">出典: EDINET有報（年次）</span>
            </div>
            <div className="edinet-order-table-wrap">
                <table className="edinet-order-tbl">
                    <thead>
                        <tr>
                            <th className="edinet-th-period">期末日</th>
                            <th className="edinet-th-value">受注高</th>
                            <th className="edinet-th-value">受注残高</th>
                            <th className="edinet-th-value">繰越工事高</th>
                            <th className="edinet-th-value">完成工事高</th>
                            <th className="edinet-th-value">残存履行義務（RPO）</th>
                            <th className="edinet-th-conf">信頼度</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => {
                            const isLow = row.confidence === "low";
                            return (
                                <tr key={idx} className={isLow ? "edinet-row-low" : ""}>
                                    <td className="edinet-td-period">{fmtPeriod(row.period)}</td>
                                    <td className="edinet-td-value">{isLow ? "—" : fmtNum(row.orders_received)}</td>
                                    <td className="edinet-td-value">{isLow ? "—" : fmtNum(row.order_backlog)}</td>
                                    <td className="edinet-td-value">{isLow ? "—" : fmtNum(row.construction_carryover)}</td>
                                    <td className="edinet-td-value">{isLow ? "—" : fmtNum(row.completed_construction)}</td>
                                    <td className="edinet-td-value">{isLow ? "—" : fmtNum(row.rpo)}</td>
                                    <td className="edinet-td-conf">
                                        <span className={confClass(row.confidence)}>
                                            {fmtConfidence(row.confidence)}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default React.memo(EdinetOrderTable);
