"use client";

import React, { useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { FinancialRecord } from "@/types/financial";
import { formatMillions, displayValue } from "@/lib/format";
import { useColumnResize, type ColumnDef } from "@/components/ResizableTable";
import type { GridData } from "@/lib/memo-api";
import { parseTsvClipboard } from "@/lib/tsv-parser";
import {
    filterLast5Years,
    buildCumulativeRows,
    buildQStandaloneRows,
    sortForDisplay,
    type CumulativeRow,
    type QStandaloneRow,
} from "@/lib/quarter-math";

interface MemoMap {
    [key: string]: GridData;
}

interface FinancialsTableProps {
    data: FinancialRecord[];
    loading: boolean;
    selectedPeriod?: string;
    selectedQuarter?: string;
    onRowClick?: (period: string, quarter: string) => void;
    memoMap?: MemoMap;
    onMemoEdit?: (period: string, quarter: string, colIdx: number, value: string) => void;
    onMemoPaste?: (
        rows: { period: string; quarter: string; colIdx: number; value: string }[]
    ) => void;
}

// ============================================================
// 列定義
// ============================================================
const CUM_COLUMNS: ColumnDef[] = [
    { key: "period", label: "PERIOD", initialWidth: 100 },
    { key: "quarter", label: "Q", initialWidth: 45 },
    { key: "sales", label: "SALES", initialWidth: 90, className: "num-col" },
    { key: "gp", label: "GP", initialWidth: 85, className: "num-col" },
    { key: "sga", label: "管理費", initialWidth: 85, className: "num-col" },
    { key: "op", label: "OP", initialWidth: 85, className: "num-col" },
    { key: "op_margin", label: "営業利益率", initialWidth: 75, className: "num-col" },
    { key: "memo_a", label: "Memo A", initialWidth: 130 },
    { key: "memo_b", label: "Memo B", initialWidth: 130 },
];

const Q_COLUMNS: ColumnDef[] = [
    { key: "period", label: "PERIOD", initialWidth: 100 },
    { key: "quarter", label: "Q", initialWidth: 45 },
    { key: "sales", label: "SALES", initialWidth: 90, className: "num-col" },
    { key: "gp", label: "GP", initialWidth: 85, className: "num-col" },
    { key: "sga", label: "管理費", initialWidth: 85, className: "num-col" },
    { key: "op", label: "OP", initialWidth: 85, className: "num-col" },
    { key: "op_margin", label: "営業利益率", initialWidth: 75, className: "num-col" },
];

// ============================================================
// フォーマッタ
// ============================================================
function fmtMargin(val: number | null): string {
    if (val === null || val === undefined) return "–";
    return `${val.toFixed(1)}%`;
}

function extractMemoPreview(gridData: GridData | undefined, colIdx: number): string {
    if (!gridData || !gridData[0]) return "";
    const val = gridData[0]?.[colIdx];
    if (!val) return "";
    return val.replace(/[\r\n]+/g, " ").trim();
}

// ============================================================
// Editable Memo Cell
// ============================================================
function EditableMemoCell({
    value,
    width,
    onCommit,
    onPaste,
}: {
    value: string;
    width: number;
    onCommit: (val: string) => void;
    onPaste: (e: React.ClipboardEvent) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editing) setEditValue(value);
    }, [value, editing]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditing(true);
        setEditValue(value);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleBlur = () => {
        setEditing(false);
        if (editValue !== value) {
            onCommit(editValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
        }
        if (e.key === "Escape") {
            setEditValue(value);
            setEditing(false);
        }
    };

    const handleCellPaste = (e: React.ClipboardEvent) => {
        if (editing) return;
        onPaste(e);
    };

    const preview = value ? value.replace(/[\r\n]+/g, " ").trim() : "";

    if (editing) {
        return (
            <td
                style={{ width, minWidth: width }}
                className="memo-cell memo-cell-editing"
                onPaste={handleCellPaste}
            >
                <input
                    ref={inputRef}
                    className="memo-inline-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                />
            </td>
        );
    }

    return (
        <td
            style={{ width, minWidth: width }}
            className="memo-cell memo-cell-editable"
            title={preview}
            onDoubleClick={handleDoubleClick}
            onPaste={handleCellPaste}
        >
            {preview || <span className="memo-empty">–</span>}
        </td>
    );
}

// ============================================================
// PLテーブルヘッダー (直接描画、ResizableTable不使用)
// ============================================================
function PLTableHeader({
    columns,
    widths,
    onResizeStart,
}: {
    columns: ColumnDef[];
    widths: number[];
    onResizeStart: (colIndex: number, e: React.MouseEvent) => void;
}) {
    return (
        <thead>
            <tr>
                {columns.map((col, idx) => (
                    <th
                        key={col.key}
                        className={col.className || ""}
                        style={{ width: widths[idx], minWidth: widths[idx] }}
                    >
                        <div className="th-content">
                            <span>{col.label}</span>
                            <div
                                className="resize-handle"
                                onMouseDown={(e) => onResizeStart(idx, e)}
                            />
                        </div>
                    </th>
                ))}
            </tr>
        </thead>
    );
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function FinancialsTable({
    data,
    loading,
    selectedPeriod,
    selectedQuarter,
    onRowClick,
    memoMap,
    onMemoEdit,
    onMemoPaste,
}: FinancialsTableProps) {
    const filtered = useMemo(() => filterLast5Years(data), [data]);
    const sorted = useMemo(() => sortForDisplay(filtered), [filtered]);
    const cumRows = useMemo(() => buildCumulativeRows(sorted), [sorted]);
    const qRows = useMemo(() => buildQStandaloneRows(sorted), [sorted]);

    // 列幅管理
    const cumResize = useColumnResize({ storageKey: "pl-cum-v2", columns: CUM_COLUMNS });
    const qResize = useColumnResize({ storageKey: "pl-q-v2", columns: Q_COLUMNS });

    // テーブル全体の min-width を列幅合計から計算
    const cumTableWidth = cumResize.widths.reduce((s, w) => s + w, 0);
    const qTableWidth = qResize.widths.reduce((s, w) => s + w, 0);

    // --- PL側メモペースト処理 ---
    const handleMemoPaste = useCallback(
        (startRowIdx: number, startColIdx: number, e: React.ClipboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const text = e.clipboardData.getData("text/plain");
            if (!text || !onMemoPaste) return;

            const parsed = parseTsvClipboard(text);
            if (parsed.length === 0) return;

            const edits: { period: string; quarter: string; colIdx: number; value: string }[] = [];

            for (let r = 0; r < parsed.length; r++) {
                const targetRowIdx = startRowIdx + r;
                if (targetRowIdx >= cumRows.length) break;
                const row = cumRows[targetRowIdx];

                for (let c = 0; c < parsed[r].length; c++) {
                    const targetColIdx = startColIdx + c;
                    if (targetColIdx > 1) break;
                    edits.push({
                        period: row.period,
                        quarter: row.quarter,
                        colIdx: targetColIdx,
                        value: parsed[r][c],
                    });
                }
            }

            if (edits.length > 0) {
                onMemoPaste(edits);
            }
        },
        [cumRows, onMemoPaste]
    );

    if (loading) {
        return (
            <div className="data-section">
                <h2 className="section-title">📊 PL（四半期業績推移）</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div className="data-section pl-section">
            <h2 className="section-title">📊 PL（四半期業績推移） — 過去5年</h2>
            {data.length === 0 ? (
                <div className="no-data-message">該当なし</div>
            ) : (
                <div className="pl-scroll-area">
                    <div className="pl-dual-tables">
                        {/* === 累計PLテーブル === */}
                        <div className="pl-table-block">
                            <div className="pl-table-label">累計PL（百万円）</div>
                            <table
                                className="pl-table"
                                style={{ minWidth: cumTableWidth }}
                            >
                                <PLTableHeader
                                    columns={CUM_COLUMNS}
                                    widths={cumResize.widths}
                                    onResizeStart={cumResize.handleMouseDown}
                                />
                                <tbody>
                                    {cumRows.map((row, idx) => {
                                        const isSelected =
                                            selectedPeriod === row.period &&
                                            selectedQuarter === row.quarter;
                                        const memoKey = `${row.period}|${row.quarter}`;
                                        const memoGrid = memoMap?.[memoKey];
                                        const memoA = extractMemoPreview(memoGrid, 0);
                                        const memoB = extractMemoPreview(memoGrid, 1);

                                        return (
                                            <tr
                                                key={`cum-${row.period}-${row.quarter}-${idx}`}
                                                className={`pl-row ${isSelected ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}
                                                onClick={() => onRowClick?.(row.period, row.quarter)}
                                                style={{ cursor: onRowClick ? "pointer" : undefined }}
                                            >
                                                <td style={{ width: cumResize.widths[0], minWidth: cumResize.widths[0] }}>{displayValue(row.period)}</td>
                                                <td style={{ width: cumResize.widths[1], minWidth: cumResize.widths[1] }}>{displayValue(row.quarter)}</td>
                                                <td style={{ width: cumResize.widths[2], minWidth: cumResize.widths[2] }} className="num-col">{formatMillions(row.sales)}</td>
                                                <td style={{ width: cumResize.widths[3], minWidth: cumResize.widths[3] }} className="num-col">{formatMillions(row.grossProfit)}</td>
                                                <td style={{ width: cumResize.widths[4], minWidth: cumResize.widths[4] }} className="num-col">{formatMillions(row.sgAndA)}</td>
                                                <td style={{ width: cumResize.widths[5], minWidth: cumResize.widths[5] }} className="num-col">{formatMillions(row.operatingProfit)}</td>
                                                <td style={{ width: cumResize.widths[6], minWidth: cumResize.widths[6] }} className="num-col">{fmtMargin(row.opMargin)}</td>
                                                <EditableMemoCell
                                                    value={memoA}
                                                    width={cumResize.widths[7]}
                                                    onCommit={(val) =>
                                                        onMemoEdit?.(row.period, row.quarter, 0, val)
                                                    }
                                                    onPaste={(e) => handleMemoPaste(idx, 0, e)}
                                                />
                                                <EditableMemoCell
                                                    value={memoB}
                                                    width={cumResize.widths[8]}
                                                    onCommit={(val) =>
                                                        onMemoEdit?.(row.period, row.quarter, 1, val)
                                                    }
                                                    onPaste={(e) => handleMemoPaste(idx, 1, e)}
                                                />
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* === Q単体PLテーブル === */}
                        <div className="pl-table-block">
                            <div className="pl-table-label">Q単体PL（百万円）</div>
                            <table
                                className="pl-table"
                                style={{ minWidth: qTableWidth }}
                            >
                                <PLTableHeader
                                    columns={Q_COLUMNS}
                                    widths={qResize.widths}
                                    onResizeStart={qResize.handleMouseDown}
                                />
                                <tbody>
                                    {qRows.map((row, idx) => (
                                        <tr
                                            key={`q-${row.period}-${row.quarter}-${idx}`}
                                            className={`pl-row ${selectedPeriod === row.period &&
                                                    selectedQuarter === row.quarter
                                                    ? "pl-row-selected"
                                                    : ""
                                                } ${row.quarter === "FY" ? "pl-row-fy" : ""}`}
                                            onClick={() => onRowClick?.(row.period, row.quarter)}
                                            style={{ cursor: onRowClick ? "pointer" : undefined }}
                                        >
                                            <td style={{ width: qResize.widths[0], minWidth: qResize.widths[0] }}>{displayValue(row.period)}</td>
                                            <td style={{ width: qResize.widths[1], minWidth: qResize.widths[1] }}>{displayValue(row.quarter)}</td>
                                            <td style={{ width: qResize.widths[2], minWidth: qResize.widths[2] }} className="num-col">{formatMillions(row.sales)}</td>
                                            <td style={{ width: qResize.widths[3], minWidth: qResize.widths[3] }} className="num-col">{formatMillions(row.grossProfit)}</td>
                                            <td style={{ width: qResize.widths[4], minWidth: qResize.widths[4] }} className="num-col">{formatMillions(row.sgAndA)}</td>
                                            <td style={{ width: qResize.widths[5], minWidth: qResize.widths[5] }} className="num-col">{formatMillions(row.operatingProfit)}</td>
                                            <td style={{ width: qResize.widths[6], minWidth: qResize.widths[6] }} className="num-col">{fmtMargin(row.opMargin)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
