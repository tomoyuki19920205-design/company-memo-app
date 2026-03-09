"use client";

import React from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

interface TickerHeaderProps {
    tickerInput: string;
    onTickerChange: (value: string) => void;
    onLoad: () => void;
    loading: boolean;
    activeTicker: string;
    companyName: string | null;
    errorMsg: string;
    userEmail?: string | null;
    fontTheme: string;
    onFontThemeChange: (theme: string) => void;
}

export default function TickerHeader({
    tickerInput,
    onTickerChange,
    onLoad,
    loading,
    activeTicker,
    companyName,
    errorMsg,
    userEmail,
    fontTheme,
    onFontThemeChange,
}: TickerHeaderProps) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            onLoad();
        }
    };

    const handleLogout = async () => {
        const supabase = createSupabaseBrowser();
        await supabase.auth.signOut();
        window.location.href = "/login";
    };

    return (
        <div className="viewer-header">
            <div className="viewer-header-top">
                <h1 className="viewer-title">Company Viewer</h1>
                <div className="ticker-input-group">
                    <label className="ticker-label" htmlFor="ticker-input">
                        企業コード
                    </label>
                    <input
                        id="ticker-input"
                        className="ticker-input"
                        type="text"
                        value={tickerInput}
                        onChange={(e) => onTickerChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="例: 4062"
                        autoFocus
                    />
                    <button
                        className="btn btn-load"
                        onClick={onLoad}
                        disabled={loading}
                    >
                        {loading ? "読込中..." : "読込"}
                    </button>
                </div>
                {activeTicker && (
                    <div className="ticker-info">
                        <span className="ticker-badge">{activeTicker}</span>
                        {companyName && (
                            <span className="company-name">{companyName}</span>
                        )}
                    </div>
                )}
                {/* フォント切替 */}
                <div className="font-selector">
                    <span className="font-selector-label">🔤</span>
                    <select
                        value={fontTheme}
                        onChange={(e) => onFontThemeChange(e.target.value)}
                    >
                        <option value="default">Default</option>
                        <option value="sans">Sans</option>
                        <option value="serif">Serif</option>
                        <option value="mono">Mono</option>
                    </select>
                </div>
                {/* ユーザー情報・ログアウト */}
                <div className="user-info">
                    {userEmail && (
                        <>
                            <span className="user-email" title={userEmail}>
                                👤 {userEmail}
                            </span>
                            <span className="shared-badge">共有</span>
                            <button
                                className="btn btn-logout"
                                onClick={handleLogout}
                            >
                                ログアウト
                            </button>
                        </>
                    )}
                </div>
            </div>
            {errorMsg && (
                <div className="error-bar">
                    ❌ {errorMsg}
                </div>
            )}
        </div>
    );
}
