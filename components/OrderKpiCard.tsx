"use client";

import React, { useState } from "react";
import type { OrderKpiItem } from "@/types/order-kpi";
import {
    formatOrderKpiLabel,
    formatReviewStatus,
    isReviewableStatus,
    ORDER_KPI_DISPLAY_ORDER,
} from "@/types/order-kpi";
import { formatMillions } from "@/lib/format";

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
}

export default function OrderKpiCard({
    data,
    rejectedData,
    loading,
    onReviewAction,
    onRestoreAction,
}: OrderKpiCardProps) {
    const [actionLoading, setActionLoading] = useState<Record<number, boolean>>(
        {},
    );
    const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
    const [actionError, setActionError] = useState<string | null>(null);
    const [showRejected, setShowRejected] = useState(false);

    if (loading) {
        return (
            <section className="order-kpi-card">
                <h3 className="order-kpi-title">受注KPI</h3>
                <div className="order-kpi-loading">読み込み中...</div>
            </section>
        );
    }

    // 3KPIとも無い && 却下もない場合はカードを非表示
    if ((!data || data.length === 0) && (!rejectedData || rejectedData.length === 0)) {
        return null;
    }

    // canonical_kpi_name でルックアップ用マップを構築
    const kpiMap = new Map<string, OrderKpiItem>();
    for (const item of data) {
        kpiMap.set(item.canonical_kpi_name, item);
    }

    const filingDates = new Set(
        data.map((d) => d.filing_date).filter(Boolean),
    );
    const commonFilingDate =
        filingDates.size === 1 ? data[0]?.filing_date : null;
    const commonSource =
        data.length > 0
            ? `${data[0].source_system ?? "–"} / ${data[0].source_type ?? "–"}`
            : null;

    const handleReviewAction = async (
        id: number,
        nextStatus: "auto_accepted" | "rejected",
    ) => {
        if (!onReviewAction) return;
        setActionLoading((prev) => ({ ...prev, [id]: true }));
        setActionError(null);

        const note = reviewNotes[id]?.trim() || undefined;
        const result = await onReviewAction(id, nextStatus, note);

        setActionLoading((prev) => ({ ...prev, [id]: false }));
        if (result.success) {
            setReviewNotes((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
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

    const rejectedCount = rejectedData?.length ?? 0;

    return (
        <section className="order-kpi-card">
            <h3 className="order-kpi-title">受注KPI</h3>

            {actionError && (
                <div className="order-kpi-error">{actionError}</div>
            )}

            {/* Active KPIs */}
            {data.length > 0 && (
                <div className="order-kpi-table">
                    {ORDER_KPI_DISPLAY_ORDER.map((canonical) => {
                        const item = kpiMap.get(canonical);
                        if (!item) return null;

                        const { label: badgeLabel, className: badgeClass } =
                            formatReviewStatus(item.review_status);
                        const reviewable = isReviewableStatus(item.review_status);
                        const isLoading = actionLoading[item.id] ?? false;

                        return (
                            <div key={canonical} className="order-kpi-row">
                                <div className="order-kpi-label">
                                    {formatOrderKpiLabel(canonical)}
                                </div>
                                <div className="order-kpi-value">
                                    {formatMillions(item.normalized_value)}
                                </div>
                                <div className="order-kpi-unit">百万円</div>
                                <div className={`order-kpi-badge ${badgeClass}`}>
                                    {badgeLabel}
                                </div>
                                {reviewable && onReviewAction && (
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
                                {!commonFilingDate && item.filing_date && (
                                    <div className="order-kpi-date">{item.filing_date}</div>
                                )}
                                {reviewable && item.raw_label && (
                                    <div className="order-kpi-raw">原文: {item.raw_label}</div>
                                )}
                                {!reviewable && item.reviewed_at && (
                                    <div className="order-kpi-audit">
                                        {item.reviewed_by && <span>承認者: {item.reviewed_by}</span>}
                                        <span>
                                            承認日: {new Date(item.reviewed_at).toLocaleDateString("ja-JP")}
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
                                        <div className="order-kpi-badge badge-rejected">
                                            却下
                                        </div>
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
                                            <div className="order-kpi-raw">
                                                原文: {item.raw_label}
                                            </div>
                                        )}
                                        {item.reviewed_at && (
                                            <div className="order-kpi-audit">
                                                {item.reviewed_by && (
                                                    <span>却下者: {item.reviewed_by}</span>
                                                )}
                                                <span>
                                                    却下日: {new Date(item.reviewed_at).toLocaleDateString("ja-JP")}
                                                </span>
                                                {item.review_note && (
                                                    <span>備考: {item.review_note}</span>
                                                )}
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
