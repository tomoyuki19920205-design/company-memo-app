"use client";

import React, { useState, useMemo } from "react";
import type { OrderKpiItem, ComparisonData } from "@/types/order-kpi";
import {
    formatOrderKpiLabel,
    formatReviewStatus,
    isReviewableStatus,
    ORDER_KPI_DISPLAY_ORDER,
} from "@/types/order-kpi";
import { formatMillions } from "@/lib/format";

/**
 * comparison_json → 表示可能な ComparisonData | null
 * auto_accept(okステータス) のみ返す。needs_review/reject は null。
 */
function parseComparison(item: OrderKpiItem): ComparisonData | null {
    if (!item.comparison_json) return null;
    try {
        const parsed: ComparisonData =
            typeof item.comparison_json === "string"
                ? JSON.parse(item.comparison_json)
                : item.comparison_json;
        // ok + needs_review を表示、reject のみ非表示
        if (parsed.review_status === "reject") return null;
        // 最低限の値が必要 (0 は有効値なので != null で判定)
        if (parsed.rate_percent == null && parsed.index_percent == null && parsed.change_value == null) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * ComparisonData → 表示テキスト
 * 例: "前年同期末比 +18.3%", "前年同期比 112.3", "前期末比 +150億円"
 */
function formatComparison(c: ComparisonData): string {
    const basisLabel = c.basis_raw || formatBasisLabel(c.basis);
    let text = "";

    if (c.expression_type === "rate" && c.rate_percent != null) {
        const sign = c.rate_percent > 0 ? "+" : "";
        text = `${basisLabel} ${sign}${c.rate_percent}%`;
    } else if (c.expression_type === "index" && c.index_percent != null) {
        text = `${basisLabel} ${c.index_percent}%`;
    } else if (c.expression_type === "change_value" && c.change_value != null) {
        const sign = c.change_value > 0 ? "+" : "";
        const unit = c.change_unit || "百万円";
        text = `${basisLabel} ${sign}${c.change_value.toLocaleString()}${unit}`;
    }

    if (text && c.review_status === "needs_review") {
        text += " (要確認)";
    }

    return text;
}

function formatBasisLabel(basis: string): string {
    switch (basis) {
        case "yoy": return "前年同期比";
        case "yoy_end": return "前年同期末比";
        case "prev_period_end": return "前期末比";
        default: return basis;
    }
}

interface OrderKpiCardProps {
    data: OrderKpiItem[];
    rejectedData: OrderKpiItem[];
    loading: boolean;
    onReviewAction?: (
        id: number,
        nextStatus: "auto_accepted" | "rejected",
        reviewNote?: string,
    ) => Promise<{ success: boolean; error?: string }>;
    onRestoreAction?: (
        id: number,
    ) => Promise<{ success: boolean; error?: string }>;
    onEditValue?: (
        id: number,
        newValue: number,
        reviewNote?: string,
    ) => Promise<{ success: boolean; error?: string }>;
}

export default function OrderKpiCard({
    data,
    rejectedData,
    loading,
    onReviewAction,
    onRestoreAction,
    onEditValue,
}: OrderKpiCardProps) {
    const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
    const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
    const [actionError, setActionError] = useState<string | null>(null);
    const [showRejected, setShowRejected] = useState(false);
    // 編集モード: editingId=編集中のレコードid, editValue=入力中の値
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState("");
    const [editNote, setEditNote] = useState("");

    if (loading) {
        return (
            <section className="order-kpi-card">
                <h3 className="order-kpi-title">受注KPI</h3>
                <div className="order-kpi-loading">読み込み中...</div>
            </section>
        );
    }

    if ((!data || data.length === 0) && (!rejectedData || rejectedData.length === 0)) {
        return null;
    }

    const kpiMap = new Map<string, OrderKpiItem>();
    for (const item of data) {
        kpiMap.set(item.canonical_kpi_name, item);
    }

    const filingDates = new Set(data.map((d) => d.filing_date).filter(Boolean));
    const commonFilingDate = filingDates.size === 1 ? data[0]?.filing_date : null;
    const commonSource =
        data.length > 0
            ? `${data[0].source_system ?? "–"} / ${data[0].source_type ?? "–"}`
            : null;

    const handleReviewAction = async (id: number, nextStatus: "auto_accepted" | "rejected") => {
        if (!onReviewAction) return;
        setActionLoading((prev) => ({ ...prev, [id]: true }));
        setActionError(null);
        const note = reviewNotes[id]?.trim() || undefined;
        const result = await onReviewAction(id, nextStatus, note);
        setActionLoading((prev) => ({ ...prev, [id]: false }));
        if (result.success) {
            setReviewNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
        } else if (result.error) {
            setActionError(result.error);
            setTimeout(() => setActionError(null), 5000);
        }
    };

    const handleRestore = async (id: number) => {
        if (!onRestoreAction) return;
        setActionLoading((prev) => ({ ...prev, [id]: true }));
        setActionError(null);
        const result = await onRestoreAction(id);
        setActionLoading((prev) => ({ ...prev, [id]: false }));
        if (!result.success && result.error) {
            setActionError(result.error);
            setTimeout(() => setActionError(null), 5000);
        }
    };

    const startEdit = (item: OrderKpiItem) => {
        setEditingId(item.id);
        setEditValue(item.normalized_value !== null ? String(item.normalized_value) : "");
        setEditNote("");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue("");
        setEditNote("");
    };

    const handleSaveEdit = async () => {
        if (editingId === null || !onEditValue) return;
        const parsed = parseFloat(editValue.replace(/,/g, ""));
        if (isNaN(parsed)) {
            setActionError("数値を入力してください");
            setTimeout(() => setActionError(null), 3000);
            return;
        }
        setActionLoading((prev) => ({ ...prev, [editingId]: true }));
        setActionError(null);
        const result = await onEditValue(editingId, parsed, editNote.trim() || undefined);
        setActionLoading((prev) => ({ ...prev, [editingId]: false }));
        if (result.success) {
            cancelEdit();
        } else if (result.error) {
            setActionError(result.error);
            setTimeout(() => setActionError(null), 5000);
        }
    };

    const rejectedCount = rejectedData?.length ?? 0;

    return (
        <section className="order-kpi-card">
            <h3 className="order-kpi-title">受注KPI</h3>

            {actionError && <div className="order-kpi-error">{actionError}</div>}

            {data.length > 0 && (
                <div className="order-kpi-table">
                    {ORDER_KPI_DISPLAY_ORDER.map((canonical) => {
                        const item = kpiMap.get(canonical);
                        if (!item) return null;

                        const { label: badgeLabel, className: badgeClass } =
                            formatReviewStatus(item.review_status);
                        const reviewable = isReviewableStatus(item.review_status);
                        const isLoading = actionLoading[item.id] ?? false;
                        const isEditing = editingId === item.id;

                        return (
                            <div key={canonical} className="order-kpi-row">
                                <div className="order-kpi-label">
                                    {formatOrderKpiLabel(canonical)}
                                </div>

                                {/* 値セル: 編集モード or 表示モード */}
                                {isEditing ? (
                                    <div className="order-kpi-edit-area">
                                        <input
                                            type="text"
                                            className="order-kpi-edit-input"
                                            value={editValue}
                                            autoFocus
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }
                                                if (e.key === "Escape") cancelEdit();
                                            }}
                                        />
                                        <input
                                            type="text"
                                            className="order-kpi-note-input"
                                            placeholder="修正理由（任意）"
                                            value={editNote}
                                            onChange={(e) => setEditNote(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }
                                                if (e.key === "Escape") cancelEdit();
                                            }}
                                        />
                                        <button
                                            className="order-kpi-btn order-kpi-btn-accept"
                                            disabled={isLoading}
                                            onClick={handleSaveEdit}
                                        >
                                            {isLoading ? "..." : "保存"}
                                        </button>
                                        <button
                                            className="order-kpi-btn order-kpi-btn-cancel"
                                            onClick={cancelEdit}
                                        >
                                            取消
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div
                                            className={`order-kpi-value ${onEditValue ? "order-kpi-value-editable" : ""}`}
                                            onClick={() => onEditValue && startEdit(item)}
                                            title={onEditValue ? "クリックで修正" : undefined}
                                        >
                                            {formatMillions(item.normalized_value)}
                                        </div>
                                        <div className="order-kpi-unit">百万円</div>
                                        <div className={`order-kpi-badge ${badgeClass}`}>
                                            {badgeLabel}
                                        </div>
                                        {(() => {
                                            const comp = parseComparison(item);
                                            if (!comp) return null;
                                            const text = formatComparison(comp);
                                            if (!text) return null;
                                            const dirClass =
                                                comp.direction === "increase"
                                                    ? "order-kpi-comp-up"
                                                    : comp.direction === "decrease"
                                                      ? "order-kpi-comp-down"
                                                      : "";
                                            const isReview = comp.review_status === "needs_review";
                                            const reviewClass = isReview ? "order-kpi-comp-review" : "";
                                            return (
                                                <div
                                                    className={`order-kpi-comparison ${dirClass} ${reviewClass}`}
                                                    title={isReview ? "自動抽出候補。文脈からの確認を推奨します" : undefined}
                                                >
                                                    {text}
                                                </div>
                                            );
                                        })()}
                                    </>
                                )}

                                {/* Review buttons */}
                                {!isEditing && reviewable && onReviewAction && (
                                    <div className="order-kpi-review-area">
                                        <input
                                            type="text"
                                            className="order-kpi-note-input"
                                            placeholder="備考（任意）"
                                            value={reviewNotes[item.id] ?? ""}
                                            disabled={isLoading}
                                            onChange={(e) =>
                                                setReviewNotes((prev) => ({
                                                    ...prev,
                                                    [item.id]: e.target.value,
                                                }))
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleReviewAction(item.id, "auto_accepted");
                                                }
                                            }}
                                        />
                                        <div className="order-kpi-actions">
                                            <button
                                                className="order-kpi-btn order-kpi-btn-accept"
                                                disabled={isLoading}
                                                onClick={() => handleReviewAction(item.id, "auto_accepted")}
                                            >
                                                {isLoading ? "..." : "承認"}
                                            </button>
                                            <button
                                                className="order-kpi-btn order-kpi-btn-reject"
                                                disabled={isLoading}
                                                onClick={() => handleReviewAction(item.id, "rejected")}
                                            >
                                                {isLoading ? "..." : "却下"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {!isEditing && !commonFilingDate && item.filing_date && (
                                    <div className="order-kpi-date">{item.filing_date}</div>
                                )}
                                {!isEditing && reviewable && item.raw_label && (
                                    <div className="order-kpi-raw">原文: {item.raw_label}</div>
                                )}
                                {!isEditing && !reviewable && item.reviewed_at && (
                                    <div className="order-kpi-audit">
                                        {item.reviewed_by && <span>承認者: {item.reviewed_by}</span>}
                                        <span>
                                            {item.review_status === "manual_corrected" ? "修正日" : "承認日"}:{" "}
                                            {new Date(item.reviewed_at).toLocaleDateString("ja-JP")}
                                        </span>
                                        {item.review_note && <span>備考: {item.review_note}</span>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 共通メタ情報 */}
            {data.length > 0 && (
                <div className="order-kpi-meta">
                    {commonFilingDate && (
                        <span className="order-kpi-meta-item">提出日: {commonFilingDate}</span>
                    )}
                    {commonSource && (
                        <span className="order-kpi-meta-item">ソース: {commonSource}</span>
                    )}
                    {commonFilingDate && data[0]?.source_type === "pdf" && (
                        <a
                            className="order-kpi-pdf-link"
                            href={`/api/pdf?ticker=${data[0].ticker}&filing_date=${commonFilingDate}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            📄 原文PDF
                        </a>
                    )}
                </div>
            )}

            {/* 却下一覧トグル */}
            {rejectedCount > 0 && (
                <div className="order-kpi-rejected-section">
                    <button
                        className="order-kpi-rejected-toggle"
                        onClick={() => setShowRejected((prev) => !prev)}
                    >
                        {showRejected ? "▼" : "▶"} 却下済み ({rejectedCount}件)
                    </button>
                    {showRejected && (
                        <div className="order-kpi-rejected-list">
                            {rejectedData.map((item) => {
                                const isLoading = actionLoading[item.id] ?? false;
                                return (
                                    <div key={item.id} className="order-kpi-rejected-row">
                                        <div className="order-kpi-label">
                                            {formatOrderKpiLabel(item.canonical_kpi_name)}
                                        </div>
                                        <div className="order-kpi-value order-kpi-value-rejected">
                                            {formatMillions(item.normalized_value)}
                                        </div>
                                        <div className="order-kpi-unit">百万円</div>
                                        <div className="order-kpi-badge badge-rejected">却下</div>
                                        {onRestoreAction && (
                                            <button
                                                className="order-kpi-btn order-kpi-btn-restore"
                                                disabled={isLoading}
                                                onClick={() => handleRestore(item.id)}
                                            >
                                                {isLoading ? "..." : "復活"}
                                            </button>
                                        )}
                                        {item.raw_label && (
                                            <div className="order-kpi-raw">原文: {item.raw_label}</div>
                                        )}
                                        {item.reviewed_at && (
                                            <div className="order-kpi-audit">
                                                {item.reviewed_by && <span>却下者: {item.reviewed_by}</span>}
                                                <span>
                                                    却下日: {new Date(item.reviewed_at).toLocaleDateString("ja-JP")}
                                                </span>
                                                {item.review_note && <span>備考: {item.review_note}</span>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
