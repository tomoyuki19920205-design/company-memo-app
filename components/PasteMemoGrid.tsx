"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import type { PasteGridData } from "@/lib/paste-memo-api";
import { parseTsvClipboard } from "@/lib/tsv-parser";

interface PasteMemoGridProps {
    data: PasteGridData;
    onChange: (data: PasteGridData) => void;
    onSave: () => void;
    saveStatus: "idle" | "saving" | "saved" | "error";
    errorMsg?: string;
    /** PLの quarter 配列（行ヘッダに使う） */
    quarters: string[];
}

const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 4;

/** 列ヘッダ（A, B, C, D...） */
function colLabel(idx: number): string {
    return String.fromCharCode(65 + idx);
}

export default function PasteMemoGrid({
    data,
    onChange,
    onSave,
    saveStatus,
    errorMsg,
    quarters,
}: PasteMemoGridProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const [focusCell, setFocusCell] = useState<[number, number]>([0, 0]);

    // 行ヘッダ: PL quarter に合わせる（足りない行は空文字）
    const rowHeaders: string[] = [];
    for (let r = 0; r < Math.max(data.length, DEFAULT_ROWS); r++) {
        rowHeaders.push(quarters[r] || `R${r + 1}`);
    }

    const rows = data.length || DEFAULT_ROWS;
    const cols = data[0]?.length || DEFAULT_COLS;

    // --- セル値変更 ---
    const handleCellChange = useCallback(
        (row: number, col: number, value: string) => {
            const newData = data.map((r) => [...r]);
            newData[row][col] = value;
            onChange(newData);
        },
        [data, onChange]
    );

    // --- ペーストハンドラー ---
    const handlePaste = useCallback(
        (e: React.ClipboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const text = e.clipboardData.getData("text/plain");
            if (!text) return;

            const parsed = parseTsvClipboard(text);
            if (parsed.length === 0) return;

            const [startRow, startCol] = focusCell;
            const newData = data.map((r) => [...r]);

            for (let r = 0; r < parsed.length; r++) {
                const targetRow = startRow + r;
                if (targetRow >= rows) break;
                for (let c = 0; c < parsed[r].length; c++) {
                    const targetCol = startCol + c;
                    if (targetCol >= cols) break;
                    newData[targetRow][targetCol] = parsed[r][c];
                }
            }

            onChange(newData);
        },
        [data, onChange, focusCell, rows, cols]
    );

    // --- グリッドクリア ---
    const handleClear = useCallback(() => {
        const empty = Array.from({ length: rows }, () =>
            Array(cols).fill("")
        );
        onChange(empty);
    }, [onChange, rows, cols]);

    // --- セルナビゲーション ---
    const navigateToCell = useCallback(
        (row: number, col: number) => {
            if (row >= 0 && row < rows && col >= 0 && col < cols) {
                setFocusCell([row, col]);
                const next = gridRef.current?.querySelector(
                    `input[data-paste-pos="${row}-${col}"]`
                ) as HTMLInputElement;
                next?.focus();
            }
        },
        [rows, cols]
    );

    // --- 保存状態UI ---
    const statusText = (() => {
        switch (saveStatus) {
            case "saving":
                return "⏳ 保存中...";
            case "saved":
                return "✅ 保存済み";
            case "error":
                return `❌ 保存失敗${errorMsg ? `: ${errorMsg}` : ""}`;
            default:
                return "";
        }
    })();

    return (
        <div className="paste-memo-container data-section">
            {/* ヘッダー */}
            <div className="paste-memo-header">
                <h2 className="section-title">📋 MEMO A</h2>
                <div className="paste-memo-actions">
                    <button
                        className="btn btn-clear"
                        onClick={handleClear}
                        title="グリッドをクリア"
                    >
                        クリア
                    </button>
                    <button
                        className="btn btn-save"
                        onClick={onSave}
                        disabled={saveStatus === "saving"}
                    >
                        {saveStatus === "saving" ? "保存中..." : "保存"}
                    </button>
                </div>
            </div>

            {/* ステータスバー */}
            <div className="paste-memo-status">
                <span className="grid-hint">
                    Excelからコピー → セルクリック → Ctrl+V
                </span>
                {statusText && (
                    <span
                        className={`save-status ${saveStatus === "error"
                                ? "unsaved"
                                : saveStatus === "saved"
                                    ? "saved"
                                    : ""
                            }`}
                    >
                        {statusText}
                    </span>
                )}
            </div>

            {/* グリッド本体 */}
            <div className="paste-memo-grid" ref={gridRef} onPaste={handlePaste}>
                {/* ヘッダー行 */}
                <div className="paste-grid-row paste-grid-header-row">
                    <div className="paste-grid-cell paste-grid-corner">Q</div>
                    {Array.from({ length: cols }, (_, c) => (
                        <div key={c} className="paste-grid-cell paste-grid-col-header">
                            {colLabel(c)}
                        </div>
                    ))}
                </div>

                {/* データ行 */}
                {data.map((row, rowIdx) => (
                    <div
                        key={rowIdx}
                        className={`paste-grid-row ${rowIdx < 4 ? "paste-grid-quarter-row" : ""
                            }`}
                    >
                        <div className="paste-grid-cell paste-grid-row-header">
                            {rowHeaders[rowIdx]}
                        </div>
                        {row.map((cell, colIdx) => (
                            <input
                                key={`${rowIdx}-${colIdx}`}
                                className={`paste-grid-cell paste-grid-input ${focusCell[0] === rowIdx &&
                                        focusCell[1] === colIdx
                                        ? "paste-grid-cell-focused"
                                        : ""
                                    }`}
                                value={cell}
                                onChange={(e) =>
                                    handleCellChange(
                                        rowIdx,
                                        colIdx,
                                        e.target.value
                                    )
                                }
                                onFocus={() => setFocusCell([rowIdx, colIdx])}
                                onKeyDown={(e) => {
                                    if (e.key === "Tab") {
                                        e.preventDefault();
                                        const nextCol = e.shiftKey
                                            ? colIdx - 1
                                            : colIdx + 1;
                                        if (nextCol >= 0 && nextCol < cols) {
                                            navigateToCell(rowIdx, nextCol);
                                        } else if (
                                            nextCol >= cols &&
                                            rowIdx + 1 < rows
                                        ) {
                                            navigateToCell(rowIdx + 1, 0);
                                        }
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (rowIdx + 1 < rows) {
                                            navigateToCell(rowIdx + 1, colIdx);
                                        }
                                    } else if (e.key === "Delete") {
                                        handleCellChange(rowIdx, colIdx, "");
                                    }
                                }}
                                data-paste-pos={`${rowIdx}-${colIdx}`}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
