"use client";

import React, { useMemo, useState, useCallback, useRef } from "react";
import type { SegmentRecord } from "@/types/segment";
import type { SegmentCellOverride } from "@/types/segment-override";
import { formatMillions } from "@/lib/format";
import { buildOverrideKey } from "@/lib/segment-normalize";
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
        name: string;
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

    // Group segments by period/quarter
    const groups = useMemo<SegmentGroup[]>(() => {
        if (!data || data.length === 0) return [];

        const map = new Map<string, SegmentGroup>();

        for (const row of data) {
            const key = `${row.period}|${row.quarter}`;
            if (!map.has(key)) {
                map.set(key, {
                    period: row.period,
                    quarter: row.quarter,
                    fiscalYear: extractFiscalYear(row.period),
                    segments: [],
                });
            }
            map.get(key)!.segments.push({
                name: row.segment_name,
                sales: row.segment_sales,
                profit: row.segment_profit,
                profitRate: calcProfitRate(
                    row.segment_profit,
                    row.segment_sales,
                ),
                source: row.source,
                salesSource: row._salesSource,
                profitSource: row._profitSource,
            });
        }

        return Array.from(map.values()).sort((a, b) => {
            const periodCmp = b.period.localeCompare(a.period);
            if (periodCmp !== 0) return periodCmp;
            const qa = QUARTER_ORDER[a.quarter] ?? 9;
            const qb = QUARTER_ORDER[b.quarter] ?? 9;
            return qb - qa;
        });
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
                                    {group.segments.map((seg, idx) => (
                                        <SegmentRow
                                            key={`${seg.name}-${idx}`}
                                            seg={seg}
                                            group={group}
                                            editMode={editMode}
                                            overrideSet={overrideSet}
                                            onSaveOverride={onSaveOverride}
                                            onDeleteOverride={onDeleteOverride}
                                        />
                                    ))}
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
            <td className="segment-name-col">{seg.name}</td>
            <td className="num-col">
                <SegmentCell
                    value={seg.sales}
                    metric="sales"
                    metricSource={seg.salesSource}
                    segmentName={seg.name}
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
                    segmentName={seg.name}
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
