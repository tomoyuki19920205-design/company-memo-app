"use client";

import React, { useState, useCallback, useEffect } from "react";
import MemoGrid from "@/components/MemoGrid";
import TickerHeader from "@/components/TickerHeader";
import FinancialsTable from "@/components/FinancialsTable";
import ForecastTable from "@/components/ForecastTable";
import MonthlyTable from "@/components/MonthlyTable";
import KpiTable from "@/components/KpiTable";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import {
    loadGridMemo,
    saveGridMemo,
    loadAllGridMemos,
    createEmptyGrid,
    normalizeTicker,
    type GridData,
    type GridMemoRecord,
} from "@/lib/memo-api";
import {
    loadCompanyInfo,
    loadFinancials,
    loadForecastRevision,
    loadMonthlyData,
    loadKpiData,
    type CompanyInfo,
} from "@/lib/viewer-api";
import type { FinancialRecord } from "@/types/financial";
import type { ForecastRevision } from "@/types/forecast";
import type { MonthlyRecord } from "@/types/monthly";
import type { KpiRecord } from "@/types/kpi";
import type { User } from "@supabase/supabase-js";

type AppStatus =
    | "idle"
    | "loading"
    | "loaded"
    | "saving"
    | "saved"
    | "error";

// "period|quarter" → GridData
type MemoMapType = { [key: string]: GridData };

function buildMemoMap(memos: Map<string, GridMemoRecord>): MemoMapType {
    const map: MemoMapType = {};
    memos.forEach((record, key) => {
        map[key] = record.grid_json;
    });
    return map;
}

export default function ViewerPage() {
    // --- 認証状態 ---
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    // --- ticker ---
    const [tickerInput, setTickerInput] = useState("");
    const [activeTicker, setActiveTicker] = useState("");

    // --- 会社情報 ---
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    // --- メモ (period/quarter 単位) ---
    const [gridData, setGridData] = useState<GridData>(createEmptyGrid());
    const [dirty, setDirty] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [updatedBy, setUpdatedBy] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<string>("");
    const [selectedQuarter, setSelectedQuarter] = useState<string>("");
    const [focusCell, setFocusCell] = useState<[number, number]>([0, 0]);
    const [memoLoading, setMemoLoading] = useState(false);

    // --- PL一覧用メモMap ---
    const [memoMap, setMemoMap] = useState<MemoMapType>({});

    // --- データ ---
    const [financials, setFinancials] = useState<FinancialRecord[]>([]);
    const [forecasts, setForecasts] = useState<ForecastRevision[]>([]);
    const [monthly, setMonthly] = useState<MonthlyRecord[]>([]);
    const [kpi, setKpi] = useState<KpiRecord[]>([]);

    // --- ステータス ---
    const [status, setStatus] = useState<AppStatus>("idle");
    const [dataLoading, setDataLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // --- 認証チェック ---
    useEffect(() => {
        const supabase = createSupabaseBrowser();
        supabase.auth.getUser().then(({ data: { user: u } }) => {
            setUser(u);
            setAuthLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // --- メモ読み込み (期ごと) ---
    const loadMemoForPeriod = useCallback(async (
        ticker: string,
        period: string,
        quarter: string
    ) => {
        setMemoLoading(true);
        setFocusCell([0, 0]);
        try {
            const memoResult = await loadGridMemo(ticker, period, quarter);
            if (memoResult) {
                setGridData(memoResult.grid_json);
                setUpdatedAt(memoResult.updated_at);
                setUpdatedBy(memoResult.updated_by || null);
            } else {
                setGridData(createEmptyGrid());
                setUpdatedAt(null);
                setUpdatedBy(null);
            }
            setDirty(false);
        } catch (err) {
            console.error("メモ読込失敗:", err);
            setGridData(createEmptyGrid());
            setUpdatedAt(null);
            setUpdatedBy(null);
        }
        setMemoLoading(false);
    }, []);

    // --- 全データ読み込み ---
    const handleLoad = useCallback(async () => {
        if (!user) return; // 未認証時は実行しない

        const ticker = normalizeTicker(tickerInput);
        if (!ticker) return;

        setStatus("loading");
        setDataLoading(true);
        setErrorMsg("");
        setDirty(false);
        setActiveTicker(ticker);
        setSelectedPeriod("");
        setSelectedQuarter("");
        setMemoMap({});

        // 全データを並列取得
        const [companyResult, financialsResult, forecastResult, monthlyResult, kpiResult, memosResult] =
            await Promise.allSettled([
                loadCompanyInfo(ticker),
                loadFinancials(ticker),
                loadForecastRevision(ticker),
                loadMonthlyData(ticker),
                loadKpiData(ticker),
                loadAllGridMemos(ticker),
            ]);

        // 会社情報
        if (companyResult.status === "fulfilled") {
            setCompanyInfo(companyResult.value);
        } else {
            setCompanyInfo({ ticker, companyName: null });
        }

        // PL
        let plData: FinancialRecord[] = [];
        if (financialsResult.status === "fulfilled") {
            plData = financialsResult.value;
            setFinancials(plData);
        } else {
            setFinancials([]);
            console.error("Financials 取得失敗:", financialsResult.reason);
        }

        // Forecast
        setForecasts(forecastResult.status === "fulfilled" ? forecastResult.value : []);

        // Monthly
        setMonthly(monthlyResult.status === "fulfilled" ? monthlyResult.value : []);

        // KPI
        setKpi(kpiResult.status === "fulfilled" ? kpiResult.value : []);

        // メモ一括 (PL一覧用)
        let allMemos = new Map<string, GridMemoRecord>();
        if (memosResult.status === "fulfilled") {
            allMemos = memosResult.value;
            setMemoMap(buildMemoMap(allMemos));
        }

        // financials エラー
        if (financialsResult.status === "rejected") {
            const msg = financialsResult.reason instanceof Error
                ? financialsResult.reason.message
                : String(financialsResult.reason);
            setErrorMsg(msg);
            setStatus("error");
        } else {
            setStatus("loaded");
        }

        setDataLoading(false);

        // PL先頭行のメモ
        if (plData.length > 0) {
            const firstRow = plData[0];
            setSelectedPeriod(firstRow.period);
            setSelectedQuarter(firstRow.quarter);

            const memoKey = `${firstRow.period}|${firstRow.quarter}`;
            const cachedMemo = allMemos.get(memoKey);
            if (cachedMemo) {
                setGridData(cachedMemo.grid_json);
                setUpdatedAt(cachedMemo.updated_at);
                setUpdatedBy(cachedMemo.updated_by || null);
                setDirty(false);
            } else {
                setGridData(createEmptyGrid());
                setUpdatedAt(null);
                setUpdatedBy(null);
            }
        } else {
            setGridData(createEmptyGrid());
            setUpdatedAt(null);
            setUpdatedBy(null);
        }
    }, [tickerInput, user]);

    // --- PL行クリック → メモ切替 ---
    const handlePLRowClick = useCallback(async (period: string, quarter: string) => {
        if (!activeTicker) return;
        if (period === selectedPeriod && quarter === selectedQuarter) return;

        if (dirty) {
            const ok = window.confirm(
                `未保存の変更があります。\n${selectedPeriod} / ${selectedQuarter} のメモを破棄して切替えますか？`
            );
            if (!ok) return;
        }

        setSelectedPeriod(period);
        setSelectedQuarter(quarter);

        const memoKey = `${period}|${quarter}`;
        if (memoMap[memoKey]) {
            setGridData(memoMap[memoKey]);
            setDirty(false);
            setFocusCell([0, 0]);
            setUpdatedAt(null);
            setUpdatedBy(null);
        } else {
            await loadMemoForPeriod(activeTicker, period, quarter);
        }
    }, [activeTicker, selectedPeriod, selectedQuarter, dirty, loadMemoForPeriod, memoMap]);

    // --- メモ保存 (UPSERT) ---
    const handleSave = useCallback(async () => {
        if (!activeTicker || !selectedPeriod || !selectedQuarter) return;

        setStatus("saving");
        setErrorMsg("");

        try {
            const result = await saveGridMemo(
                activeTicker,
                selectedPeriod,
                selectedQuarter,
                gridData,
                user?.id
            );
            setUpdatedAt(result.updated_at);
            setUpdatedBy(user?.email || null);
            setDirty(false);
            setStatus("saved");

            // PL側のmemoMapも同期
            const memoKey = `${selectedPeriod}|${selectedQuarter}`;
            setMemoMap((prev) => ({
                ...prev,
                [memoKey]: gridData,
            }));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            setStatus("error");
        }
    }, [activeTicker, selectedPeriod, selectedQuarter, gridData, user]);

    // --- グリッド変更 ---
    const handleGridChange = useCallback((newData: GridData) => {
        setGridData(newData);
        setDirty(true);
    }, []);

    // --- PL側メモ単一セル編集 ---
    const handlePLMemoEdit = useCallback(async (
        period: string,
        quarter: string,
        colIdx: number,
        value: string
    ) => {
        if (!activeTicker) return;

        // 既存のgrid_jsonを取得、なければ空グリッド
        const memoKey = `${period}|${quarter}`;
        const existingGrid = memoMap[memoKey]
            ? memoMap[memoKey].map((row) => [...row])
            : createEmptyGrid();

        // 先頭行の該当セルだけ更新
        existingGrid[0][colIdx] = value;

        // 即保存
        try {
            await saveGridMemo(activeTicker, period, quarter, existingGrid, user?.id);

            // memoMap 同期
            setMemoMap((prev) => ({
                ...prev,
                [memoKey]: existingGrid,
            }));

            // 左メモ欄が同じ period/quarter を表示中なら同期
            if (period === selectedPeriod && quarter === selectedQuarter) {
                setGridData(existingGrid);
                setDirty(false);
            }
        } catch (err) {
            console.error("PLメモ保存失敗:", err);
        }
    }, [activeTicker, memoMap, selectedPeriod, selectedQuarter, user]);

    // --- PL側メモ一括ペースト ---
    const handlePLMemoPaste = useCallback(async (
        edits: { period: string; quarter: string; colIdx: number; value: string }[]
    ) => {
        if (!activeTicker || edits.length === 0) return;

        // 行ごとにグルーピング
        const byRow = new Map<string, { period: string; quarter: string; updates: { colIdx: number; value: string }[] }>();
        for (const edit of edits) {
            const key = `${edit.period}|${edit.quarter}`;
            if (!byRow.has(key)) {
                byRow.set(key, { period: edit.period, quarter: edit.quarter, updates: [] });
            }
            byRow.get(key)!.updates.push({ colIdx: edit.colIdx, value: edit.value });
        }

        const newMemoMap = { ...memoMap };

        for (const [key, { period, quarter, updates }] of byRow) {
            const existingGrid = newMemoMap[key]
                ? newMemoMap[key].map((row) => [...row])
                : createEmptyGrid();

            for (const { colIdx, value } of updates) {
                existingGrid[0][colIdx] = value;
            }

            try {
                await saveGridMemo(activeTicker, period, quarter, existingGrid, user?.id);
                newMemoMap[key] = existingGrid;
            } catch (err) {
                console.error(`PLメモ保存失敗 (${key}):`, err);
            }
        }

        setMemoMap(newMemoMap);

        // 左メモ欄が表示中のデータが更新されていたら同期
        const selectedKey = `${selectedPeriod}|${selectedQuarter}`;
        if (newMemoMap[selectedKey]) {
            setGridData(newMemoMap[selectedKey]);
            setDirty(false);
        }
    }, [activeTicker, memoMap, selectedPeriod, selectedQuarter, user]);

    // --- 保存後のステータスリセット ---
    useEffect(() => {
        if (status === "saved") {
            const timer = setTimeout(() => setStatus("loaded"), 3000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    // --- 認証読込中 ---
    if (authLoading) {
        return (
            <div className="viewer-container">
                <div className="placeholder">認証確認中...</div>
            </div>
        );
    }

    // --- 未認証 (middleware がリダイレクトするが念のため) ---
    if (!user) {
        return (
            <div className="viewer-container">
                <div className="placeholder">ログインが必要です</div>
            </div>
        );
    }

    return (
        <div className="viewer-container">
            {/* ヘッダー */}
            <TickerHeader
                tickerInput={tickerInput}
                onTickerChange={setTickerInput}
                onLoad={handleLoad}
                loading={status === "loading"}
                activeTicker={activeTicker}
                companyName={companyInfo?.companyName || null}
                errorMsg={errorMsg}
                userEmail={user.email}
            />

            {/* 未ロード時 */}
            {!activeTicker && status === "idle" && (
                <div className="placeholder">
                    企業コードを入力して「読込」を押してください
                </div>
            )}

            {/* 2カラムレイアウト */}
            {activeTicker && (
                <div className="viewer-layout">
                    {/* 左カラム: メモ */}
                    <div className="viewer-left">
                        <div className="data-section memo-section">
                            <div className="memo-header-row">
                                <h2 className="section-title">📋 メモ</h2>
                                <div className="memo-actions">
                                    <button
                                        className="btn btn-save"
                                        onClick={handleSave}
                                        disabled={
                                            status === "saving" ||
                                            !dirty ||
                                            !selectedPeriod ||
                                            !selectedQuarter
                                        }
                                    >
                                        {status === "saving" ? "保存中..." : "保存"}
                                    </button>
                                </div>
                            </div>
                            <div className="memo-status-row">
                                <span className="shared-notice">
                                    🔗 共有データ（後勝ち上書き）
                                </span>
                                {updatedAt && (
                                    <span className="updated-at">
                                        最終更新: {new Date(updatedAt).toLocaleString("ja-JP")}
                                    </span>
                                )}
                                {updatedBy && (
                                    <span className="updated-by">
                                        by {updatedBy}
                                    </span>
                                )}
                                <span className={`save-status ${dirty ? "unsaved" : "saved"}`}>
                                    {dirty
                                        ? "● 未保存の変更あり"
                                        : status === "saved"
                                            ? "✓ 保存済み"
                                            : ""}
                                </span>
                            </div>
                            {memoLoading ? (
                                <div className="loading-message">メモ読込中...</div>
                            ) : selectedPeriod && selectedQuarter ? (
                                <MemoGrid
                                    data={gridData}
                                    onChange={handleGridChange}
                                    period={selectedPeriod}
                                    quarter={selectedQuarter}
                                    focusCell={focusCell}
                                    onFocusCellChange={setFocusCell}
                                />
                            ) : (
                                <div className="no-data-message">
                                    PL の行をクリックしてメモを表示
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右カラム: データテーブル群 */}
                    <div className="viewer-right">
                        <FinancialsTable
                            data={financials}
                            loading={dataLoading}
                            selectedPeriod={selectedPeriod}
                            selectedQuarter={selectedQuarter}
                            onRowClick={handlePLRowClick}
                            memoMap={memoMap}
                            onMemoEdit={handlePLMemoEdit}
                            onMemoPaste={handlePLMemoPaste}
                        />
                        <ForecastTable data={forecasts} loading={dataLoading} />
                        <MonthlyTable data={monthly} loading={dataLoading} />
                        <KpiTable data={kpi} loading={dataLoading} />
                    </div>
                </div>
            )}
        </div>
    );
}
