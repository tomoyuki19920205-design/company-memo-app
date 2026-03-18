"use client";

import React from "react";
import type { ValuationMetrics } from "@/types/market-data";

interface ValuationCardProps {
    valuation: ValuationMetrics | null;
    loading: boolean;
}

/** 時価総額を読みやすい形式に (80,123,000,000 → 8.01兆) */
function formatMarketCap(val: number | null): string {
    if (val === null || val === 0) return "—";
    const abs = Math.abs(val);
    if (abs >= 1e12) return `${(val / 1e12).toFixed(2)}兆`;
    if (abs >= 1e8) return `${(val / 1e8).toFixed(0)}億`;
    if (abs >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
    return val.toLocaleString();
}

function formatNumber(val: number | null, decimals = 2): string {
    if (val === null) return "—";
    return val.toFixed(decimals);
}

function formatPrice(val: number | null): string {
    if (val === null) return "—";
    return val.toLocaleString("ja-JP");
}

/** basis バッジ (予/実) */
function BasisBadge({ basis }: { basis: "forecast" | "actual" | null }) {
    if (!basis) return null;
    const label = basis === "forecast" ? "予" : "実";
    const cls = basis === "forecast" ? "basis-badge forecast" : "basis-badge actual";
    return <span className={cls}>{label}</span>;
}

export default function ValuationCard({ valuation, loading }: ValuationCardProps) {
    if (loading) {
        return (
            <div className="valuation-card">
                <h3 className="valuation-card-title">マーケット指標</h3>
                <div className="valuation-card-loading">読込中...</div>
            </div>
        );
    }

    // データなし or テーブル未存在
    if (!valuation || valuation.stock_price === null) {
        return (
            <div className="valuation-card">
                <h3 className="valuation-card-title">マーケット指標</h3>
                <div className="valuation-card-empty">データなし</div>
            </div>
        );
    }

    const items = [
        { label: "株価", value: formatPrice(valuation.stock_price), unit: "円" },
        { label: "時価総額", value: formatMarketCap(valuation.market_cap), unit: "" },
        {
            label: "PER",
            value: formatNumber(valuation.per),
            unit: "倍",
            badge: <BasisBadge basis={valuation.eps_basis} />,
        },
        {
            label: "PBR",
            value: formatNumber(valuation.pbr),
            unit: "倍",
        },
        {
            label: "配当利回り",
            value: formatNumber(valuation.div_yield),
            unit: "%",
            badge: <BasisBadge basis={valuation.dividend_basis} />,
        },
    ];

    return (
        <div className="valuation-card" id="valuation-card">
            <div className="valuation-card-header">
                <h3 className="valuation-card-title">マーケット指標</h3>
                {valuation.price_date && (
                    <span className="valuation-card-date">
                        基準日: {valuation.price_date}
                    </span>
                )}
            </div>
            <div className="valuation-card-grid">
                {items.map((item) => (
                    <div key={item.label} className="valuation-metric">
                        <div className="valuation-metric-label">
                            {item.label}
                            {"badge" in item && item.badge}
                        </div>
                        <div className="valuation-metric-value">
                            {item.value}
                            {item.unit && item.value !== "—" && (
                                <span className="valuation-metric-unit">{item.unit}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
