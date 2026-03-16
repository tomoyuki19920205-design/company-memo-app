"use client";

import React, { useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { FinancialRecord } from "@/types/financial";
import type { SegmentRecord } from "@/types/segment";
import { formatMillions, formatNumber, displayValue } from "@/lib/format";
import { useColumnResize, type ColumnDef } from "@/components/ResizableTable";
import type { GridData } from "@/lib/memo-api";
import { parseTsvClipboard } from "@/lib/tsv-parser";
import type { SegmentOverrideSaveRequest } from "@/types/segment-override";
import { normalizePeriod, normalizeQuarter } from "@/lib/normalize";
import { extractFiscalYear } from "@/lib/viewer-api";
import type { KpiDefMap, KpiValueMap } from "@/lib/kpi-api";
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

/** アクティブセル座標 */
interface CellCoord {
    tableId: "cum" | "q";
    rowIdx: number;
    colKey: string; // "memo_a" | "memo_b" | "kpi_1" | "kpi_2" | "kpi_3"
}

/** セグメントセルのアクティブ座標 */
interface SegCellCoord {
    rowIdx: number;   // cumRows 上の行インデックス
    colIdx: number;   // セグメント列インデックス (scIdx * 2 + 0=sales/1=profit)
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
    segments?: SegmentRecord[];
    kpiDefs?: KpiDefMap;
    kpiValues?: KpiValueMap;
    onKpiHeaderEdit?: (kpiSlot: number, newName: string) => void;
    onKpiValueEdit?: (period: string, quarter: string, kpiSlot: number, value: string) => void;
    /** Segment override: save a manual value for a segment cell */
    onSegmentOverrideSave?: (
        fiscalYear: number,
        quarter: string,
        segmentName: string,
        metric: string,
        value: number,
    ) => Promise<void>;
    /** Segment override: delete a manual value */
    onSegmentOverrideDelete?: (
        fiscalYear: number,
        quarter: string,
        segmentName: string,
        metric: string,
    ) => Promise<void>;
    /** Segment override: bulk save multiple cells */
    onBulkSaveOverrides?: (
        items: SegmentOverrideSaveRequest[],
    ) => Promise<{ saved: number; failed: number }>;
}

const KPI_SLOTS = [1, 2, 3] as const;

// ============================================================
// 基本列定義
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

const Q_BASE_COLUMNS: ColumnDef[] = [
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

function extractMemoValue(gridData: GridData | undefined, colIdx: number): string {
    if (!gridData || !gridData[0]) return "";
    const val = gridData[0]?.[colIdx];
    return val ?? "";
}

/** カンマ区切り数値を許容する数値パーサ。不正値は null。 */
function parseNumericValue(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    // カンマ除去
    const cleaned = trimmed.replace(/,/g, "");
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
}

// ============================================================
// セグメント結合情報
// ============================================================
interface SegmentColumnDef {
    segmentName: string;
    salesKey: string;
    profitKey: string;
}

/** 前四半期の定義 (Q単体計算用) */
const SEG_PREV_QUARTER: Record<string, string | null> = {
    "1Q": null,
    "2Q": "1Q",
    "3Q": "2Q",
    "FY": "3Q",
};

function buildSegmentInfo(segments: SegmentRecord[]) {
    // ダミーセグメント（「売上」「利益」等で sales=0, profit=0 のみ）を除外
    const DUMMY_NAMES = new Set(["売上", "利益", "#VALUE!", "0", "月次売上", "累計", "ＧＰ"]);
    const filtered = segments.filter((seg) => {
        if (!seg.segment_name) return false;
        if (DUMMY_NAMES.has(seg.segment_name)) return false;
        if (seg.segment_name.startsWith("UNKNOWN_")) return false;
        if ((seg.segment_sales === null || seg.segment_sales === 0) &&
            (seg.segment_profit === null || seg.segment_profit === 0)) return false;
        return true;
    });

    const nameSet = new Set<string>();
    for (const seg of filtered) {
        nameSet.add(seg.segment_name);
    }
    const segmentNames = Array.from(nameSet);

    const segmentColumns: SegmentColumnDef[] = segmentNames.map((name) => ({
        segmentName: name,
        salesKey: `seg:${name}:sales`,
        profitKey: `seg:${name}:profit`,
    }));

    // 累計用 segmentMap: key = "period|quarter"
    const segmentMap = new Map<string, Record<string, number | null>>();
    for (const seg of filtered) {
        const key = `${seg.period}|${seg.quarter}`;
        if (!segmentMap.has(key)) segmentMap.set(key, {});
        const row = segmentMap.get(key)!;
        const col = segmentColumns.find((c) => c.segmentName === seg.segment_name);
        if (col) {
            row[col.salesKey] = seg.segment_sales;
            row[col.profitKey] = seg.segment_profit;
        }
    }

    // Q単体用 segmentQMap: key = "period|quarter"
    // 1Q: 累計そのまま, 2Q: 2Q累計-1Q累計, 3Q: 3Q累計-2Q累計, FY: FY累計-3Q累計
    const segmentQMap = new Map<string, Record<string, number | null>>();
    // periodごとにグルーピングして差分計算
    const periodSet = new Set<string>();
    for (const seg of filtered) {
        periodSet.add(seg.period);
    }
    for (const period of periodSet) {
        for (const q of ["1Q", "2Q", "3Q", "FY"]) {
            const curKey = `${period}|${q}`;
            const curData = segmentMap.get(curKey);
            if (!curData) continue;

            const prevQ = SEG_PREV_QUARTER[q];
            const qRow: Record<string, number | null> = {};

            for (const col of segmentColumns) {
                const curSales = curData[col.salesKey] ?? null;
                const curProfit = curData[col.profitKey] ?? null;

                if (prevQ === null) {
                    // 1Q: 累計 = 単体
                    qRow[col.salesKey] = curSales;
                    qRow[col.profitKey] = curProfit;
                } else {
                    const prevKey = `${period}|${prevQ}`;
                    const prevData = segmentMap.get(prevKey);
                    const prevSales = prevData?.[col.salesKey] ?? null;
                    const prevProfit = prevData?.[col.profitKey] ?? null;

                    // 前四半期datが無い場合は null (-表示)
                    qRow[col.salesKey] = (curSales !== null && prevSales !== null) ? curSales - prevSales : null;
                    qRow[col.profitKey] = (curProfit !== null && prevProfit !== null) ? curProfit - prevProfit : null;
                }
            }
            segmentQMap.set(curKey, qRow);
        }
    }

    // DEBUG: merge確認ログ (development のみ)
    if (process.env.NODE_ENV === "development" && segments.length > 0) {
        console.log("[SEG-DEBUG] input segments:", segments.length, "→ filtered:", filtered.length);
        console.log("[SEG-DEBUG] segmentNames:", segmentNames);
        console.log("[SEG-DEBUG] segmentMap keys:", [...segmentMap.keys()].slice(0, 5));
        console.log("[SEG-DEBUG] segmentQMap keys:", [...segmentQMap.keys()].slice(0, 5));
        const firstKey = [...segmentQMap.keys()][0];
        if (firstKey) console.log("[SEG-DEBUG] segmentQMap sample:", firstKey, segmentQMap.get(firstKey));
    }

    // Per-cell source tracking: build from SegmentRecord._salesSource / _profitSource
    // Key: "period|quarter|seg:name:sales" or "period|quarter|seg:name:profit"
    const sourceMap = new Map<string, string>();
    for (const seg of segments) {
        const key = `${seg.period}|${seg.quarter}`;
        const col = segmentColumns.find((c) => c.segmentName === seg.segment_name);
        if (col) {
            if (seg._salesSource) sourceMap.set(`${key}|${col.salesKey}`, seg._salesSource);
            if (seg._profitSource) sourceMap.set(`${key}|${col.profitKey}`, seg._profitSource);
        }
    }

    return { segmentColumns, segmentMap, segmentQMap, sourceMap };
}

// ============================================================
// PLリサイズ高さ管理
// ============================================================
const PL_HEIGHT_KEY = "pl-scroll-height";
const DEFAULT_HEIGHT = 600;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1200;

function loadSavedHeight(): number {
    if (typeof window === "undefined") return DEFAULT_HEIGHT;
    const saved = localStorage.getItem(PL_HEIGHT_KEY);
    if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= MIN_HEIGHT && n <= MAX_HEIGHT) return n;
    }
    return DEFAULT_HEIGHT;
}

// ============================================================
// PLテーブルヘッダー
// ============================================================
function PLTableHeader({
    columns,
    widths,
    onResizeStart,
    segHeaders,
    segWidths,
    onSegResizeStart,
    kpiSlots,
    kpiDefs,
    kpiWidths,
    onKpiResizeStart,
    editingKpiHeader,
    editingKpiHeaderValue,
    kpiHeaderInputRef,
    onStartKpiHeaderEdit,
    onEditingKpiHeaderValueChange,
    onCommitKpiHeaderEdit,
    onCancelKpiHeaderEdit,
}: {
    columns: ColumnDef[];
    widths: number[];
    onResizeStart: (colIndex: number, e: React.MouseEvent) => void;
    segHeaders?: { label: string; className?: string }[];
    segWidths?: number[];
    onSegResizeStart?: (colIndex: number, e: React.MouseEvent) => void;
    kpiSlots?: readonly number[];
    kpiDefs?: KpiDefMap;
    kpiWidths?: number[];
    onKpiResizeStart?: (colIndex: number, e: React.MouseEvent) => void;
    editingKpiHeader?: number | null;
    editingKpiHeaderValue?: string;
    kpiHeaderInputRef?: React.RefObject<HTMLInputElement | null>;
    onStartKpiHeaderEdit?: (slot: number) => void;
    onEditingKpiHeaderValueChange?: (v: string) => void;
    onCommitKpiHeaderEdit?: () => void;
    onCancelKpiHeaderEdit?: () => void;
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
                {segHeaders?.map((eh, idx) => {
                    const w = segWidths?.[idx] ?? 90;
                    return (
                        <th
                            key={`seg-${idx}`}
                            className={`seg-header-cell ${eh.className || "num-col"}`}
                            style={{ width: w, minWidth: 24 }}
                        >
                            <div className="th-content">
                                <span>{eh.label}</span>
                                {onSegResizeStart && (
                                    <div
                                        className="resize-handle"
                                        onMouseDown={(e) => onSegResizeStart(idx, e)}
                                    />
                                )}
                            </div>
                        </th>
                    );
                })}
                {kpiSlots?.map((slot, idx) => {
                    const w = kpiWidths?.[idx] ?? 90;
                    const isEditing = editingKpiHeader === slot;
                    return (
                        <th
                            key={`kpi-${slot}`}
                            className="kpi-header-cell"
                            style={{ width: w, minWidth: 24 }}
                            onDoubleClick={() => onStartKpiHeaderEdit?.(slot)}
                        >
                            <div className="th-content">
                                {isEditing ? (
                                    <input
                                        ref={kpiHeaderInputRef as React.RefObject<HTMLInputElement>}
                                        className="kpi-header-input"
                                        value={editingKpiHeaderValue ?? ""}
                                        onChange={(e) => onEditingKpiHeaderValueChange?.(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); onCommitKpiHeaderEdit?.(); }
                                            if (e.key === "Escape") { e.preventDefault(); onCancelKpiHeaderEdit?.(); }
                                        }}
                                        onBlur={() => onCommitKpiHeaderEdit?.()}
                                    />
                                ) : (
                                    <span className="kpi-header-label" title="ダブルクリックで編集">{kpiDefs?.[slot] ?? `KPI ${slot}`}</span>
                                )}
                                {onKpiResizeStart && (
                                    <div
                                        className="resize-handle"
                                        onMouseDown={(e) => onKpiResizeStart(idx, e)}
                                    />
                                )}
                            </div>
                        </th>
                    );
                })}
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
    segments,
    kpiDefs,
    kpiValues,
    onKpiHeaderEdit,
    onKpiValueEdit,
    onSegmentOverrideSave,
    onSegmentOverrideDelete,
    onBulkSaveOverrides,
}: FinancialsTableProps) {
    const filtered = useMemo(() => filterLast5Years(data), [data]);
    const sorted = useMemo(() => sortForDisplay(filtered), [filtered]);
    const cumRows = useMemo(() => buildCumulativeRows(sorted), [sorted]);
    const qRows = useMemo(() => buildQStandaloneRows(sorted), [sorted]);

    // セグメント列
    const { segmentColumns, segmentMap, segmentQMap, sourceMap } = useMemo(
        () => buildSegmentInfo(segments || []),
        [segments]
    );
    // セグメント列ヘッダー（累計PL・Q単体PL共通）
    const segmentHeaders = useMemo(() => {
        const headers: { label: string; className?: string }[] = [];
        for (const sc of segmentColumns) {
            // "管工機材売上(円)" → "管工機材" のように末尾の単位表記を除去
            const cleanName = sc.segmentName
                .replace(/[（(]円[)）]/g, "")
                .replace(/売上$/, "")
                .replace(/利益$/, "")
                .trim();
            headers.push({ label: `${cleanName} 売上（百万円）`, className: "num-col seg-sales-col" });
            headers.push({ label: `${cleanName} 利益（百万円）`, className: "num-col seg-profit-col" });
        }
        return headers;
    }, [segmentColumns]);

    // 列幅管理
    const cumResize = useColumnResize({ storageKey: "pl-cum-v3", columns: CUM_COLUMNS });
    const qResize = useColumnResize({ storageKey: "pl-q-v3", columns: Q_BASE_COLUMNS });

    // セグメント列幅管理 (動的列数に対応)
    const segColCount = segmentHeaders.length; // 各セグメント×(売上+利益)
    const [segWidths, setSegWidths] = useState<number[]>(() => {
        if (typeof window !== "undefined" && segColCount > 0) {
            try {
                const saved = localStorage.getItem("seg-col-widths");
                if (saved) {
                    const parsed = JSON.parse(saved) as number[];
                    if (parsed.length === segColCount) return parsed;
                }
            } catch { /* ignore */ }
        }
        return Array(segColCount).fill(90);
    });

    // セグメント列数が変わったら幅をリセット
    useEffect(() => {
        if (segColCount > 0 && segWidths.length !== segColCount) {
            setSegWidths(Array(segColCount).fill(90));
        }
    }, [segColCount, segWidths.length]);

    // セグメント列幅永続化
    useEffect(() => {
        if (segColCount > 0) {
            try {
                localStorage.setItem("seg-col-widths", JSON.stringify(segWidths));
            } catch { /* ignore */ }
        }
    }, [segWidths, segColCount]);

    const segDragState = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);
    const handleSegResizeStart = useCallback((colIndex: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        segDragState.current = { colIndex, startX: e.clientX, startWidth: segWidths[colIndex] ?? 90 };

        const onMove = (ev: MouseEvent) => {
            if (!segDragState.current) return;
            const diff = ev.clientX - segDragState.current.startX;
            const newW = Math.max(24, segDragState.current.startWidth + diff);
            setSegWidths((prev) => {
                const next = [...prev];
                next[segDragState.current!.colIndex] = newW;
                return next;
            });
        };
        const onUp = () => {
            segDragState.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, [segWidths]);

    // KPI列幅管理 (3列固定)
    const [kpiWidths, setKpiWidths] = useState<number[]>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem("kpi-col-widths");
                if (saved) {
                    const parsed = JSON.parse(saved) as number[];
                    if (parsed.length === 3) return parsed;
                }
            } catch { /* ignore */ }
        }
        return [90, 90, 90];
    });
    useEffect(() => {
        try { localStorage.setItem("kpi-col-widths", JSON.stringify(kpiWidths)); } catch { /* ignore */ }
    }, [kpiWidths]);

    const kpiDragState = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);
    const handleKpiResizeStart = useCallback((colIndex: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        kpiDragState.current = { colIndex, startX: e.clientX, startWidth: kpiWidths[colIndex] ?? 90 };
        const onMove = (ev: MouseEvent) => {
            if (!kpiDragState.current) return;
            const diff = ev.clientX - kpiDragState.current.startX;
            const newW = Math.max(24, kpiDragState.current.startWidth + diff);
            setKpiWidths((prev) => { const next = [...prev]; next[kpiDragState.current!.colIndex] = newW; return next; });
        };
        const onUp = () => {
            kpiDragState.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, [kpiWidths]);

    // KPIヘッダー編集state
    const [editingKpiHeader, setEditingKpiHeader] = useState<number | null>(null);
    const [editingKpiHeaderValue, setEditingKpiHeaderValue] = useState("");
    const kpiHeaderInputRef = useRef<HTMLInputElement>(null);

    const startKpiHeaderEdit = useCallback((slot: number) => {
        setEditingKpiHeader(slot);
        setEditingKpiHeaderValue(kpiDefs?.[slot] || `KPI ${slot}`);
        setTimeout(() => kpiHeaderInputRef.current?.focus(), 0);
    }, [kpiDefs]);

    const commitKpiHeaderEdit = useCallback(() => {
        if (editingKpiHeader === null) return;
        const name = editingKpiHeaderValue.trim() || `KPI ${editingKpiHeader}`;
        onKpiHeaderEdit?.(editingKpiHeader, name);
        setEditingKpiHeader(null);
    }, [editingKpiHeader, editingKpiHeaderValue, onKpiHeaderEdit]);

    const cancelKpiHeaderEdit = useCallback(() => {
        setEditingKpiHeader(null);
    }, []);

    // KPIセルは activeCell / editingCell に統合済み。別管理stateは不要。

    const kpiExtraWidth = kpiWidths.reduce((s, w) => s + w, 0);
    const segExtraWidth = segWidths.reduce((s, w) => s + w, 0);
    const cumTableWidth = cumResize.widths.reduce((s, w) => s + w, 0) + segExtraWidth + kpiExtraWidth;
    const qBaseWidth = qResize.widths.reduce((s, w) => s + w, 0);
    const qTableWidth = qBaseWidth + segExtraWidth + kpiExtraWidth;

    // ============================================================
    // Excel-like セル操作
    // ============================================================
    const [activeCell, setActiveCell] = useState<CellCoord | null>(null);
    const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
    const [editValue, setEditValue] = useState("");
    const editInputRef = useRef<HTMLInputElement>(null);
    const formulaBarRef = useRef<HTMLTextAreaElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    // セグメントセルのアクティブ管理
    const [activeSegCell, setActiveSegCell] = useState<SegCellCoord | null>(null);
    // トースト
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMessage(null), 4000);
    }, []);

    // PLリサイズ高さ
    const [plHeight, setPlHeight] = useState(DEFAULT_HEIGHT);
    const resizing = useRef(false);
    const resizeStartY = useRef(0);
    const resizeStartHeight = useRef(0);

    useEffect(() => {
        setPlHeight(loadSavedHeight());
    }, []);

    // フォーミュラバー用: 現在のセル値を取得
    const getActiveCellValue = useCallback((): string => {
        if (!activeCell) return "";
        const rows = activeCell.tableId === "cum" ? cumRows : qRows;
        const row = rows[activeCell.rowIdx];
        if (!row) return "";
        const key = activeCell.colKey;
        if (key === "memo_a" || key === "memo_b") {
            if (!memoMap) return "";
            const memoKey = `${row.period}|${row.quarter}`;
            const colIdx = key === "memo_a" ? 0 : 1;
            return extractMemoValue(memoMap[memoKey], colIdx);
        }
        if (key.startsWith("kpi_")) {
            const slot = parseInt(key.split("_")[1]);
            const kpiKey = `${row.period}|${row.quarter}`;
            return kpiValues?.[kpiKey]?.[slot] ?? "";
        }
        return "";
    }, [activeCell, memoMap, cumRows, qRows, kpiValues]);

    // フォーミュラバーの表示ラベル
    const activeCellLabel = useMemo((): string => {
        if (!activeCell) return "";
        const rows = activeCell.tableId === "cum" ? cumRows : qRows;
        const row = rows[activeCell.rowIdx];
        if (!row) return "";
        const key = activeCell.colKey;
        let colLabel = "";
        if (key === "memo_a") colLabel = "Memo A";
        else if (key === "memo_b") colLabel = "Memo B";
        else if (key.startsWith("kpi_")) {
            const slot = parseInt(key.split("_")[1]);
            colLabel = kpiDefs?.[slot] ?? `KPI ${slot}`;
        }
        const tableLabel = activeCell.tableId === "cum" ? "累PL" : "Q単";
        return `${tableLabel} / ${row.period} / ${row.quarter} / ${colLabel}`;
    }, [activeCell, cumRows, qRows, kpiDefs]);

    // セル選択
    const selectCell = useCallback((coord: CellCoord) => {
        setActiveCell(coord);
        setEditingCell(null);
    }, []);

    // 編集開始
    const startEditing = useCallback((coord: CellCoord, initialValue?: string) => {
        setEditingCell(coord);
        setActiveCell(coord);
        const val = initialValue !== undefined ? initialValue : "";
        setEditValue(val);
        setTimeout(() => editInputRef.current?.focus(), 0);
    }, []);

    // grid wrapperにfocusを戻すヘルパー
    const focusGrid = useCallback(() => {
        requestAnimationFrame(() => {
            gridRef.current?.focus();
        });
    }, []);

    // commitEdit reentrancy guard（blur + keydownでの二重発火防止）
    const isCommittingRef = useRef(false);

    // 編集確定
    const commitEdit = useCallback(() => {
        if (isCommittingRef.current) return;
        if (!editingCell) return;
        isCommittingRef.current = true;
        const rows = editingCell.tableId === "cum" ? cumRows : qRows;
        const row = rows[editingCell.rowIdx];
        if (!row) { isCommittingRef.current = false; return; }

        const key = editingCell.colKey;
        if ((key === "memo_a" || key === "memo_b") && onMemoEdit) {
            const colIdx = key === "memo_a" ? 0 : 1;
            onMemoEdit(row.period, row.quarter, colIdx, editValue);
        } else if (key.startsWith("kpi_") && onKpiValueEdit) {
            const slot = parseInt(key.split("_")[1]);
            onKpiValueEdit(row.period, row.quarter, slot, editValue);
        }

        setEditingCell(null);
        requestAnimationFrame(() => {
            gridRef.current?.focus();
            isCommittingRef.current = false;
        });
    }, [editingCell, editValue, cumRows, qRows, onMemoEdit, onKpiValueEdit]);

    // 編集キャンセル
    const cancelEdit = useCallback(() => {
        setEditingCell(null);
        focusGrid();
    }, [focusGrid]);

    // 隣セルへ移動 (memo + kpi 統合)
    const moveActiveCell = useCallback((dRow: number, dCol: number) => {
        if (!activeCell) return;
        const rows = activeCell.tableId === "cum" ? cumRows : qRows;
        const editableCols = ["memo_a", "memo_b", "kpi_1", "kpi_2", "kpi_3"];
        const curColIdx = editableCols.indexOf(activeCell.colKey);
        if (curColIdx < 0) return;

        let newRow = activeCell.rowIdx + dRow;
        let newCol = curColIdx + dCol;

        // 行折り返し
        if (newCol < 0) { newRow--; newCol = editableCols.length - 1; }
        if (newCol >= editableCols.length) { newRow++; newCol = 0; }

        if (newRow < 0 || newRow >= rows.length) return;

        selectCell({
            tableId: activeCell.tableId,
            rowIdx: newRow,
            colKey: editableCols[newCol],
        });
    }, [activeCell, cumRows, qRows, selectCell]);

    // フォーミュラバーからの編集
    const handleFormulaBarChange = useCallback((value: string) => {
        if (!activeCell) return;
        const rows = activeCell.tableId === "cum" ? cumRows : qRows;
        const row = rows[activeCell.rowIdx];
        if (!row) return;
        const key = activeCell.colKey;
        if ((key === "memo_a" || key === "memo_b") && onMemoEdit) {
            const colIdx = key === "memo_a" ? 0 : 1;
            onMemoEdit(row.period, row.quarter, colIdx, value);
        } else if (key.startsWith("kpi_") && onKpiValueEdit) {
            const slot = parseInt(key.split("_")[1]);
            onKpiValueEdit(row.period, row.quarter, slot, value);
        }
    }, [activeCell, cumRows, qRows, onMemoEdit, onKpiValueEdit]);

    // キーボードイベント（テーブル全体）
    const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
        // IME入力中は無視（日本語入力対応）
        if (e.nativeEvent.isComposing) return;

        if (!activeCell) return;

        // 編集中の処理は input 側の onKeyDown で処理するため、ここではスキップ
        if (editingCell) return;

        // 非編集中: 矢印キーで移動
        if (e.key === "ArrowUp") { e.preventDefault(); moveActiveCell(-1, 0); }
        else if (e.key === "ArrowDown") { e.preventDefault(); moveActiveCell(1, 0); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); moveActiveCell(0, -1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); moveActiveCell(0, 1); }
        else if (e.key === "Tab") { e.preventDefault(); moveActiveCell(0, e.shiftKey ? -1 : 1); }
        else if (e.key === "Enter") {
            e.preventDefault();
            const val = getActiveCellValue();
            startEditing(activeCell, val);
        }
        else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            // セル内容クリア
            const rows = activeCell.tableId === "cum" ? cumRows : qRows;
            const row = rows[activeCell.rowIdx];
            if (row) {
                const key = activeCell.colKey;
                if ((key === "memo_a" || key === "memo_b") && onMemoEdit) {
                    const colIdx = key === "memo_a" ? 0 : 1;
                    onMemoEdit(row.period, row.quarter, colIdx, "");
                } else if (key.startsWith("kpi_") && onKpiValueEdit) {
                    const slot = parseInt(key.split("_")[1]);
                    onKpiValueEdit(row.period, row.quarter, slot, "");
                }
            }
        }
        else if (e.key === "F2") {
            e.preventDefault();
            const val = getActiveCellValue();
            startEditing(activeCell, val);
        }
        // 印字可能文字 → 新しい値で編集開始（既存値を上書き）
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            startEditing(activeCell, e.key);
        }
    }, [activeCell, editingCell, moveActiveCell, startEditing, getActiveCellValue, cumRows, qRows, onMemoEdit, onKpiValueEdit]);

    // PL側メモペースト
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
            if (edits.length > 0) onMemoPaste(edits);
        },
        [cumRows, onMemoPaste]
    );

    // セグメント値取得
    const getSegValue = useCallback(
        (period: string, quarter: string, key: string): number | null => {
            const normP = normalizePeriod(period);
            const normQ = normalizeQuarter(quarter);
            const mapKey = `${normP}|${normQ}`;
            const row = segmentMap.get(mapKey);
            if (!row) return null;
            return row[key] ?? null;
        },
        [segmentMap]
    );

    // Q単体セグメント値取得
    const getSegQValue = useCallback(
        (period: string, quarter: string, key: string): number | null => {
            const normP = normalizePeriod(period);
            const normQ = normalizeQuarter(quarter);
            const mapKey = `${normP}|${normQ}`;
            const row = segmentQMap.get(mapKey);
            if (!row) return null;
            return row[key] ?? null;
        },
        [segmentQMap]
    );

    // PLリサイズハンドラ
    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizing.current = true;
        resizeStartY.current = e.clientY;
        resizeStartHeight.current = plHeight;

        const onMouseMove = (ev: MouseEvent) => {
            if (!resizing.current) return;
            const dy = ev.clientY - resizeStartY.current;
            const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStartHeight.current + dy));
            setPlHeight(newH);
        };

        const onMouseUp = () => {
            resizing.current = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            // 保存
            setPlHeight((h) => {
                localStorage.setItem(PL_HEIGHT_KEY, String(h));
                return h;
            });
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [plHeight]);

    // --- Ctrl+V on active cell ---
    const handleTablePaste = useCallback((e: React.ClipboardEvent) => {
        // セグメントセルがアクティブの場合 → セグメントペースト処理
        if (activeSegCell && onBulkSaveOverrides) {
            e.preventDefault();
            e.stopPropagation();
            const rawText = e.clipboardData.getData("text/plain");
            if (!rawText) return;

            console.log("[SEG-PASTE] clipboard raw:", JSON.stringify(rawText));
            const parsed = parseTsvClipboard(rawText);
            console.log("[SEG-PASTE] parsed 2D:", parsed);

            if (parsed.length === 0) return;

            const startRow = activeSegCell.rowIdx;
            const startCol = activeSegCell.colIdx;
            const totalSegCols = segmentColumns.length * 2; // 各セグメント × (sales + profit)

            const items: SegmentOverrideSaveRequest[] = [];
            let skipped = 0;
            let invalid = 0;

            for (let r = 0; r < parsed.length; r++) {
                const targetRowIdx = startRow + r;
                if (targetRowIdx >= cumRows.length) { skipped += parsed[r].length; continue; }
                const row = cumRows[targetRowIdx];
                const isEditableQ = row.quarter === "1Q" || row.quarter === "3Q";
                if (!isEditableQ) { skipped += parsed[r].length; continue; }

                const fy = extractFiscalYear(row.period);

                for (let c = 0; c < parsed[r].length; c++) {
                    const targetColIdx = startCol + c;
                    if (targetColIdx >= totalSegCols) { skipped++; continue; }

                    // セグメント列インデックスから segmentName と metric を逆算
                    const scIdx = Math.floor(targetColIdx / 2);
                    const metricIdx = targetColIdx % 2; // 0=sales, 1=profit
                    if (scIdx >= segmentColumns.length) { skipped++; continue; }

                    const sc = segmentColumns[scIdx];
                    const segmentName = sc.segmentName;
                    const metric = metricIdx === 0 ? "sales" : "operating_profit";

                    // base 値チェック: base がある (非null かつ source !== "manual") セルはスキップ
                    const mapKey = `${normalizePeriod(row.period)}|${normalizeQuarter(row.quarter)}`;
                    const segKey = metricIdx === 0 ? sc.salesKey : sc.profitKey;
                    const currentVal = segmentMap.get(mapKey)?.[segKey] ?? null;
                    const cellSource = sourceMap.get(`${mapKey}|${segKey}`);
                    const isManualCell = cellSource === "manual";
                    const hasBaseValue = currentVal !== null && !isManualCell;
                    if (hasBaseValue) { skipped++; continue; }

                    // 数値パース（セル単位）
                    const cellText = parsed[r][c];
                    const numVal = parseNumericValue(cellText);
                    console.log(`[SEG-PASTE] cell[${r}][${c}] = "${cellText}" → ${numVal}`);
                    if (numVal === null) { invalid++; continue; }

                    items.push({
                        ticker: row.period.split("-").length > 0 ? "" : "", // ticker は親から渡される
                        fiscal_year: fy,
                        quarter: row.quarter,
                        segment_name: segmentName,
                        metric,
                        value: numVal,
                    });
                }
            }

            console.log("[SEG-PASTE] items to save:", items);
            console.log(`[SEG-PASTE] skipped: ${skipped}, invalid: ${invalid}`);

            if (items.length === 0) {
                showToast(`0件保存 / ${skipped}件スキップ / ${invalid}件不正値`);
                return;
            }

            // 非同期で bulk save
            onBulkSaveOverrides(items).then(({ saved, failed }) => {
                const msg = `${saved}件保存 / ${skipped}件スキップ${invalid > 0 ? ` / ${invalid}件不正値` : ""}${failed > 0 ? ` / ${failed}件失敗` : ""}`;
                showToast(msg);
            }).catch((err) => {
                console.error("[SEG-PASTE] bulk save error:", err);
                showToast(`保存エラー: ${err instanceof Error ? err.message : String(err)}`);
            });

            return;
        }

        // メモセルがアクティブの場合 → メモペースト処理
        if (!activeCell || activeCell.tableId !== "cum") return;
        const colIdx = activeCell.colKey === "memo_a" ? 0 : 1;
        handleMemoPaste(activeCell.rowIdx, colIdx, e);
    }, [activeCell, activeSegCell, handleMemoPaste, onBulkSaveOverrides, cumRows, segmentColumns, segmentMap, sourceMap, showToast]);

    if (loading) {
        return (
            <div className="data-section">
                <h2 className="section-title">📊 PL（四半期業績推移）</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div
            ref={gridRef}
            className="data-section pl-section"
            tabIndex={0}
            onKeyDown={handleTableKeyDown}
            onPaste={handleTablePaste}
        >
            <h2 className="section-title">📊 PL（四半期業績推移） — 過去5年</h2>

            {/* ============ フォーミュラバー ============ */}
            <div className="formula-bar">
                <div className="formula-bar-label">
                    {activeCellLabel ? (
                        <span className="cell-ref">{activeCellLabel}</span>
                    ) : (
                        <span className="cell-ref cell-ref-empty">セル未選択</span>
                    )}
                </div>
                <textarea
                    ref={formulaBarRef}
                    className="formula-bar-input"
                    placeholder="セルを選択してください"
                    value={activeCell ? getActiveCellValue() : ""}
                    onChange={(e) => handleFormulaBarChange(e.target.value)}
                    onKeyDown={(e) => {
                        // フォーミュラバーでEscapeを押したらgridに戻る
                        if (e.key === "Escape") {
                            e.preventDefault();
                            focusGrid();
                        }
                    }}
                    onBlur={() => {
                        // フォーミュラバーからフォーカスが外れたらgridにfocusを戻す
                        // ただしgrid内の他要素へ移動する場合はgrid側で処理される
                    }}
                    rows={2}
                    disabled={!activeCell}
                />
            </div>

            {data.length === 0 ? (
                <div className="no-data-message">該当なし</div>
            ) : (
                <>
                    <div className="pl-scroll-area" style={{ maxHeight: plHeight }}>
                        <div className="pl-dual-tables">
                            {/* === 累計PL === */}
                            <div className="pl-table-block">
                                <div className="pl-table-label">
                                    累計PL（百万円）
                                    {segmentColumns.length > 0 && (
                                        <span className="seg-label-badge">+ セグメント {segmentColumns.length}件</span>
                                    )}
                                </div>
                                <table className="pl-table" style={{ minWidth: cumTableWidth }}>
                                    <PLTableHeader columns={CUM_COLUMNS} widths={cumResize.widths} onResizeStart={cumResize.handleMouseDown} segHeaders={segmentHeaders} segWidths={segWidths} onSegResizeStart={handleSegResizeStart}
                                        kpiSlots={KPI_SLOTS} kpiDefs={kpiDefs} kpiWidths={kpiWidths} onKpiResizeStart={handleKpiResizeStart}
                                        editingKpiHeader={editingKpiHeader} editingKpiHeaderValue={editingKpiHeaderValue} kpiHeaderInputRef={kpiHeaderInputRef}
                                        onStartKpiHeaderEdit={startKpiHeaderEdit} onEditingKpiHeaderValueChange={setEditingKpiHeaderValue}
                                        onCommitKpiHeaderEdit={commitKpiHeaderEdit} onCancelKpiHeaderEdit={cancelKpiHeaderEdit}
                                    />
                                    <tbody>
                                        {cumRows.map((row, idx) => {
                                            const isSelected = selectedPeriod === row.period && selectedQuarter === row.quarter;
                                            const memoKey = `${row.period}|${row.quarter}`;
                                            const memoGrid = memoMap?.[memoKey];
                                            const memoA = extractMemoValue(memoGrid, 0);
                                            const memoB = extractMemoValue(memoGrid, 1);

                                            return (
                                                <tr
                                                    key={`cum-${row.period}-${row.quarter}-${idx}`}
                                                    className={`pl-row ${isSelected ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}
                                                    onClick={() => onRowClick?.(row.period, row.quarter)}
                                                >
                                                    <td style={{ width: cumResize.widths[0], minWidth: cumResize.widths[0] }}>{displayValue(row.period)}</td>
                                                    <td style={{ width: cumResize.widths[1], minWidth: cumResize.widths[1] }}>{displayValue(row.quarter)}</td>
                                                    <td style={{ width: cumResize.widths[2], minWidth: cumResize.widths[2] }} className="num-col">{formatMillions(row.sales)}</td>
                                                    <td style={{ width: cumResize.widths[3], minWidth: cumResize.widths[3] }} className="num-col">{formatMillions(row.grossProfit)}</td>
                                                    <td style={{ width: cumResize.widths[4], minWidth: cumResize.widths[4] }} className="num-col">{formatMillions(row.sgAndA)}</td>
                                                    <td style={{ width: cumResize.widths[5], minWidth: cumResize.widths[5] }} className="num-col">{formatMillions(row.operatingProfit)}</td>
                                                    <td style={{ width: cumResize.widths[6], minWidth: cumResize.widths[6] }} className="num-col">{fmtMargin(row.opMargin)}</td>
                                                    {/* Memo A */}
                                                    <MemoCellExcel
                                                        value={memoA}
                                                        width={cumResize.widths[7]}
                                                        isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === "memo_a"}
                                                        isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_a"}
                                                        editValue={editValue}
                                                        onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey: "memo_a" })}
                                                        onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey: "memo_a" }, val)}
                                                        onEditChange={setEditValue}
                                                        onCommit={commitEdit}
                                                        onCancel={cancelEdit}
                                                        inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_a" ? editInputRef : undefined}
                                                    />
                                                    {/* Memo B */}
                                                    <MemoCellExcel
                                                        value={memoB}
                                                        width={cumResize.widths[8]}
                                                        isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === "memo_b"}
                                                        isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_b"}
                                                        editValue={editValue}
                                                        onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey: "memo_b" })}
                                                        onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey: "memo_b" }, val)}
                                                        onEditChange={setEditValue}
                                                        onCommit={commitEdit}
                                                        onCancel={cancelEdit}
                                                        inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_b" ? editInputRef : undefined}
                                                    />
                                                    {segmentColumns.map((sc, scIdx) => {
                                                        const salesVal = getSegValue(row.period, row.quarter, sc.salesKey);
                                                        const profitVal = getSegValue(row.period, row.quarter, sc.profitKey);
                                                        const sIdx = scIdx * 2;
                                                        const pIdx = scIdx * 2 + 1;
                                                        const mapKey = `${normalizePeriod(row.period)}|${normalizeQuarter(row.quarter)}`;
                                                        const salesSource = sourceMap.get(`${mapKey}|${sc.salesKey}`);
                                                        const profitSource = sourceMap.get(`${mapKey}|${sc.profitKey}`);
                                                        const isEditableQ = row.quarter === "1Q" || row.quarter === "3Q";
                                                        const fy = extractFiscalYear(row.period);
                                                        return (
                                                            <React.Fragment key={sc.segmentName}>
                                                                <SegOverrideCell
                                                                    value={salesVal}
                                                                    source={salesSource}
                                                                    width={segWidths[sIdx]}
                                                                    editable={isEditableQ && (salesVal === null || salesSource === "manual") && !!onSegmentOverrideSave}
                                                                    isManual={salesSource === "manual"}
                                                                    fiscalYear={fy}
                                                                    quarter={row.quarter}
                                                                    segmentName={sc.segmentName}
                                                                    metric="sales"
                                                                    onSave={onSegmentOverrideSave}
                                                                    onDelete={onSegmentOverrideDelete}
                                                                    isSegActive={activeSegCell?.rowIdx === idx && activeSegCell?.colIdx === sIdx}
                                                                    onActivate={() => { setActiveSegCell({ rowIdx: idx, colIdx: sIdx }); setActiveCell(null); }}
                                                                />
                                                                <SegOverrideCell
                                                                    value={profitVal}
                                                                    source={profitSource}
                                                                    width={segWidths[pIdx]}
                                                                    editable={isEditableQ && (profitVal === null || profitSource === "manual") && !!onSegmentOverrideSave}
                                                                    isManual={profitSource === "manual"}
                                                                    fiscalYear={fy}
                                                                    quarter={row.quarter}
                                                                    segmentName={sc.segmentName}
                                                                    metric="operating_profit"
                                                                    onSave={onSegmentOverrideSave}
                                                                    onDelete={onSegmentOverrideDelete}
                                                                    isSegActive={activeSegCell?.rowIdx === idx && activeSegCell?.colIdx === pIdx}
                                                                    onActivate={() => { setActiveSegCell({ rowIdx: idx, colIdx: pIdx }); setActiveCell(null); }}
                                                                />
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    {/* KPI列 */}
                                                    {KPI_SLOTS.map((slot) => {
                                                        const colKey = `kpi_${slot}`;
                                                        const kpiKey = `${row.period}|${row.quarter}`;
                                                        const cellVal = kpiValues?.[kpiKey]?.[slot] ?? "";
                                                        return (
                                                            <MemoCellExcel
                                                                key={colKey}
                                                                value={cellVal}
                                                                width={kpiWidths[slot - 1]}
                                                                isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === colKey}
                                                                isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey}
                                                                editValue={editValue}
                                                                onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey })}
                                                                onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey }, val)}
                                                                onEditChange={setEditValue}
                                                                onCommit={commitEdit}
                                                                onCancel={cancelEdit}
                                                                inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey ? editInputRef : undefined}
                                                                className="kpi-data-cell"
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* === Q単体PL + セグメント === */}
                            <div className="pl-table-block">
                                <div className="pl-table-label">
                                    Q単体PL（百万円）
                                    {segmentColumns.length > 0 && (
                                        <span className="seg-label-badge">+ セグメント {segmentColumns.length}件</span>
                                    )}
                                </div>
                                <table className="pl-table" style={{ minWidth: qTableWidth }}>
                                    <PLTableHeader
                                        columns={Q_BASE_COLUMNS}
                                        widths={qResize.widths}
                                        onResizeStart={qResize.handleMouseDown}
                                        segHeaders={segmentHeaders}
                                        segWidths={segWidths}
                                        onSegResizeStart={handleSegResizeStart}
                                        kpiSlots={KPI_SLOTS} kpiDefs={kpiDefs} kpiWidths={kpiWidths} onKpiResizeStart={handleKpiResizeStart}
                                        editingKpiHeader={editingKpiHeader} editingKpiHeaderValue={editingKpiHeaderValue} kpiHeaderInputRef={kpiHeaderInputRef}
                                        onStartKpiHeaderEdit={startKpiHeaderEdit} onEditingKpiHeaderValueChange={setEditingKpiHeaderValue}
                                        onCommitKpiHeaderEdit={commitKpiHeaderEdit} onCancelKpiHeaderEdit={cancelKpiHeaderEdit}
                                    />
                                    <tbody>
                                        {qRows.map((row, idx) => (
                                            <tr
                                                key={`q-${row.period}-${row.quarter}-${idx}`}
                                                className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}
                                                onClick={() => onRowClick?.(row.period, row.quarter)}
                                            >
                                                <td style={{ width: qResize.widths[0], minWidth: qResize.widths[0] }}>{displayValue(row.period)}</td>
                                                <td style={{ width: qResize.widths[1], minWidth: qResize.widths[1] }}>{displayValue(row.quarter)}</td>
                                                <td style={{ width: qResize.widths[2], minWidth: qResize.widths[2] }} className="num-col">{formatMillions(row.sales)}</td>
                                                <td style={{ width: qResize.widths[3], minWidth: qResize.widths[3] }} className="num-col">{formatMillions(row.grossProfit)}</td>
                                                <td style={{ width: qResize.widths[4], minWidth: qResize.widths[4] }} className="num-col">{formatMillions(row.sgAndA)}</td>
                                                <td style={{ width: qResize.widths[5], minWidth: qResize.widths[5] }} className="num-col">{formatMillions(row.operatingProfit)}</td>
                                                <td style={{ width: qResize.widths[6], minWidth: qResize.widths[6] }} className="num-col">{fmtMargin(row.opMargin)}</td>
                                                {segmentColumns.map((sc, scIdx) => {
                                                    const salesVal = getSegQValue(row.period, row.quarter, sc.salesKey);
                                                    const profitVal = getSegQValue(row.period, row.quarter, sc.profitKey);
                                                    const sIdx = scIdx * 2;
                                                    const pIdx = scIdx * 2 + 1;
                                                    return (
                                                        <React.Fragment key={sc.segmentName}>
                                                            <td className="num-col seg-data-cell" style={{ width: segWidths[sIdx], minWidth: segWidths[sIdx] }}>{salesVal !== null ? formatMillions(salesVal) : "–"}</td>
                                                            <td className="num-col seg-data-cell" style={{ width: segWidths[pIdx], minWidth: segWidths[pIdx] }}>{profitVal !== null ? formatMillions(profitVal) : "–"}</td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {/* KPI列 (Q単体側も統合編集) */}
                                                {KPI_SLOTS.map((slot) => {
                                                    const colKey = `kpi_${slot}`;
                                                    const kpiKey = `${row.period}|${row.quarter}`;
                                                    const cellVal = kpiValues?.[kpiKey]?.[slot] ?? "";
                                                    return (
                                                        <MemoCellExcel
                                                            key={colKey}
                                                            value={cellVal}
                                                            width={kpiWidths[slot - 1]}
                                                            isActive={activeCell?.tableId === "q" && activeCell?.rowIdx === idx && activeCell?.colKey === colKey}
                                                            isEditing={editingCell?.tableId === "q" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey}
                                                            editValue={editValue}
                                                            onSelect={() => selectCell({ tableId: "q", rowIdx: idx, colKey })}
                                                            onStartEdit={(val) => startEditing({ tableId: "q", rowIdx: idx, colKey }, val)}
                                                            onEditChange={setEditValue}
                                                            onCommit={commitEdit}
                                                            onCancel={cancelEdit}
                                                            inputRef={editingCell?.tableId === "q" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey ? editInputRef : undefined}
                                                            className="kpi-data-cell"
                                                        />
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    {/* リサイズハンドル */}
                    <div className="pl-resize-handle" onMouseDown={handleResizeMouseDown} title="ドラッグで高さ調整">
                        <div className="pl-resize-grip">⋯</div>
                    </div>
                </>
            )}
            {/* トースト通知 */}
            {toastMessage && (
                <div className="seg-paste-toast">{toastMessage}</div>
            )}
        </div>
    );
}

// ============================================================
// Excel-like メモセル
// ============================================================
function MemoCellExcel({
    value,
    width,
    isActive,
    isEditing,
    editValue,
    onSelect,
    onStartEdit,
    onEditChange,
    onCommit,
    onCancel,
    inputRef,
    className,
}: {
    value: string;
    width: number;
    isActive: boolean;
    isEditing: boolean;
    editValue: string;
    onSelect: () => void;
    onStartEdit: (val: string) => void;
    onEditChange: (val: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    className?: string;
}) {
    const preview = value ? value.replace(/[\r\n]+/g, " ").trim() : "";
    const extraClass = className || "memo-cell";

    if (isEditing) {
        return (
            <td
                style={{ width, minWidth: width }}
                className={`${extraClass} memo-cell-editing`}
            >
                <input
                    ref={inputRef}
                    className="memo-inline-input"
                    value={editValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    onBlur={onCommit}
                    onKeyDown={(e) => {
                        // IME入力中は無視（日本語入力対応）
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === "Enter") { e.preventDefault(); onCommit(); }
                        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
                        if (e.key === "Tab") {
                            e.preventDefault();
                            onCommit();
                        }
                        e.stopPropagation(); // テーブルのkeydownに伝搬させない
                    }}
                    autoFocus
                />
            </td>
        );
    }

    return (
        <td
            style={{ width, minWidth: width }}
            className={`${extraClass} memo-cell-selectable ${isActive ? "memo-cell-active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(value); }}
            title={preview}
        >
            {preview || <span className="memo-empty">–</span>}
        </td>
    );
}

// ============================================================
// Segment Override Cell — PL テーブル内のセグメント編集セル
// ============================================================
function SegOverrideCell({
    value,
    source,
    width,
    editable,
    isManual,
    fiscalYear,
    quarter,
    segmentName,
    metric,
    onSave,
    onDelete,
    isSegActive,
    onActivate,
}: {
    value: number | null;
    source?: string;
    width: number;
    editable: boolean;
    isManual: boolean;
    fiscalYear: number;
    quarter: string;
    segmentName: string;
    metric: string;
    onSave?: FinancialsTableProps["onSegmentOverrideSave"];
    onDelete?: FinancialsTableProps["onSegmentOverrideDelete"];
    isSegActive?: boolean;
    onActivate?: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);




    const handleSave = useCallback(async () => {
        setEditing(false);
        const trimmed = inputVal.trim();
        if (!trimmed || !onSave) return;
        const numVal = Number(trimmed);
        if (isNaN(numVal)) return;
        setSaving(true);
        try {
            await onSave(fiscalYear, quarter, segmentName, metric, numVal);
        } catch (err) {
            console.error("Seg override save failed:", err);
        } finally {
            setSaving(false);
        }
    }, [inputVal, onSave, fiscalYear, quarter, segmentName, metric]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); handleSave(); }
        else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
        e.stopPropagation();
    }, [handleSave]);

    const handleDeleteOverride = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onDelete) return;
        if (!confirm("この手入力値を削除しますか？")) return;
        setSaving(true);
        try {
            await onDelete(fiscalYear, quarter, segmentName, metric);
        } catch (err) {
            console.error("Seg override delete failed:", err);
        } finally {
            setSaving(false);
        }
    }, [onDelete, fiscalYear, quarter, segmentName, metric]);

    // 編集中の input で paste イベントを横取りし、テーブルレベルのハンドラへ伝搬させる
    const handleInputPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData("text/plain");
        // TSV （タブまたは改行含む）の場合はデフォルト動作を止めて上位へ伝搬
        if (text && (text.includes("\t") || text.includes("\n"))) {
            e.preventDefault();
            // editing を閉じてからテーブルレベル paste を再発火
            setEditing(false);
            // カスタムイベントで再度 paste を発火（テーブル div が受け取る）
            const tableDiv = (e.target as HTMLElement).closest(".pl-section");
            if (tableDiv) {
                // ClipboardEvent を再構成して発火
                const newEvent = new ClipboardEvent("paste", {
                    clipboardData: e.clipboardData as unknown as DataTransfer,
                    bubbles: true,
                    cancelable: true,
                });
                tableDiv.dispatchEvent(newEvent);
            }
        }
        // 単一数値の場合は通常の input paste を許可
    }, []);

    const displayVal = value !== null ? formatMillions(value) : "–";
    const canEdit = editable || isManual;

    // readonly セルでもアクティブ化は許可（横貼りのスキップ対象を判断するため）
    const handleCellClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onActivate?.();
        if (canEdit) {
            if (isManual) {
                setInputVal(value !== null ? String(value) : "");
            } else {
                setInputVal("");
            }
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [canEdit, isManual, value, onActivate]);

    if (editing) {
        return (
            <td className="num-col seg-data-cell" style={{ width, minWidth: width }}>
                <div className="segment-cell-edit">
                    <input
                        ref={inputRef}
                        type="number"
                        className="segment-cell-input"
                        placeholder="百万円"
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        onPaste={handleInputPaste}
                        disabled={saving}
                        autoFocus
                    />
                </div>
            </td>
        );
    }

    return (
        <td
            className={`num-col seg-data-cell ${editable && !isManual ? "seg-editable" : ""} ${isManual ? "seg-manual-editable" : ""} ${saving ? "seg-saving" : ""} ${isSegActive ? "seg-cell-active" : ""}`}
            style={{ width, minWidth: width }}
            onClick={handleCellClick}
            title={canEdit ? (isManual ? "クリックで再編集" : "クリックして入力") : "クリックして選択（ペースト用）"}
        >
            <div className="segment-cell-display">
                {editable && value === null ? (
                    <span className="segment-cell-placeholder">入力</span>
                ) : (
                    <span>{displayVal}</span>
                )}
                {isManual && (
                    <span
                        className="segment-manual-badge"
                        onClick={handleDeleteOverride}
                        title="手入力値 — クリックで削除"
                    >
                        M
                    </span>
                )}
            </div>
        </td>
    );
}
