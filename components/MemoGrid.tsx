"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import type { GridData } from "@/lib/memo-api";
import { parseTsvClipboard } from "@/lib/tsv-parser";

interface MemoGridProps {
    data: GridData;
    onChange: (data: GridData) => void;
    period?: string;
    quarter?: string;
    focusCell: [number, number];
    onFocusCellChange: (cell: [number, number]) => void;
}

const ROWS = 20;
const COLS = 2;

const TEXT_BAR_HEIGHT_OPTIONS = [2, 4, 6, 10];
const TEXT_BAR_STORAGE_KEY = "memo-textbar-rows";

function getCellRef(row: number, col: number): string {
    const colLetter = String.fromCharCode(65 + col); // A, B, ...
    return `${colLetter}${row + 1}`;
}

export default function MemoGrid({
    data,
    onChange,
    period,
    quarter,
    focusCell,
    onFocusCellChange,
}: MemoGridProps) {
    const gridRef = useRef<HTMLDivElement>(null);

    // Text Bar 行数 (localStorage保存)
    const [textBarRows, setTextBarRows] = useState<number>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(TEXT_BAR_STORAGE_KEY);
                if (saved) return parseInt(saved, 10) || 4;
            } catch { /* ignore */ }
        }
        return 4;
    });

    useEffect(() => {
        try {
            localStorage.setItem(TEXT_BAR_STORAGE_KEY, String(textBarRows));
        } catch { /* ignore */ }
    }, [textBarRows]);

    // 現在選択セルの値
    const currentCellValue = data[focusCell[0]]?.[focusCell[1]] ?? "";

    // --- セル値変更 ---
    const handleCellChange = useCallback(
        (row: number, col: number, value: string) => {
            const newData = data.map((r) => [...r]);
            newData[row][col] = value;
            onChange(newData);
        },
        [data, onChange]
    );

    // --- Text Bar から変更 ---
    const handleTextBarChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const [row, col] = focusCell;
            const newData = data.map((r) => [...r]);
            newData[row][col] = e.target.value;
            onChange(newData);
        },
        [data, onChange, focusCell]
    );

    // --- ペーストハンドラー (Grid用): ダブルクォート対応TSVパーサ使用 ---
    const handleGridPaste = useCallback(
        (e: React.ClipboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const text = e.clipboardData.getData("text/plain");
            if (!text) return;

            // Excel由来のTSVを正しくパース（セル内改行・ダブルクォート対応）
            const parsed = parseTsvClipboard(text);
            if (parsed.length === 0) return;

            const [startRow, startCol] = focusCell;
            const newData = data.map((r) => [...r]);

            for (let r = 0; r < parsed.length; r++) {
                const targetRow = startRow + r;
                if (targetRow >= ROWS) break;
                for (let c = 0; c < parsed[r].length; c++) {
                    const targetCol = startCol + c;
                    if (targetCol >= COLS) break;
                    newData[targetRow][targetCol] = parsed[r][c];
                }
            }

            onChange(newData);
        },
        [data, onChange, focusCell]
    );

    // --- グリッドクリア ---
    const handleClear = useCallback(() => {
        const empty = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
        onChange(empty);
    }, [onChange]);

    // --- セルナビゲーション ---
    const navigateToCell = useCallback(
        (row: number, col: number) => {
            if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
                onFocusCellChange([row, col]);
                const next = gridRef.current?.querySelector(
                    `input[data-pos="${row}-${col}"]`
                ) as HTMLInputElement;
                next?.focus();
            }
        },
        [onFocusCellChange]
    );

    return (
        <div className="memo-grid-container">
            {/* 対象 period/quarter 表示 */}
            {period && quarter && (
                <div className="memo-target-bar">
                    <span className="memo-target-label">対象:</span>
                    <span className="memo-target-value">{period} / {quarter}</span>
                </div>
            )}

            {/* Text Bar (Excelの数式バー風) */}
            <div className="text-bar">
                <div className="text-bar-header">
                    <span className="cell-ref">{getCellRef(focusCell[0], focusCell[1])}</span>
                    <select
                        className="text-bar-height-select"
                        value={textBarRows}
                        onChange={(e) => setTextBarRows(parseInt(e.target.value, 10))}
                        title="テキストバー行数"
                    >
                        {TEXT_BAR_HEIGHT_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}行</option>
                        ))}
                    </select>
                </div>
                <textarea
                    className="text-bar-input"
                    rows={textBarRows}
                    value={currentCellValue}
                    onChange={handleTextBarChange}
                    placeholder="選択セルの内容をここで編集..."
                />
            </div>

            {/* ツールバー */}
            <div className="grid-toolbar">
                <button
                    className="btn btn-clear"
                    onClick={handleClear}
                    title="グリッドをクリア"
                >
                    クリア
                </button>
                <span className="grid-hint">
                    Ctrl+V で貼り付け
                </span>
            </div>

            {/* グリッド本体 */}
            <div className="memo-grid" ref={gridRef} onPaste={handleGridPaste}>
                {/* ヘッダー行 */}
                <div className="grid-row grid-header-row">
                    <div className="grid-cell grid-row-number grid-corner">#</div>
                    <div className="grid-cell grid-col-header">A</div>
                    <div className="grid-cell grid-col-header">B</div>
                </div>

                {/* データ行 */}
                {data.map((row, rowIdx) => (
                    <div key={rowIdx} className="grid-row">
                        <div className="grid-cell grid-row-number">{rowIdx + 1}</div>
                        {row.map((cell, colIdx) => (
                            <input
                                key={`${rowIdx}-${colIdx}`}
                                className={`grid-cell grid-input ${focusCell[0] === rowIdx && focusCell[1] === colIdx
                                    ? "grid-cell-focused"
                                    : ""
                                    }`}
                                value={cell}
                                onChange={(e) =>
                                    handleCellChange(rowIdx, colIdx, e.target.value)
                                }
                                onFocus={() => onFocusCellChange([rowIdx, colIdx])}
                                onKeyDown={(e) => {
                                    if (e.key === "Tab") {
                                        e.preventDefault();
                                        const nextCol = e.shiftKey ? colIdx - 1 : colIdx + 1;
                                        if (nextCol >= 0 && nextCol < COLS) {
                                            navigateToCell(rowIdx, nextCol);
                                        } else if (nextCol >= COLS && rowIdx + 1 < ROWS) {
                                            navigateToCell(rowIdx + 1, 0);
                                        }
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (rowIdx + 1 < ROWS) {
                                            navigateToCell(rowIdx + 1, colIdx);
                                        }
                                    } else if (e.key === "Delete") {
                                        handleCellChange(rowIdx, colIdx, "");
                                    }
                                }}
                                data-pos={`${rowIdx}-${colIdx}`}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
