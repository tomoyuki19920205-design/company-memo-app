"use client";

import React, { useMemo, useState, useCallback, useRef } from "react";
import type { SegmentRecord } from "@/types/segment";
import type { SegmentCellOverride } from "@/types/segment-override";
import { formatMillions } from "@/lib/format";
import { buildOverrideKey, normalizeSegmentDisplayKey, pickSegmentDisplayName } from "@/lib/segment-normalize";
import { extractFiscalYear } from "@/lib/viewer-api";

// ============================================================
// Types
// ============================================================

interface SegmentTableProps {
    data: SegmentRecord[];
    loading: boolean;
    overrides: SegmentCellOverride[];
    onSaveOverride?: (
        fiscalYear: number,
        quarter: string,
        segmentName: string,
        metric: string,
        value: number,
    ) => Promise<void>;
    onDeleteOverride?: (
        fiscalYear: number,
        quarter: string,
        segmentName: string,
        metric: string,
    ) => Promise<void>;
}

const QUARTER_ORDER: Record<string, number> = {
    "1Q": 0,
    "2Q": 1,
    "3Q": 2,
    "4Q": 3,
    "FY": 4,
};

interface SegmentGroup {
    period: string;
    quarter: string;
    fiscalYear: number;
    segments: {
        display_key: string;
        display_name: string;   // 日本語優先の表示名
        raw_name: string;       // override照合用の元segment_name
        sales: number | null;
        profit: number | null;
        profitRate: number | null;
        source?: string;
        salesSource?: string;
        profitSource?: string;
    }[];
}

// ============================================================
// Helpers
// ============================================================

function calcProfitRate(
    profit: number | null,
    sales: number | null,
): number | null {
    if (profit === null || sales === null || sales === 0) return null;
    return (profit / sales) * 100;
}

function isEditableQuarter(quarter: string): boolean {
    return quarter === "1Q" || quarter === "3Q";
}


// ============================================================
// Component
// ============================================================

export default function SegmentTable({
    data,
    loading,
    overrides,
    onSaveOverride,
    onDeleteOverride,
}: SegmentTableProps) {
    const [editMode, setEditMode] = useState(false);

    // Build override lookup for checking existing overrides
    const overrideSet = useMemo(() => {
        const set = new Set<string>();
        for (const ov of overrides) {
            if (ov.is_deleted) continue;
            set.add(
                buildOverrideKey(
                    ov.fiscal_year,
                    ov.quarter,
                    ov.segment_name,
                    ov.metric,
                ),
            );
        }
        return set;
    }, [overrides]);

    // Group segments by period/quarter, then merge by display_key
    const groups = useMemo<SegmentGroup[]>(() => {
        if (!data || data.length === 0) return [];

        // period|quarter → { meta, segMap: display_key → { names, latest row } }
        const map = new Map<string, {
            period: string;
            quarter: string;
            fiscalYear: number;
            segMap: Map<string, {
                names: string[];
                sales: number | null;
                profit: number | null;
                source?: string;
                salesSource?: string;
                profitSource?: string;
            }>;
        }>();

        for (const row of data) {
            const groupKey = `${row.period}|${row.quarter}`;
            if (!map.has(groupKey)) {
                map.set(groupKey, {
                    period: row.period,
                    quarter: row.quarter,
                    fiscalYear: extractFiscalYear(row.period),
                    segMap: new Map(),
                });
            }
            const group = map.get(groupKey)!;

            // 表示統合キーでグループ化
            const dk = normalizeSegmentDisplayKey(row.segment_name) || row.segment_name;
            // [DEBUG] キー確認 — 英日が同一 dk になるか目視確認用
            console.log(`[seg-group] ${groupKey} | dk="${dk}" | raw="${row.segment_name}"`);
            if (!group.segMap.has(dk)) {
                group.segMap.set(dk, {
                    names: [row.segment_name],
                    sales: row.segment_sales,
                    profit: row.segment_profit,
                    source: row.source,
                    salesSource: row._salesSource,
                    profitSource: row._profitSource,
                });
            } else {
                // 同一display_key: 名前候補追加 + 後勝ちで値更新
                const existing = group.segMap.get(dk)!;
                if (!existing.names.includes(row.segment_name)) {
                    existing.names.push(row.segment_name);
                }
                // null でない値で上書き（後勝ち）
                if (row.segment_sales !== null) existing.sales = row.segment_sales;
                if (row.segment_profit !== null) existing.profit = row.segment_profit;
                if (row.source) existing.source = row.source;
                if (row._salesSource) existing.salesSource = row._salesSource;
                if (row._profitSource) existing.profitSource = row._profitSource;
            }
        }

        return Array.from(map.values())
            .sort((a, b) => {
                const periodCmp = b.period.localeCompare(a.period);
                if (periodCmp !== 0) return periodCmp;
                const qa = QUARTER_ORDER[a.quarter] ?? 9;
                const qb = QUARTER_ORDER[b.quarter] ?? 9;
                return qb - qa;
            })
            .map((g) => ({
                period: g.period,
                quarter: g.quarter,
                fiscalYear: g.fiscalYear,
                segments: Array.from(g.segMap.entries()).map(([dk, seg]) => ({
                    display_key: dk,
                    display_name: pickSegmentDisplayName(seg.names),
                    raw_name: seg.names[0], // override照合は元名を使う
                    sales: seg.sales,
                    profit: seg.profit,
                    profitRate: calcProfitRate(seg.profit, seg.sales),
                    source: seg.source,
                    salesSource: seg.salesSource,
                    profitSource: seg.profitSource,
                })),
            }));
    }, [data]);

    if (loading) {
        return (
            <div className="data-section segment-section">
                <h2 className="section-title">📊 セグメント業績</h2>
                <div className="loading-message">読込中...</div>
            </div>
        );
    }

    return (
        <div className="data-section segment-section">
            <div className="segment-header-row">
                <h2 className="section-title">📊 セグメント業績</h2>
                {groups.length > 0 && (
                    <button
                        className={`segment-edit-toggle ${editMode ? "active" : ""}`}
                        onClick={() => setEditMode((v) => !v)}
                        title="1Q/3Q 欠損セルの手入力モード"
                    >
                        {editMode ? "✏️ 入力モード ON" : "✏️ 1Q/3Q 入力"}
                    </button>
                )}
            </div>
            {groups.length === 0 ? (
                <div className="no-data-message">セグメントデータなし</div>
            ) : (
                <div className="segment-scroll-area">
                    {groups.map((group) => (
                        <div
                            key={`${group.period}-${group.quarter}`}
                            className="segment-group"
                        >
                            <div className="segment-group-header">
                                <span className="segment-period">
                                    {group.period}
                                </span>
                                <span className="segment-quarter">
                                    {group.quarter}
                                </span>
                                {editMode &&
                                    isEditableQuarter(group.quarter) && (
                                        <span className="segment-edit-hint">
                                            空欄セルを入力可能
                                        </span>
                                    )}
                            </div>
                            <table className="segment-table">
                                <thead>
                                    <tr>
                                        <th>セグメント名</th>
                                        <th className="num-col">売上</th>
                                        <th className="num-col">利益</th>
                                        <th className="num-col">利益率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        // 安全弁: display_key 単位で重複排除
                                        // groups useMemo で既に dedupe 済みだが、
                                        // 正規化ミスが残った場合のフォールバック
                                        const seenDk = new Set<string>();
                                        return group.segments
                                            .filter((seg) => {
                                                if (seenDk.has(seg.display_key)) return false;
                                                seenDk.add(seg.display_key);
                                                return true;
                                            })
                                            .map((seg) => (
                                                <SegmentRow
                                                    key={seg.display_key}
                                                    seg={seg}
                                                    group={group}
                                                    editMode={editMode}
                                                    overrideSet={overrideSet}
                                                    onSaveOverride={onSaveOverride}
                                                    onDeleteOverride={onDeleteOverride}
                                                />
                                            ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// SegmentRow — Individual row with editable cells
// ============================================================

interface SegmentRowProps {
    seg: SegmentGroup["segments"][0];
    group: SegmentGroup;
    editMode: boolean;
    overrideSet: Set<string>;
    onSaveOverride?: SegmentTableProps["onSaveOverride"];
    onDeleteOverride?: SegmentTableProps["onDeleteOverride"];
}

function SegmentRow({
    seg,
    group,
    editMode,
    overrideSet,
    onSaveOverride,
    onDeleteOverride,
}: SegmentRowProps) {
    const canEdit =
        editMode && isEditableQuarter(group.quarter) && !!onSaveOverride;

    return (
        <tr>
            <td className="segment-name-col">{seg.display_name}</td>
            <td className="num-col">
                <SegmentCell
                    value={seg.sales}
                    metric="sales"
                    metricSource={seg.salesSource}
                    segmentName={seg.raw_name}
                    fiscalYear={group.fiscalYear}
                    quarter={group.quarter}
                    canEdit={canEdit}
                    overrideSet={overrideSet}
                    onSaveOverride={onSaveOverride}
                    onDeleteOverride={onDeleteOverride}
                />
            </td>
            <td className="num-col">
                <SegmentCell
                    value={seg.profit}
                    metric="operating_profit"
                    metricSource={seg.profitSource}
                    segmentName={seg.raw_name}
                    fiscalYear={group.fiscalYear}
                    quarter={group.quarter}
                    canEdit={canEdit}
                    overrideSet={overrideSet}
                    onSaveOverride={onSaveOverride}
                    onDeleteOverride={onDeleteOverride}
                />
            </td>
            <td className="num-col">
                {seg.profitRate !== null
                    ? `${seg.profitRate.toFixed(1)}%`
                    : "–"}
            </td>
        </tr>
    );
}

// ============================================================
// SegmentCell — Individual editable cell
// ============================================================

interface SegmentCellProps {
    value: number | null;
    metric: string;
    metricSource?: string;
    segmentName: string;
    fiscalYear: number;
    quarter: string;
    canEdit: boolean;
    overrideSet: Set<string>;
    onSaveOverride?: SegmentTableProps["onSaveOverride"];
    onDeleteOverride?: SegmentTableProps["onDeleteOverride"];
}

function SegmentCell({
    value,
    metric,
    metricSource,
    segmentName,
    fiscalYear,
    quarter,
    canEdit,
    overrideSet,
    onSaveOverride,
    onDeleteOverride,
}: SegmentCellProps) {
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isManual = metricSource === "manual";
    const overrideKey = buildOverrideKey(
        fiscalYear,
        quarter,
        segmentName,
        metric,
    );
    const hasOverride = overrideSet.has(overrideKey);

    // Only null cells on 1Q/3Q are editable (unless it's a manual override)
    const isEditable = canEdit && (value === null || isManual);

    const handleStartEdit = useCallback(() => {
        if (!isEditable) return;
        setInputValue(value !== null ? String(value) : "");
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [isEditable, value]);

    const handleSave = useCallback(async () => {
        setEditing(false);
        const trimmed = inputValue.trim();
        if (!trimmed || !onSaveOverride) return;

        const numVal = Number(trimmed);
        if (isNaN(numVal)) return;

        setSaving(true);
        try {
            await onSaveOverride(
                fiscalYear,
                quarter,
                segmentName,
                metric,
                numVal,
            );
        } catch (err) {
            console.error("Override save failed:", err);
        } finally {
            setSaving(false);
        }
    }, [
        inputValue,
        onSaveOverride,
        fiscalYear,
        quarter,
        segmentName,
        metric,
    ]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                handleSave();
            } else if (e.key === "Escape") {
                setEditing(false);
            }
        },
        [handleSave],
    );

    const handleDeleteOverride = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!onDeleteOverride) return;
            if (!confirm("この手入力値を削除しますか？")) return;

            setSaving(true);
            try {
                await onDeleteOverride(
                    fiscalYear,
                    quarter,
                    segmentName,
                    metric,
                );
            } catch (err) {
                console.error("Override delete failed:", err);
            } finally {
                setSaving(false);
            }
        },
        [onDeleteOverride, fiscalYear, quarter, segmentName, metric],
    );

    // Editing input mode
    if (editing) {
        return (
            <div className="segment-cell-edit">
                <input
                    ref={inputRef}
                    type="number"
                    className="segment-cell-input"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                />
            </div>
        );
    }

    // Display mode
    const displayValue =
        value !== null ? formatMillions(value) : "–";

    return (
        <div
            className={`segment-cell-display ${isEditable ? "editable" : ""} ${saving ? "saving" : ""}`}
            onClick={isEditable ? handleStartEdit : undefined}
            title={
                isEditable
                    ? "クリックして入力"
                    : isManual
                      ? "手入力値"
                      : undefined
            }
        >
            <span className={value === null && isEditable ? "segment-cell-placeholder" : ""}>
                {value === null && isEditable ? "入力" : displayValue}
            </span>
            {hasOverride && isManual && (
                <span
                    className="segment-manual-badge"
                    onClick={handleDeleteOverride}
                    title="手入力値 — クリックで削除"
                >
                    M
                </span>
            )}
        </div>
    );
}
