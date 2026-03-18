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

/** 範囲選択 */
interface SelectionRange {
    tableId: "cum" | "q";
    startRow: number;
    startColIdx: number;  // 絶対列インデックス (0-based)
    endRow: number;
    endColIdx: number;
}

// CUM: [period, quarter, sales, gp, gm_rate, sga, op, margin, memo_a, memo_b, ...kpis]
// Q:   [period, quarter, sales, gp, gm_rate, sga, op, margin, ...kpis]
const CUM_BASE_COL_COUNT = 10;
const Q_BASE_COL_COUNT = 8;

// 編集可能列の共通定数
const MEMO_COLS = ["memo_a", "memo_b"] as const;
const KPI_COLS = ["kpi_1", "kpi_2", "kpi_3"] as const;
const EDITABLE_COLS: string[] = [...MEMO_COLS, ...KPI_COLS];

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
    /** Undo (Ctrl+Z) */
    onUndo?: () => void;
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
    { key: "gm_rate", label: "粗利率", initialWidth: 75, className: "num-col" },
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
    { key: "gm_rate", label: "粗利率", initialWidth: 75, className: "num-col" },
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
    onUndo,
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
    // PLテーブル幅（セグメント列なし）
    const cumTableWidth = cumResize.widths.reduce((s, w) => s + w, 0) + kpiExtraWidth;
    const qBaseWidth = qResize.widths.reduce((s, w) => s + w, 0);
    const qTableWidth = qBaseWidth + kpiExtraWidth;
    // セグメントテーブル幅
    const segCumTableWidth = 100 + 45 + segExtraWidth;
    const segQTableWidth = 100 + 45 + segExtraWidth;

    // ============================================================
    // Excel-like セル操作
    // ============================================================
    const [activeCell, setActiveCell] = useState<CellCoord | null>(null);
    const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
    const [editValue, setEditValue] = useState("");
    const editInputRef = useRef<HTMLElement>(null);
    const formulaBarRef = useRef<HTMLTextAreaElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    // 範囲選択
    const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
    const isDragging = useRef(false);
    const dragDidMove = useRef(false);  // ドラッグ中に別セルへ移動したか

    // フォーミュラバー高さリサイズ
    const FB_HEIGHT_KEY = "formula-bar-height";
    const FB_DEFAULT_HEIGHT = 52;
    const FB_MIN_HEIGHT = 28;
    const FB_MAX_HEIGHT = 300;
    const [formulaBarHeight, setFormulaBarHeight] = useState(() => {
        if (typeof window === "undefined") return FB_DEFAULT_HEIGHT;
        const saved = localStorage.getItem(FB_HEIGHT_KEY);
        if (saved) { const n = parseInt(saved, 10); if (!isNaN(n) && n >= FB_MIN_HEIGHT && n <= FB_MAX_HEIGHT) return n; }
        return FB_DEFAULT_HEIGHT;
    });
    const fbResizing = useRef(false);
    const fbResizeStartY = useRef(0);
    const fbResizeStartH = useRef(0);

    useEffect(() => {
        localStorage.setItem(FB_HEIGHT_KEY, String(formulaBarHeight));
    }, [formulaBarHeight]);

    const handleFbResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        fbResizing.current = true;
        fbResizeStartY.current = e.clientY;
        fbResizeStartH.current = formulaBarHeight;
        const onMove = (ev: MouseEvent) => {
            if (!fbResizing.current) return;
            const diff = ev.clientY - fbResizeStartY.current;
            const newH = Math.max(FB_MIN_HEIGHT, Math.min(FB_MAX_HEIGHT, fbResizeStartH.current + diff));
            setFormulaBarHeight(newH);
        };
        const onUp = () => {
            fbResizing.current = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
    }, [formulaBarHeight]);

    // セグメントセルのアクティブ管理
    const [activeSegCell, setActiveSegCell] = useState<SegCellCoord | null>(null);
    // セグメントセルの編集管理（親制御）
    const [editingSegCell, setEditingSegCell] = useState<SegCellCoord | null>(null);
    const [segEditValue, setSegEditValue] = useState("");
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


    // grid wrapperにfocusを戻すヘルパー
    const focusGrid = useCallback(() => {
        requestAnimationFrame(() => {
            gridRef.current?.focus();
        });
    }, []);

    // セル選択
    const selectCell = useCallback((coord: CellCoord) => {
        setActiveCell(coord);
        setEditingCell(null);
        setSelectionRange(null);
        // セグメントセルの選択を解除
        setActiveSegCell(null);
        setEditingSegCell(null);
        // DOM focus をグリッドルートへ移動 (Ctrl+V 等のキーイベント受け取りのため)
        focusGrid();
    }, [focusGrid]);

    // 範囲選択: mousedown (ドラッグ開始)
    const handleCellMouseDown = useCallback((tableId: "cum" | "q", rowIdx: number, colIdx: number, e: React.MouseEvent) => {
        // 左クリックのみ
        if (e.button !== 0) return;
        e.preventDefault(); // ブラウザのテキスト選択(灰色ハイライト)を防止
        isDragging.current = true;
        dragDidMove.current = false;
        setSelectionRange({ tableId, startRow: rowIdx, startColIdx: colIdx, endRow: rowIdx, endColIdx: colIdx });
        setEditingCell(null);
        setActiveSegCell(null);
        setEditingSegCell(null);
    }, []);

    // 範囲選択: mouseenter (ドラッグ中の拡張)
    const handleCellMouseEnter = useCallback((tableId: "cum" | "q", rowIdx: number, colIdx: number) => {
        if (!isDragging.current || !selectionRange) return;
        if (selectionRange.tableId !== tableId) return;
        // 別セルに入ったらドラッグ移動とみなす
        if (rowIdx !== selectionRange.startRow || colIdx !== selectionRange.startColIdx) {
            dragDidMove.current = true;
        }
        setSelectionRange((prev) => prev ? { ...prev, endRow: rowIdx, endColIdx: colIdx } : prev);
    }, [selectionRange]);

    // 範囲選択: mouseup (ドラッグ終了) — グローバルリスナー
    useEffect(() => {
        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                // 単一セルだけの場合(ドラッグしていない)は範囲クリア
                if (!dragDidMove.current) {
                    setSelectionRange(null);
                }
                // dragDidMove は click イベント後にリセット (少し遅延)
                setTimeout(() => { dragDidMove.current = false; }, 0);
            }
        };
        document.addEventListener("mouseup", handleMouseUp);
        return () => document.removeEventListener("mouseup", handleMouseUp);
    }, []);

    // セルが範囲内か判定
    const isCellInRange = useCallback((tableId: "cum" | "q", rowIdx: number, colIdx: number): boolean => {
        if (!selectionRange || selectionRange.tableId !== tableId) return false;
        const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
        const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
        const minCol = Math.min(selectionRange.startColIdx, selectionRange.endColIdx);
        const maxCol = Math.max(selectionRange.startColIdx, selectionRange.endColIdx);
        return rowIdx >= minRow && rowIdx <= maxRow && colIdx >= minCol && colIdx <= maxCol;
    }, [selectionRange]);

    // セル表示値を取得 (全列対応)
    const getCellDisplayValue = useCallback((tableId: "cum" | "q", rowIdx: number, colIdx: number): string => {
        const rows = tableId === "cum" ? cumRows : qRows;
        const row = rows[rowIdx];
        if (!row) return "";
        const baseCount = tableId === "cum" ? CUM_BASE_COL_COUNT : Q_BASE_COL_COUNT;
        const kpiStart = baseCount;

        // 基本列 (0=period,1=Q,2=sales,3=gp,4=gm_rate,5=sga,6=op,7=margin, cum:8=memoA,9=memoB)
        if (colIdx < baseCount) {
            if (colIdx === 0) return row.period || "";
            if (colIdx === 1) return row.quarter || "";
            if (colIdx === 2) return formatMillions(row.sales) ?? "";
            if (colIdx === 3) return formatMillions(row.grossProfit) ?? "";
            if (colIdx === 4) return fmtMargin(row.grossMarginRate);
            if (colIdx === 5) return formatMillions(row.sgAndA) ?? "";
            if (colIdx === 6) return formatMillions(row.operatingProfit) ?? "";
            if (colIdx === 7) return fmtMargin(row.opMargin);
            if (tableId === "cum" && colIdx === 8) {
                const mKey = `${row.period}|${row.quarter}`;
                return extractMemoValue(memoMap?.[mKey], 0);
            }
            if (tableId === "cum" && colIdx === 9) {
                const mKey = `${row.period}|${row.quarter}`;
                return extractMemoValue(memoMap?.[mKey], 1);
            }
        }
        // KPI列
        if (colIdx >= kpiStart && colIdx < kpiStart + 3) {
            const slot = colIdx - kpiStart + 1;
            const kpiKey = `${row.period}|${row.quarter}`;
            return kpiValues?.[kpiKey]?.[slot] ?? "";
        }
        return "";
    }, [cumRows, qRows, memoMap, kpiValues]);

    // TSVクォーティング (改行/タブを含むセルをダブルクォートで囲む)
    const quoteTsvCell = (val: string): string => {
        if (val.includes("\t") || val.includes("\n") || val.includes("\r") || val.includes('"')) {
            return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
    };

    // 範囲のセル値を取得 (TSVフォーマット)
    const getRangeAsTsv = useCallback((): string => {
        if (!selectionRange) return "";
        const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
        const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
        const minCol = Math.min(selectionRange.startColIdx, selectionRange.endColIdx);
        const maxCol = Math.max(selectionRange.startColIdx, selectionRange.endColIdx);
        const lines: string[] = [];
        for (let r = minRow; r <= maxRow; r++) {
            const cells: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
                cells.push(quoteTsvCell(getCellDisplayValue(selectionRange.tableId, r, c)));
            }
            lines.push(cells.join("\t"));
        }
        return lines.join("\n");
    }, [selectionRange, getCellDisplayValue]);

    // 範囲クリア (Delete/Backspace) — 編集可能列のみ
    const clearRange = useCallback(() => {
        if (!selectionRange) return;
        const rows = selectionRange.tableId === "cum" ? cumRows : qRows;
        const baseCount = selectionRange.tableId === "cum" ? CUM_BASE_COL_COUNT : Q_BASE_COL_COUNT;
        const kpiStart = baseCount;
        const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
        const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
        const minCol = Math.min(selectionRange.startColIdx, selectionRange.endColIdx);
        const maxCol = Math.max(selectionRange.startColIdx, selectionRange.endColIdx);
        for (let r = minRow; r <= maxRow; r++) {
            const row = rows[r];
            if (!row) continue;
            for (let c = minCol; c <= maxCol; c++) {
                // メモ列 (cumのみ: col 8=memo_a, 9=memo_b)
                if (selectionRange.tableId === "cum" && (c === 8 || c === 9) && onMemoEdit) {
                    onMemoEdit(row.period, row.quarter, c === 8 ? 0 : 1, "");
                }
                // KPI列
                if (c >= kpiStart && c < kpiStart + 3 && onKpiValueEdit) {
                    const slot = c - kpiStart + 1;
                    onKpiValueEdit(row.period, row.quarter, slot, "");
                }
            }
        }
    }, [selectionRange, cumRows, qRows, onMemoEdit, onKpiValueEdit]);

    // 編集開始
    const startEditing = useCallback((coord: CellCoord, initialValue?: string) => {
        setEditingCell(coord);
        setActiveCell(coord);
        const val = initialValue !== undefined ? initialValue : "";
        setEditValue(val);
        setTimeout(() => editInputRef.current?.focus(), 0);
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
        const editableCols = EDITABLE_COLS;
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

    // セグメントセル移動
    const moveActiveSegCell = useCallback((dRow: number, dCol: number) => {
        if (!activeSegCell) return;
        const totalSegCols = segmentColumns.length * 2;
        let newRow = activeSegCell.rowIdx + dRow;
        let newCol = activeSegCell.colIdx + dCol;

        // 列折り返し
        if (newCol < 0) { newRow--; newCol = totalSegCols - 1; }
        if (newCol >= totalSegCols) { newRow++; newCol = 0; }

        if (newRow < 0 || newRow >= cumRows.length) return;

        setActiveSegCell({ rowIdx: newRow, colIdx: newCol });
    }, [activeSegCell, segmentColumns.length, cumRows.length]);

    // セグメントセル: 親から編集開始
    const startSegEditing = useCallback((coord: SegCellCoord, initialValue: string) => {
        setEditingSegCell(coord);
        setSegEditValue(initialValue);
    }, []);

    // セグメントセル: 編集完了（保存は SegOverrideCell 内で実行、親は状態リセットのみ）
    const finishSegEditing = useCallback(() => {
        setEditingSegCell(null);
        setSegEditValue("");
        requestAnimationFrame(() => gridRef.current?.focus());
    }, []);

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

        // --- セグメントセルがアクティブの場合 ---
        if (activeSegCell && !editingSegCell) {
            if (e.key === "ArrowUp") { e.preventDefault(); moveActiveSegCell(-1, 0); }
            else if (e.key === "ArrowDown") { e.preventDefault(); moveActiveSegCell(1, 0); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); moveActiveSegCell(0, -1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); moveActiveSegCell(0, 1); }
            else if (e.key === "Tab") { e.preventDefault(); moveActiveSegCell(0, e.shiftKey ? -1 : 1); }
            else if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault();
                // 現在のセルの値を取得して編集開始
                startSegEditing(activeSegCell, "");
            }
            // 数字・マイナス・ドット → 直接入力で編集開始
            else if (/^[0-9.\-]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                startSegEditing(activeSegCell, e.key);
            }
            else if (e.key === "Escape") {
                e.preventDefault();
                setActiveSegCell(null);
            }
            return;
        }

        // セグメント編集中はスキップ（input 側で処理）
        if (editingSegCell) return;

        // --- メモ / KPI セルがアクティブの場合 ---
        if (!activeCell) return;

        // 編集中の処理は input 側の onKeyDown で処理するため、ここではスキップ
        if (editingCell) return;

        // Ctrl+Z: Undo
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            onUndo?.();
            return;
        }

        // Ctrl+C: 範囲コピー
        if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
            if (selectionRange) {
                e.preventDefault();
                const tsv = getRangeAsTsv();
                if (tsv) navigator.clipboard.writeText(tsv).catch(console.error);
                return;
            }
            // 単一セルの場合も value をコピー
            if (activeCell) {
                e.preventDefault();
                const val = getActiveCellValue();
                if (val) navigator.clipboard.writeText(quoteTsvCell(val)).catch(console.error);
                return;
            }
        }

        // Delete/Backspace: 範囲クリア or 単一セルクリア
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            if (selectionRange) {
                clearRange();
                return;
            }
            // 単一セルクリア
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
            return;
        }

        // 非編集中: 矢印キーで移動
        if (e.key === "ArrowUp") { e.preventDefault(); setSelectionRange(null); moveActiveCell(-1, 0); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setSelectionRange(null); moveActiveCell(1, 0); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); setSelectionRange(null); moveActiveCell(0, -1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); setSelectionRange(null); moveActiveCell(0, 1); }
        else if (e.key === "Tab") { e.preventDefault(); setSelectionRange(null); moveActiveCell(0, e.shiftKey ? -1 : 1); }
        else if (e.key === "Enter") {
            e.preventDefault();
            setSelectionRange(null);
            const val = getActiveCellValue();
            startEditing(activeCell, val);
        }
        else if (e.key === "F2") {
            e.preventDefault();
            setSelectionRange(null);
            const val = getActiveCellValue();
            startEditing(activeCell, val);
        }
        // Escape: 範囲解除
        else if (e.key === "Escape") {
            e.preventDefault();
            setSelectionRange(null);
        }
        // 印字可能文字 → 新しい値で編集開始（既存値を上書き）
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setSelectionRange(null);
            startEditing(activeCell, e.key);
        }
    }, [activeCell, activeSegCell, editingCell, editingSegCell, moveActiveCell, moveActiveSegCell, startEditing, startSegEditing, getActiveCellValue, cumRows, qRows, onMemoEdit, onKpiValueEdit, selectionRange, getRangeAsTsv, clearRange]);

    // PL側 編集可能セル ペースト (memo + kpi 統合)
    const handleEditablePaste = useCallback(
        (tableId: "cum" | "q", startEditableIdx: number, startRowIdx: number, e: React.ClipboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const text = e.clipboardData.getData("text/plain");
            if (!text) return;
            const parsed = parseTsvClipboard(text);
            if (parsed.length === 0) return;

            const rows = tableId === "cum" ? cumRows : qRows;
            // cumテーブルの編集可能列: memo_a, memo_b, kpi_1, kpi_2, kpi_3
            // qテーブルの編集可能列: kpi_1, kpi_2, kpi_3 (memo列なし)
            const availableCols = tableId === "cum" ? EDITABLE_COLS : [...KPI_COLS];

            const memoEdits: { period: string; quarter: string; colIdx: number; value: string }[] = [];
            const kpiEdits: { period: string; quarter: string; slot: number; value: string }[] = [];

            for (let r = 0; r < parsed.length; r++) {
                const targetRowIdx = startRowIdx + r;
                if (targetRowIdx >= rows.length) break;
                const row = rows[targetRowIdx];
                for (let c = 0; c < parsed[r].length; c++) {
                    const colPos = startEditableIdx + c;
                    if (colPos >= availableCols.length) break;
                    const colKey = availableCols[colPos];
                    const value = parsed[r][c];

                    if (colKey === "memo_a" || colKey === "memo_b") {
                        memoEdits.push({
                            period: row.period,
                            quarter: row.quarter,
                            colIdx: colKey === "memo_a" ? 0 : 1,
                            value,
                        });
                    } else if (colKey.startsWith("kpi_")) {
                        const slot = parseInt(colKey.split("_")[1]);
                        kpiEdits.push({ period: row.period, quarter: row.quarter, slot, value });
                    }
                }
            }

            // memo列の一括保存
            if (memoEdits.length > 0 && onMemoPaste) {
                onMemoPaste(memoEdits);
            }
            // kpi列の保存 (1セルずつ)
            if (kpiEdits.length > 0 && onKpiValueEdit) {
                for (const edit of kpiEdits) {
                    onKpiValueEdit(edit.period, edit.quarter, edit.slot, edit.value);
                }
            }
        },
        [cumRows, qRows, onMemoPaste, onKpiValueEdit]
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

        // メモ / KPI セルがアクティブの場合 → 編集可能セル ペースト処理
        if (!activeCell) return;
        // 対象テーブルの編集可能列を判定
        const availableCols = activeCell.tableId === "cum" ? EDITABLE_COLS : [...KPI_COLS] as string[];
        if (!availableCols.includes(activeCell.colKey)) return;
        const startEditableIdx = availableCols.indexOf(activeCell.colKey);
        handleEditablePaste(activeCell.tableId, startEditableIdx, activeCell.rowIdx, e);
    }, [activeCell, activeSegCell, handleEditablePaste, onBulkSaveOverrides, cumRows, segmentColumns, segmentMap, sourceMap, showToast]);

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
                    style={{ height: formulaBarHeight }}
                    disabled={!activeCell}
                />
            </div>
            {/* フォーミュラバー リサイズハンドル */}
            <div
                className="formula-bar-resize-handle"
                onMouseDown={handleFbResizeStart}
            >
                <span className="formula-bar-resize-grip">⋯</span>
            </div>

            {data.length === 0 ? (
                <div className="no-data-message">該当なし</div>
            ) : (
                <>
                    <div className="pl-scroll-area" style={{ maxHeight: plHeight }}>
                        <div className="pl-dual-tables">
                            {/* === 累計PL === */}
                            <div className="pl-table-block">
                                <div className="pl-table-label">累計PL（百万円）</div>
                                <table className="pl-table" style={{ minWidth: cumTableWidth }}>
                                    <PLTableHeader columns={CUM_COLUMNS} widths={cumResize.widths} onResizeStart={cumResize.handleMouseDown}
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
                                                <tr key={`cum-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${isSelected ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`} onClick={() => onRowClick?.(row.period, row.quarter)}>
                                                    <td style={{ width: cumResize.widths[0], minWidth: cumResize.widths[0] }} className={isCellInRange("cum", idx, 0) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("cum", idx, 0, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 0)}>{displayValue(row.period)}</td>
                                                    <td style={{ width: cumResize.widths[1], minWidth: cumResize.widths[1] }} className={isCellInRange("cum", idx, 1) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("cum", idx, 1, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 1)}>{displayValue(row.quarter)}</td>
                                                    <td style={{ width: cumResize.widths[2], minWidth: cumResize.widths[2] }} className={`num-col ${isCellInRange("cum", idx, 2) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 2, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 2)}>{formatMillions(row.sales)}</td>
                                                    <td style={{ width: cumResize.widths[3], minWidth: cumResize.widths[3] }} className={`num-col ${isCellInRange("cum", idx, 3) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 3, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 3)}>{formatMillions(row.grossProfit)}</td>
                                                    <td style={{ width: cumResize.widths[4], minWidth: cumResize.widths[4] }} className={`num-col ${isCellInRange("cum", idx, 4) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 4, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 4)}>{fmtMargin(row.grossMarginRate)}</td>
                                                    <td style={{ width: cumResize.widths[5], minWidth: cumResize.widths[5] }} className={`num-col ${isCellInRange("cum", idx, 5) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 5, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 5)}>{formatMillions(row.sgAndA)}</td>
                                                    <td style={{ width: cumResize.widths[6], minWidth: cumResize.widths[6] }} className={`num-col ${isCellInRange("cum", idx, 6) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 6, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 6)}>{formatMillions(row.operatingProfit)}</td>
                                                    <td style={{ width: cumResize.widths[7], minWidth: cumResize.widths[7] }} className={`num-col ${isCellInRange("cum", idx, 7) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 7, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 7)}>{fmtMargin(row.opMargin)}</td>
                                                    <MemoCellExcel value={memoA} width={cumResize.widths[8]}
                                                        isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === "memo_a"}
                                                        isInRange={isCellInRange("cum", idx, 8)}
                                                        isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_a"}
                                                        editValue={editValue}
                                                        onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey: "memo_a" })}
                                                        onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey: "memo_a" }, val)}
                                                        onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}
                                                        inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_a" ? editInputRef : undefined}
                                                        onMouseDown={(e) => handleCellMouseDown("cum", idx, 8, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 8)}
                                                    />
                                                    <MemoCellExcel value={memoB} width={cumResize.widths[9]}
                                                        isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === "memo_b"}
                                                        isInRange={isCellInRange("cum", idx, 9)}
                                                        isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_b"}
                                                        editValue={editValue}
                                                        onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey: "memo_b" })}
                                                        onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey: "memo_b" }, val)}
                                                        onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}
                                                        inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_b" ? editInputRef : undefined}
                                                        onMouseDown={(e) => handleCellMouseDown("cum", idx, 9, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 9)}
                                                    />
                                                    {KPI_SLOTS.map((slot) => {
                                                        const colKey = `kpi_${slot}`;
                                                        const kpiKey = `${row.period}|${row.quarter}`;
                                                        const cellVal = kpiValues?.[kpiKey]?.[slot] ?? "";
                                                        const kpiAbsCol = CUM_BASE_COL_COUNT + (slot - 1);
                                                        return (
                                                            <MemoCellExcel key={colKey} value={cellVal} width={kpiWidths[slot - 1]}
                                                                isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === colKey}
                                                                isInRange={isCellInRange("cum", idx, kpiAbsCol)}
                                                                isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey}
                                                                editValue={editValue}
                                                                onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey })}
                                                                onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey }, val)}
                                                                onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}
                                                                inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey ? editInputRef : undefined}
                                                                className="kpi-cell"
                                                                onMouseDown={(e) => handleCellMouseDown("cum", idx, kpiAbsCol, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, kpiAbsCol)}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {/* === Q単体PL === */}
                            <div className="pl-table-block">
                                <div className="pl-table-label">Q単体PL（百万円）</div>
                                <table className="pl-table" style={{ minWidth: qTableWidth }}>
                                    <PLTableHeader columns={Q_BASE_COLUMNS} widths={qResize.widths} onResizeStart={qResize.handleMouseDown}
                                        kpiSlots={KPI_SLOTS} kpiDefs={kpiDefs} kpiWidths={kpiWidths} onKpiResizeStart={handleKpiResizeStart}
                                        editingKpiHeader={editingKpiHeader} editingKpiHeaderValue={editingKpiHeaderValue} kpiHeaderInputRef={kpiHeaderInputRef}
                                        onStartKpiHeaderEdit={startKpiHeaderEdit} onEditingKpiHeaderValueChange={setEditingKpiHeaderValue}
                                        onCommitKpiHeaderEdit={commitKpiHeaderEdit} onCancelKpiHeaderEdit={cancelKpiHeaderEdit}
                                    />
                                    <tbody>
                                        {qRows.map((row, idx) => (
                                            <tr key={`q-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`} onClick={() => onRowClick?.(row.period, row.quarter)}>
                                                <td style={{ width: qResize.widths[0], minWidth: qResize.widths[0] }} className={isCellInRange("q", idx, 0) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("q", idx, 0, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 0)}>{displayValue(row.period)}</td>
                                                <td style={{ width: qResize.widths[1], minWidth: qResize.widths[1] }} className={isCellInRange("q", idx, 1) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("q", idx, 1, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 1)}>{displayValue(row.quarter)}</td>
                                                <td style={{ width: qResize.widths[2], minWidth: qResize.widths[2] }} className={`num-col ${isCellInRange("q", idx, 2) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 2, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 2)}>{formatMillions(row.sales)}</td>
                                                <td style={{ width: qResize.widths[3], minWidth: qResize.widths[3] }} className={`num-col ${isCellInRange("q", idx, 3) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 3, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 3)}>{formatMillions(row.grossProfit)}</td>
                                                <td style={{ width: qResize.widths[4], minWidth: qResize.widths[4] }} className={`num-col ${isCellInRange("q", idx, 4) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 4, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 4)}>{fmtMargin(row.grossMarginRate)}</td>
                                                <td style={{ width: qResize.widths[5], minWidth: qResize.widths[5] }} className={`num-col ${isCellInRange("q", idx, 5) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 5, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 5)}>{formatMillions(row.sgAndA)}</td>
                                                <td style={{ width: qResize.widths[6], minWidth: qResize.widths[6] }} className={`num-col ${isCellInRange("q", idx, 6) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 6, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 6)}>{formatMillions(row.operatingProfit)}</td>
                                                <td style={{ width: qResize.widths[7], minWidth: qResize.widths[7] }} className={`num-col ${isCellInRange("q", idx, 7) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 7, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 7)}>{fmtMargin(row.opMargin)}</td>
                                                {KPI_SLOTS.map((slot) => {
                                                    const colKey = `kpi_${slot}`;
                                                    const kpiKey = `${row.period}|${row.quarter}`;
                                                    const cellVal = kpiValues?.[kpiKey]?.[slot] ?? "";
                                                    const kpiAbsCol = Q_BASE_COL_COUNT + (slot - 1);
                                                    return (
                                                        <MemoCellExcel key={colKey} value={cellVal} width={kpiWidths[slot - 1]}
                                                            isActive={activeCell?.tableId === "q" && activeCell?.rowIdx === idx && activeCell?.colKey === colKey}
                                                            isInRange={isCellInRange("q", idx, kpiAbsCol)}
                                                            isEditing={editingCell?.tableId === "q" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey}
                                                            editValue={editValue}
                                                            onSelect={() => selectCell({ tableId: "q", rowIdx: idx, colKey })}
                                                            onStartEdit={(val) => startEditing({ tableId: "q", rowIdx: idx, colKey }, val)}
                                                            onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}
                                                            inputRef={editingCell?.tableId === "q" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey ? editInputRef : undefined}
                                                            className="kpi-data-cell"
                                                            onMouseDown={(e) => handleCellMouseDown("q", idx, kpiAbsCol, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, kpiAbsCol)}
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
                    {/* PL最下部サマリ: 最新FY予想の売上・営業利益 */}
                    {(() => {
                        const latestFY = [...cumRows].reverse().find(r => r.quarter === "FY");
                        if (!latestFY || (latestFY.sales === null && latestFY.operatingProfit === null)) return null;
                        return (
                            <div className="pl-summary-bar">
                                <span className="pl-summary-period">📌 最新FY予想: {latestFY.period} {latestFY.quarter}</span>
                                {latestFY.sales !== null && (
                                    <span className="pl-summary-item">
                                        <span className="pl-summary-label">売上</span>
                                        <span className="pl-summary-value">{formatMillions(latestFY.sales)}</span>
                                    </span>
                                )}
                                {latestFY.operatingProfit !== null && (
                                    <span className="pl-summary-item">
                                        <span className="pl-summary-label">営業利益</span>
                                        <span className="pl-summary-value">{formatMillions(latestFY.operatingProfit)}</span>
                                    </span>
                                )}
                                {latestFY.opMargin !== null && (
                                    <span className="pl-summary-item">
                                        <span className="pl-summary-label">営利率</span>
                                        <span className="pl-summary-value">{fmtMargin(latestFY.opMargin)}</span>
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                    {/* セグメント群テーブル */}
                    {segmentColumns.length > 0 && (
                        <div className="data-section seg-section" style={{ marginTop: 12 }}>
                            <h3 className="section-title" style={{ fontSize: 14 }}>{"📊"} セグメント業績 — {segmentColumns.length}件</h3>
                            <div className="pl-scroll-area" style={{ maxHeight: plHeight }}>
                                <div className="pl-dual-tables">
                                    <div className="pl-table-block">
                                        <div className="pl-table-label">累計セグメント（百万円）</div>
                                        <table className="pl-table" style={{ minWidth: segCumTableWidth }}>
                                            <thead><tr>
                                                <th style={{ width: 100, minWidth: 100 }}><div className="th-content"><span>PERIOD</span></div></th>
                                                <th style={{ width: 45, minWidth: 45 }}><div className="th-content"><span>Q</span></div></th>
                                                {segmentHeaders.map((eh, si) => (<th key={`seg-cum-h-${si}`} className={`seg-header-cell ${eh.className || "num-col"}`} style={{ width: segWidths[si] ?? 90, minWidth: 24 }}><div className="th-content"><span>{eh.label}</span><div className="resize-handle" onMouseDown={(e) => handleSegResizeStart(si, e)} /></div></th>))}
                                            </tr></thead>
                                            <tbody>
                                                {cumRows.map((row, idx) => (
                                                    <tr key={`seg-cum-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}>
                                                        <td style={{ width: 100, minWidth: 100 }}>{displayValue(row.period)}</td>
                                                        <td style={{ width: 45, minWidth: 45 }}>{displayValue(row.quarter)}</td>
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
                                                                    <SegOverrideCell value={salesVal} source={salesSource} width={segWidths[sIdx]}
                                                                        editable={isEditableQ && (salesVal === null || salesSource === "manual") && !!onSegmentOverrideSave}
                                                                        isManual={salesSource === "manual"} fiscalYear={fy} quarter={row.quarter} segmentName={sc.segmentName} metric="sales"
                                                                        onSave={onSegmentOverrideSave} onDelete={onSegmentOverrideDelete}
                                                                        isSegActive={activeSegCell?.rowIdx === idx && activeSegCell?.colIdx === sIdx}
                                                                        onActivate={() => { setActiveSegCell({ rowIdx: idx, colIdx: sIdx }); setActiveCell(null); setEditingSegCell(null); }}
                                                                        isSegEditing={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === sIdx}
                                                                        segEditInitValue={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === sIdx ? segEditValue : undefined}
                                                                        onSegEditDone={finishSegEditing}
                                                                    />
                                                                    <SegOverrideCell value={profitVal} source={profitSource} width={segWidths[pIdx]}
                                                                        editable={isEditableQ && (profitVal === null || profitSource === "manual") && !!onSegmentOverrideSave}
                                                                        isManual={profitSource === "manual"} fiscalYear={fy} quarter={row.quarter} segmentName={sc.segmentName} metric="operating_profit"
                                                                        onSave={onSegmentOverrideSave} onDelete={onSegmentOverrideDelete}
                                                                        isSegActive={activeSegCell?.rowIdx === idx && activeSegCell?.colIdx === pIdx}
                                                                        onActivate={() => { setActiveSegCell({ rowIdx: idx, colIdx: pIdx }); setActiveCell(null); setEditingSegCell(null); }}
                                                                        isSegEditing={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === pIdx}
                                                                        segEditInitValue={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === pIdx ? segEditValue : undefined}
                                                                        onSegEditDone={finishSegEditing}
                                                                    />
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="pl-table-block">
                                        <div className="pl-table-label">Q単体セグメント（百万円）</div>
                                        <table className="pl-table" style={{ minWidth: segQTableWidth }}>
                                            <thead><tr>
                                                <th style={{ width: 100, minWidth: 100 }}><div className="th-content"><span>PERIOD</span></div></th>
                                                <th style={{ width: 45, minWidth: 45 }}><div className="th-content"><span>Q</span></div></th>
                                                {segmentHeaders.map((eh, si) => (<th key={`seg-q-h-${si}`} className={`seg-header-cell ${eh.className || "num-col"}`} style={{ width: segWidths[si] ?? 90, minWidth: 24 }}><div className="th-content"><span>{eh.label}</span><div className="resize-handle" onMouseDown={(e) => handleSegResizeStart(si, e)} /></div></th>))}
                                            </tr></thead>
                                            <tbody>
                                                {qRows.map((row, idx) => (
                                                    <tr key={`seg-q-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}>
                                                        <td style={{ width: 100, minWidth: 100 }}>{displayValue(row.period)}</td>
                                                        <td style={{ width: 45, minWidth: 45 }}>{displayValue(row.quarter)}</td>
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
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
    isInRange,
    isEditing,
    editValue,
    onSelect,
    onStartEdit,
    onEditChange,
    onCommit,
    onCancel,
    inputRef,
    className,
    onMouseDown,
    onMouseEnter,
}: {
    value: string;
    width: number;
    isActive: boolean;
    isInRange?: boolean;
    isEditing: boolean;
    editValue: string;
    onSelect: () => void;
    onStartEdit: (val: string) => void;
    onEditChange: (val: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    inputRef?: React.RefObject<HTMLElement | null>;
    className?: string;
    onMouseDown?: (e: React.MouseEvent) => void;
    onMouseEnter?: () => void;
}) {
    const preview = value ? value.replace(/[\r\n]+/g, " ").trim() : "";
    const extraClass = className || "memo-cell";
    const isMemoCell = extraClass === "memo-cell";

    if (isEditing) {
        // メモセル: textarea (セル内改行対応、Alt+Enter)
        // KPIセル: input (従来通り)
        return (
            <td
                style={{ width, minWidth: width, maxWidth: width, overflow: "hidden" }}
                className={`${extraClass} memo-cell-editing`}
            >
                {isMemoCell ? (
                    <textarea
                        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                        className="memo-inline-input memo-inline-textarea"
                        value={editValue}
                        onChange={(e) => onEditChange(e.target.value)}
                        onBlur={onCommit}
                        onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            // Alt+Enter: セル内改行を挿入
                            if (e.key === "Enter" && e.altKey) {
                                e.preventDefault();
                                const ta = e.currentTarget;
                                const start = ta.selectionStart;
                                const end = ta.selectionEnd;
                                const newVal = editValue.substring(0, start) + "\n" + editValue.substring(end);
                                onEditChange(newVal);
                                // キャレット位置を改行の後ろに移動
                                requestAnimationFrame(() => {
                                    ta.selectionStart = ta.selectionEnd = start + 1;
                                });
                                return;
                            }
                            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
                            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
                            if (e.key === "Tab") { e.preventDefault(); onCommit(); }
                            e.stopPropagation();
                        }}
                        autoFocus
                    />
                ) : (
                    <input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        className="memo-inline-input"
                        value={editValue}
                        onChange={(e) => onEditChange(e.target.value)}
                        onBlur={onCommit}
                        onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
                            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
                            if (e.key === "Tab") { e.preventDefault(); onCommit(); }
                            e.stopPropagation();
                        }}
                        autoFocus
                    />
                )}
            </td>
        );
    }

    return (
        <td
            style={{ width, minWidth: width, maxWidth: width, overflow: "hidden" }}
            className={`${extraClass} memo-cell-selectable ${isActive ? "memo-cell-active" : ""} ${isInRange ? "memo-cell-in-range" : ""}`}
            onClick={(e) => {
                e.stopPropagation();
                // mousedown で既に選択処理済み。ドラッグ後の click では何もしない
            }}
            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(value); }}
            onMouseDown={(e) => {
                e.stopPropagation();
                onSelect();  // 単一セル選択 (selectionRange はここではクリアされるが mouseDown で再設定)
                onMouseDown?.(e);
            }}
            onMouseEnter={() => { onMouseEnter?.(); }}
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
    isSegEditing,
    segEditInitValue,
    onSegEditDone,
    isInRange,
    onRangeMouseDown,
    onRangeMouseEnter,
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
    /** 親から編集開始を制御 */
    isSegEditing?: boolean;
    segEditInitValue?: string;
    onSegEditDone?: () => void;
    isInRange?: boolean;
    onRangeMouseDown?: (e: React.MouseEvent) => void;
    onRangeMouseEnter?: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // 親から編集開始のシグナルを受け取る
    useEffect(() => {
        if (isSegEditing && !editing) {
            const canEdit = editable || isManual;
            if (canEdit) {
                if (segEditInitValue !== undefined && segEditInitValue !== "") {
                    // 直接入力: キー入力値をセット
                    setInputVal(segEditInitValue);
                } else if (isManual) {
                    setInputVal(value !== null ? String(value) : "");
                } else {
                    setInputVal("");
                }
                setEditing(true);
                setTimeout(() => inputRef.current?.focus(), 0);
            }
        }
    }, [isSegEditing]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = useCallback(async () => {
        setEditing(false);
        onSegEditDone?.(); // 親に編集完了を通知
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
    }, [inputVal, onSave, onSegEditDone, fiscalYear, quarter, segmentName, metric]);

    const handleCancel = useCallback(() => {
        setEditing(false);
        onSegEditDone?.();
    }, [onSegEditDone]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); handleSave(); }
        else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
        e.stopPropagation();
    }, [handleSave, handleCancel]);

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
        if (text && (text.includes("\t") || text.includes("\n"))) {
            e.preventDefault();
            setEditing(false);
            onSegEditDone?.();
            const tableDiv = (e.target as HTMLElement).closest(".pl-section");
            if (tableDiv) {
                const newEvent = new ClipboardEvent("paste", {
                    clipboardData: e.clipboardData as unknown as DataTransfer,
                    bubbles: true,
                    cancelable: true,
                });
                tableDiv.dispatchEvent(newEvent);
            }
        }
    }, [onSegEditDone]);

    const displayVal = value !== null ? formatMillions(value) : "–";
    const canEdit = editable || isManual;

    // クリック: アクティブ化 + 編集可能なら編集開始
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
            <td className="num-col seg-data-cell seg-cell-active" style={{ width, minWidth: width, maxWidth: width, overflow: "hidden" }}>
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
            className={`num-col seg-data-cell ${editable && !isManual ? "seg-editable" : ""} ${isManual ? "seg-manual-editable" : ""} ${saving ? "seg-saving" : ""} ${isSegActive ? "seg-cell-active" : ""} ${isInRange ? "cell-in-range" : ""}`}
            style={{ width, minWidth: width, maxWidth: width, overflow: "hidden" }}
            onClick={handleCellClick}
            onMouseDown={(e) => { onRangeMouseDown?.(e); }}
            onMouseEnter={() => { onRangeMouseEnter?.(); }}
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
