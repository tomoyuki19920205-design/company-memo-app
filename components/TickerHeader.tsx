"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { searchCompanies, type SearchCandidate } from "@/lib/company-search";

interface TickerHeaderProps {
    tickerInput: string;
    onTickerChange: (value: string) => void;
    onLoad: (ticker?: string) => void;
    onSelectCandidate: (ticker: string) => void;
    loading: boolean;
    activeTicker: string;
    companyName: string | null;
    errorMsg: string;
    userEmail?: string | null;
    fontTheme: string;
    onFontThemeChange: (theme: string) => void;
    candidates: SearchCandidate[];
    onRequestMaster: () => void;
}

export default function TickerHeader({
    tickerInput,
    onTickerChange,
    onLoad,
    onSelectCandidate,
    loading,
    activeTicker,
    companyName,
    errorMsg,
    userEmail,
    fontTheme,
    onFontThemeChange,
    candidates,
    onRequestMaster,
}: TickerHeaderProps) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const composingRef = useRef(false);

    // 候補リスト（入力に応じてスコアリング）
    const results = useMemo(
        () => searchCompanies(tickerInput, candidates, 10),
        [tickerInput, candidates],
    );

    // ---- 候補選択 ----
    const selectCandidate = useCallback(
        (ticker: string) => {
            setShowDropdown(false);
            setHighlightIdx(-1);
            onSelectCandidate(ticker);
        },
        [onSelectCandidate],
    );

    // ---- 入力変更 ----
    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            onTickerChange(v);
            setHighlightIdx(-1);
            setShowDropdown(v.trim().length > 0);
            // マスタ未取得なら lazy load をリクエスト
            onRequestMaster();
        },
        [onTickerChange, onRequestMaster],
    );

    // ---- キーボード ----
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            // IME変換中は候補操作を無効化
            if (e.nativeEvent.isComposing || composingRef.current) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (results.length > 0) {
                    setShowDropdown(true);
                    setHighlightIdx((prev) =>
                        prev < results.length - 1 ? prev + 1 : 0,
                    );
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (results.length > 0) {
                    setShowDropdown(true);
                    setHighlightIdx((prev) =>
                        prev > 0 ? prev - 1 : results.length - 1,
                    );
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (showDropdown && results.length > 0) {
                    // 候補あり: ハイライトがあればそれ、なければ最上位候補を選択
                    const idx = highlightIdx >= 0 ? highlightIdx : 0;
                    selectCandidate(results[idx].ticker);
                } else {
                    // 候補なし: 既存の読込挙動にフォールバック
                    onLoad();
                }
            } else if (e.key === "Escape") {
                setShowDropdown(false);
                setHighlightIdx(-1);
            }
        },
        [results, showDropdown, highlightIdx, selectCandidate, onLoad],
    );

    // ---- IME ----
    const handleCompositionStart = useCallback(() => {
        composingRef.current = true;
    }, []);
    const handleCompositionEnd = useCallback(() => {
        composingRef.current = false;
    }, []);

    // ---- Focus / Blur ----
    const handleFocus = useCallback(() => {
        if (blurTimerRef.current) {
            clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
        }
        // マスタ未取得なら lazy load をリクエスト
        onRequestMaster();
        if (tickerInput.trim().length > 0) {
            setShowDropdown(true);
        }
    }, [tickerInput, onRequestMaster]);

    const handleBlur = useCallback(() => {
        // onMouseDown より後に発火するため、遅延して閉じる
        blurTimerRef.current = setTimeout(() => {
            setShowDropdown(false);
            setHighlightIdx(-1);
        }, 150);
    }, []);

    // ---- マウス選択 (onMouseDown で blur より先に処理) ----
    const handleItemMouseDown = useCallback(
        (e: React.MouseEvent, ticker: string) => {
            e.preventDefault(); // blur を防ぐ
            selectCandidate(ticker);
        },
        [selectCandidate],
    );

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
                        企業検索
                    </label>
                    <div className="search-wrapper">
                        <input
                            id="ticker-input"
                            className="ticker-input search-input"
                            type="text"
                            value={tickerInput}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            onCompositionStart={handleCompositionStart}
                            onCompositionEnd={handleCompositionEnd}
                            placeholder="例: 7203 / トヨタ"
                            autoComplete="off"
                            autoFocus
                        />
                        {showDropdown && results.length > 0 && (
                            <ul className="search-dropdown">
                                {results.map((c, idx) => (
                                    <li
                                        key={c.ticker}
                                        className={`search-dropdown-item${idx === highlightIdx ? " search-dropdown-item-active" : ""}`}
                                        onMouseDown={(e) =>
                                            handleItemMouseDown(e, c.ticker)
                                        }
                                        onMouseEnter={() =>
                                            setHighlightIdx(idx)
                                        }
                                    >
                                        <span className="search-item-ticker">
                                            {c.ticker}
                                        </span>
                                        <span className="search-item-name">
                                            {c.company_name}
                                        </span>
                                        {c.company_name_en && (
                                            <span className="search-item-name-en">
                                                {c.company_name_en}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <button
                        className="btn btn-load"
                        onClick={() => onLoad()}
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
