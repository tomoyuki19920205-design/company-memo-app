"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import TickerHeader from "@/components/TickerHeader";
import FinancialsTable from "@/components/FinancialsTable";
import ForecastTable from "@/components/ForecastTable";
import MonthlyTable from "@/components/MonthlyTable";
import KpiTable from "@/components/KpiTable";
import OrderKpiTable from "@/components/OrderKpiTable";
import ValuationCard from "@/components/ValuationCard";
import PerShareTable from "@/components/PerShareTable";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import {
    saveGridMemo,
    loadAllGridMemos,
    createEmptyGrid,
    normalizeTicker,
    type GridData,
    type GridMemoRecord,
} from "@/lib/memo-api";
import {
    loadKpiDefinitions,
    loadKpiValues,
    saveKpiDefinition,
    saveKpiValue,
    type KpiDefMap,
    type KpiValueMap,
} from "@/lib/kpi-api";
import {
    loadCompanyInfo,
    loadCompanyMaster,
    loadFinancials,
    loadForecastRevision,
    loadMonthlyData,
    loadKpiData,
    loadSegmentData,
    extractFiscalYears,
    resolveSegmentsWithOverrides,
    generateMissingQuarterStubs,
    loadOrderKpis,
    updateOrderKpiReviewStatus,
    loadRejectedOrderKpis,
    restoreOrderKpi,
    updateOrderKpiValue,
    loadLatestMarketData,
    loadPerShareData,
    calculateValuation,
    type CompanyInfo,
} from "@/lib/viewer-api";
import { preNormalizeCandidates, type SearchCandidate } from "@/lib/company-search";
import {
    loadSegmentOverrides,
    saveSegmentOverride,
    saveSegmentOverridesBulk,
    deleteSegmentOverride,
} from "@/lib/segment-override-api";
import { useTickerPresence } from "@/hooks/useTickerPresence";
import type { FinancialRecord } from "@/types/financial";
import type { ForecastRevision } from "@/types/forecast";
import type { MonthlyRecord } from "@/types/monthly";
import type { KpiRecord } from "@/types/kpi";
import type { SegmentRecord } from "@/types/segment";
import type { SegmentCellOverride, SegmentOverrideSaveRequest } from "@/types/segment-override";
import type { OrderKpiItem } from "@/types/order-kpi";
import type { MarketDataRecord, PerShareRecord, ValuationMetrics } from "@/types/market-data";
import type { User } from "@supabase/supabase-js";

type AppStatus = "idle" | "loading" | "loaded" | "saving" | "saved" | "error";
type MemoMapType = { [key: string]: GridData };

function buildMemoMap(memos: Map<string, GridMemoRecord>): MemoMapType {
    const map: MemoMapType = {};
    memos.forEach((record, key) => {
        map[key] = record.grid_json;
    });
    return map;
}

export default function ViewerPage() {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [tickerInput, setTickerInput] = useState("");
    const [companyMaster, setCompanyMaster] = useState<SearchCandidate[]>([]);
    const masterLoadedRef = useRef(false);
    const masterLoadingRef = useRef(false);
    const [activeTicker, setActiveTicker] = useState("");
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<string>("");
    const [selectedQuarter, setSelectedQuarter] = useState<string>("");
    const [memoMap, setMemoMap] = useState<MemoMapType>({});
    const [financials, setFinancials] = useState<FinancialRecord[]>([]);
    const [forecasts, setForecasts] = useState<ForecastRevision[]>([]);
    const [monthly, setMonthly] = useState<MonthlyRecord[]>([]);
    const [kpi, setKpi] = useState<KpiRecord[]>([]);
    const [segments, setSegments] = useState<SegmentRecord[]>([]);
    const [segmentOverrides, setSegmentOverrides] = useState<SegmentCellOverride[]>([]);
    const [resolvedSegments, setResolvedSegments] = useState<SegmentRecord[]>([]);
    const [orderKpis, setOrderKpis] = useState<OrderKpiItem[]>([]);
    const [rejectedKpis, setRejectedKpis] = useState<OrderKpiItem[]>([]);
    const [marketData, setMarketData] = useState<MarketDataRecord | null>(null);
    const [perShareData, setPerShareData] = useState<PerShareRecord[]>([]);
    const [valuation, setValuation] = useState<ValuationMetrics | null>(null);
    const [kpiDefs, setKpiDefs] = useState<KpiDefMap>({ 1: "KPI 1", 2: "KPI 2", 3: "KPI 3" });
    const [kpiValues, setKpiValues] = useState<KpiValueMap>({});
    const [status, setStatus] = useState<AppStatus>("idle");
    const [dataLoading, setDataLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // ============================================================
    // Undo スタック (Ctrl+Z)
    // ============================================================
    interface UndoEntry {
        label: string;
        restore: () => void;
    }
    const undoStackRef = useRef<UndoEntry[]>([]);
    const MAX_UNDO = 50;

    const pushUndo = useCallback((label: string, restore: () => void) => {
        undoStackRef.current.push({ label, restore });
        if (undoStackRef.current.length > MAX_UNDO) {
            undoStackRef.current.shift();
        }
    }, []);

    const handleUndo = useCallback(() => {
        const entry = undoStackRef.current.pop();
        if (!entry) return;
        console.log(`[undo] ${entry.label}`);
        entry.restore();
    }, []);

    // グローバル Ctrl+Z ハンドラ (PLテーブル外でも効く)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                // textarea/input にフォーカスがある場合はブラウザ標準に任せる
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA") return;
                e.preventDefault();
                handleUndo();
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [handleUndo]);

    // フォントテーマ
    const [fontTheme, setFontTheme] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("app-font-theme") || "default";
        }
        return "default";
    });
    useEffect(() => {
        localStorage.setItem("app-font-theme", fontTheme);
    }, [fontTheme]);

    // 同時閲覧ユーザー
    const { viewers } = useTickerPresence(activeTicker, user?.email, user?.id);

    useEffect(() => {
        const supabase = createSupabaseBrowser();
        // 安全タイムアウト: getUser() がハングしても5秒で解除
        const timeout = setTimeout(() => {
            console.warn("[auth] getUser() timeout — forcing authLoading=false");
            setAuthLoading(false);
        }, 5000);
        supabase.auth.getUser()
            .then(({ data: { user: u } }) => {
                clearTimeout(timeout);
                setUser(u);
                setAuthLoading(false);
            })
            .catch((err) => {
                clearTimeout(timeout);
                console.error("[auth] getUser() failed:", err);
                setAuthLoading(false);
            });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });
        return () => { subscription.unsubscribe(); clearTimeout(timeout); };
    }, []);

    const handleLoad = useCallback(async (targetTicker?: string) => {
        if (!user) return;
        const ticker = normalizeTicker(targetTicker ?? tickerInput);
        if (!ticker) return;

        setStatus("loading");
        setDataLoading(true);
        setErrorMsg("");
        setActiveTicker(ticker);
        setSelectedPeriod("");
        setSelectedQuarter("");
        setMemoMap({});
        setSegments([]);
        setSegmentOverrides([]);
        setResolvedSegments([]);
        setOrderKpis([]);
        setRejectedKpis([]);
        setMarketData(null);
        setPerShareData([]);
        setValuation(null);
        setKpiDefs({ 1: "KPI 1", 2: "KPI 2", 3: "KPI 3" });
        setKpiValues({});

        const [companyResult, financialsResult, forecastResult, monthlyResult, kpiResult, memosResult, segmentResult, kpiDefsResult, kpiValsResult, orderKpisResult, marketResult, perShareResult] =
            await Promise.allSettled([
                loadCompanyInfo(ticker),
                loadFinancials(ticker),
                loadForecastRevision(ticker),
                loadMonthlyData(ticker),
                loadKpiData(ticker),
                loadAllGridMemos(ticker),
                loadSegmentData(ticker),
                loadKpiDefinitions(ticker),
                loadKpiValues(ticker),
                loadOrderKpis(ticker),
                loadLatestMarketData(ticker),
                loadPerShareData(ticker),
            ]);

        setCompanyInfo(companyResult.status === "fulfilled" ? companyResult.value : { ticker, companyName: null });

        let plData: FinancialRecord[] = [];
        if (financialsResult.status === "fulfilled") {
            plData = financialsResult.value;
            setFinancials(plData);
        } else {
            setFinancials([]);
        }

        setForecasts(forecastResult.status === "fulfilled" ? forecastResult.value : []);
        setMonthly(monthlyResult.status === "fulfilled" ? monthlyResult.value : []);
        setKpi(kpiResult.status === "fulfilled" ? kpiResult.value : []);
        const segData = segmentResult.status === "fulfilled" ? segmentResult.value : [];
        setSegments(segData);

        // Load overrides for displayed fiscal years
        let overridesData: SegmentCellOverride[] = [];
        if (segData.length > 0) {
            const fiscalYears = extractFiscalYears(segData);
            try {
                overridesData = await loadSegmentOverrides(ticker, fiscalYears);
            } catch (err) {
                console.warn("[segment_cell_overrides] load failed:", err);
            }
        }
        setSegmentOverrides(overridesData);

        // Generate 1Q/3Q stub rows from existing FY/2Q segment names
        const stubs = generateMissingQuarterStubs(segData);
        const withStubs = [...segData, ...stubs];

        // Resolve with overrides (stubs + base → overlay)
        const resolved = resolveSegmentsWithOverrides(withStubs, overridesData);
        setResolvedSegments(resolved);

        // DEBUG: PL/segment結合キー確認
        if (plData.length > 0) {
            console.log("[DEBUG] PL rows sample:", plData.slice(0, 3).map(r => ({ period: r.period, quarter: r.quarter })));
        }
        if (segData.length > 0) {
            console.log("[DEBUG] Segment rows:", segData.length, "件");
            console.log("[DEBUG] Segment sample:", segData.slice(0, 3).map(r => ({ period: r.period, quarter: r.quarter, seg: r.segment_name })));
            const segKeys = new Set(segData.map(r => `${r.period}|${r.quarter}`));
            const plKeys = new Set(plData.map(r => `${r.period}|${r.quarter}`));
            const matching = [...segKeys].filter(k => plKeys.has(k));
            console.log("[DEBUG] PL keys:", [...plKeys].slice(0, 5));
            console.log("[DEBUG] Seg keys:", [...segKeys].slice(0, 5));
            console.log("[DEBUG] Matching keys:", matching.length, matching.slice(0, 5));
        } else {
            console.log("[DEBUG] Segment data: 0件 (empty)");
        }

        if (memosResult.status === "fulfilled") {
            setMemoMap(buildMemoMap(memosResult.value));
        }
        if (kpiDefsResult.status === "fulfilled") {
            setKpiDefs(kpiDefsResult.value);
        }
        if (kpiValsResult.status === "fulfilled") {
            setKpiValues(kpiValsResult.value);
        }
        setOrderKpis(orderKpisResult.status === "fulfilled" ? orderKpisResult.value : []);

        // Market data & per share data
        const mktData = marketResult.status === "fulfilled" ? marketResult.value : null;
        const psData = perShareResult.status === "fulfilled" ? perShareResult.value : [];
        setMarketData(mktData);
        setPerShareData(psData);
        setValuation(calculateValuation(mktData, psData));

        // 却下レコードは別途取得 (Promise.allSettled に含めず後から)
        loadRejectedOrderKpis(ticker).then(setRejectedKpis).catch(() => setRejectedKpis([]));

        if (financialsResult.status === "rejected") {
            const msg = financialsResult.reason instanceof Error ? financialsResult.reason.message : String(financialsResult.reason);
            setErrorMsg(msg);
            setStatus("error");
        } else {
            setStatus("loaded");
        }

        setDataLoading(false);

        if (plData.length > 0) {
            setSelectedPeriod(plData[0].period);
            setSelectedQuarter(plData[0].quarter);
        }
    }, [tickerInput, user]);

    // ---- 企業マスタ lazy load (多重ロード防止付き) ----
    const handleRequestMaster = useCallback(async () => {
        console.log("[DEBUG master] handleRequestMaster called, loaded:", masterLoadedRef.current, "loading:", masterLoadingRef.current);
        if (masterLoadedRef.current || masterLoadingRef.current) return;
        masterLoadingRef.current = true;
        try {
            const raw = await loadCompanyMaster();
            console.log("[DEBUG master] loadCompanyMaster returned:", raw.length, "items, sample:", raw.slice(0, 2));
            const normalized = preNormalizeCandidates(raw);
            setCompanyMaster(normalized);
            masterLoadedRef.current = true;
            console.log("[DEBUG master] setCompanyMaster done, count:", normalized.length);
        } catch (err) {
            console.warn("[companies master] lazy load failed:", err);
        } finally {
            masterLoadingRef.current = false;
        }
    }, []);

    // ---- 候補選択 (TickerHeader → page.tsx 一元管理) ----
    const handleSelectCandidate = useCallback(
        (ticker: string) => {
            setTickerInput(ticker);
            handleLoad(ticker);
        },
        [handleLoad],
    );

    const handlePLRowClick = useCallback((period: string, quarter: string) => {
        setSelectedPeriod(period);
        setSelectedQuarter(quarter);
    }, []);

    // KPIヘッダー名変更
    const handleKpiHeaderEdit = useCallback(
        async (kpiSlot: number, newName: string) => {
            if (!activeTicker) return;
            const prev = kpiDefs[kpiSlot];
            // Undo エントリ
            pushUndo(`KPIヘッダー ${kpiSlot}`, () => {
                setKpiDefs((d) => ({ ...d, [kpiSlot]: prev }));
                saveKpiDefinition(activeTicker, kpiSlot, prev ?? `KPI ${kpiSlot}`).catch(console.error);
            });
            // 楽観的更新
            setKpiDefs((d) => ({ ...d, [kpiSlot]: newName }));
            try {
                await saveKpiDefinition(activeTicker, kpiSlot, newName);
            } catch (err) {
                console.error("KPIヘッダー保存失敗:", err);
                setKpiDefs((d) => ({ ...d, [kpiSlot]: prev }));
                setErrorMsg(`KPIヘッダー保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, kpiDefs, pushUndo]
    );

    // KPI値変更
    const handleKpiValueEdit = useCallback(
        async (period: string, quarter: string, kpiSlot: number, value: string) => {
            if (!activeTicker) return;
            const key = `${period}|${quarter}`;
            const prevValue = kpiValues[key]?.[kpiSlot] ?? "";
            // Undo エントリ
            pushUndo(`KPI値 ${key} slot${kpiSlot}`, () => {
                setKpiValues((prev) => ({
                    ...prev,
                    [key]: { ...(prev[key] || {}), [kpiSlot]: prevValue },
                }));
                saveKpiValue(activeTicker, period, quarter, kpiSlot, prevValue).catch(console.error);
            });
            // 楽観的更新
            setKpiValues((prev) => ({
                ...prev,
                [key]: { ...(prev[key] || {}), [kpiSlot]: value },
            }));
            try {
                await saveKpiValue(activeTicker, period, quarter, kpiSlot, value);
            } catch (err) {
                console.error("KPI値保存失敗:", err);
                setKpiValues((prev) => ({
                    ...prev,
                    [key]: { ...(prev[key] || {}), [kpiSlot]: prevValue },
                }));
                setErrorMsg(`KPI値保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, kpiValues, pushUndo]
    );

    const handlePLMemoEdit = useCallback(
        async (period: string, quarter: string, colIdx: number, value: string) => {
            if (!activeTicker) return;
            const memoKey = `${period}|${quarter}`;
            const existingGrid = memoMap[memoKey]
                ? memoMap[memoKey].map((row) => [...row])
                : createEmptyGrid();
            existingGrid[0][colIdx] = value;

            // Undo エントリ
            const prevGrid = memoMap[memoKey];
            const prevGridCopy = prevGrid ? prevGrid.map((row) => [...row]) : undefined;
            pushUndo(`メモ ${memoKey} col${colIdx}`, () => {
                if (prevGridCopy) {
                    setMemoMap((prev) => ({ ...prev, [memoKey]: prevGridCopy }));
                    saveGridMemo(activeTicker, period, quarter, prevGridCopy, user?.id).catch(console.error);
                } else {
                    setMemoMap((prev) => { const next = { ...prev }; delete next[memoKey]; return next; });
                }
            });

            // 楽観的更新: 即座にUIに反映
            setMemoMap((prev) => ({ ...prev, [memoKey]: existingGrid }));

            try {
                await saveGridMemo(activeTicker, period, quarter, existingGrid, user?.id);
            } catch (err) {
                console.error("PLメモ保存失敗:", err);
                // 保存失敗時はロールバック
                setMemoMap((prev) => {
                    const next = { ...prev };
                    if (prevGrid) {
                        next[memoKey] = prevGrid;
                    } else {
                        delete next[memoKey];
                    }
                    return next;
                });
                setErrorMsg(`メモ保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, memoMap, user, pushUndo]
    );

    const handlePLMemoPaste = useCallback(
        async (edits: { period: string; quarter: string; colIdx: number; value: string }[]) => {
            if (!activeTicker || edits.length === 0) return;

            const byRow = new Map<string, { period: string; quarter: string; updates: { colIdx: number; value: string }[] }>();
            for (const edit of edits) {
                const key = `${edit.period}|${edit.quarter}`;
                if (!byRow.has(key)) byRow.set(key, { period: edit.period, quarter: edit.quarter, updates: [] });
                byRow.get(key)!.updates.push({ colIdx: edit.colIdx, value: edit.value });
            }

            // Undo エントリ (ペースト前の全体スナップショット)
            const prevMemoMapCopy: MemoMapType = {};
            for (const key of Object.keys(memoMap)) {
                prevMemoMapCopy[key] = memoMap[key].map((row) => [...row]);
            }
            pushUndo(`メモペースト ${edits.length}セル`, () => {
                setMemoMap(prevMemoMapCopy);
                // 変更されたキーのみ再保存
                for (const [key, { period, quarter }] of byRow) {
                    const restoreGrid = prevMemoMapCopy[key] ?? createEmptyGrid();
                    saveGridMemo(activeTicker, period, quarter, restoreGrid, user?.id).catch(console.error);
                }
            });

            // 楽観的更新: 即座にUIに反映
            const newMemoMap = { ...memoMap };
            const prevMemoMap = { ...memoMap };
            for (const [key, { updates }] of byRow) {
                const grid = newMemoMap[key] ? newMemoMap[key].map((row) => [...row]) : createEmptyGrid();
                for (const { colIdx, value } of updates) grid[0][colIdx] = value;
                newMemoMap[key] = grid;
            }
            setMemoMap(newMemoMap);

            // バックグラウンドで保存
            let hasErrors = false;
            for (const [key, { period, quarter }] of byRow) {
                try {
                    await saveGridMemo(activeTicker, period, quarter, newMemoMap[key], user?.id);
                } catch (err) {
                    console.error(`PLメモ保存失敗 (${key}):`, err);
                    hasErrors = true;
                }
            }
            if (hasErrors) {
                setMemoMap(prevMemoMap);
                setErrorMsg("一部メモの保存に失敗しました。allowed_usersの登録を確認してください。");
            }
        },
        [activeTicker, memoMap, user, pushUndo]
    );

    // ============================================================
    // Segment Override — 1Q/3Q 欠損セル手入力
    // ============================================================

    const handleSaveOverride = useCallback(
        async (
            fiscalYear: number,
            quarter: string,
            segmentName: string,
            metric: string,
            value: number,
        ) => {
            if (!activeTicker || !user?.email) return;

            try {
                const saved = await saveSegmentOverride(
                    {
                        ticker: activeTicker,
                        fiscal_year: fiscalYear,
                        quarter,
                        segment_name: segmentName,
                        metric,
                        value,
                    },
                    user.email,
                );

                if (saved) {
                    // Build new overrides list
                    const newOverrides = [
                        ...segmentOverrides.filter(
                            (ov) =>
                                !(
                                    ov.fiscal_year === fiscalYear &&
                                    ov.quarter === quarter &&
                                    ov.segment_name === segmentName &&
                                    ov.metric === metric
                                ),
                        ),
                        saved,
                    ];
                    setSegmentOverrides(newOverrides);

                    // Re-resolve segments with new overrides
                    const stubs = generateMissingQuarterStubs(segments);
                    const withStubs = [...segments, ...stubs];
                    const resolved = resolveSegmentsWithOverrides(
                        withStubs,
                        newOverrides,
                    );
                    setResolvedSegments(resolved);
                }
            } catch (err) {
                console.error("Override save failed:", err);
                setErrorMsg(
                    `手入力保存失敗: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        },
        [activeTicker, user, segments, segmentOverrides],
    );

    const handleDeleteOverride = useCallback(
        async (
            fiscalYear: number,
            quarter: string,
            segmentName: string,
            metric: string,
        ) => {
            if (!activeTicker || !user?.email) return;

            try {
                const success = await deleteSegmentOverride(
                    activeTicker,
                    fiscalYear,
                    quarter,
                    segmentName,
                    metric,
                    user.email,
                );

                if (success) {
                    // Build new overrides list (removed)
                    const newOverrides = segmentOverrides.filter(
                        (ov) =>
                            !(
                                ov.fiscal_year === fiscalYear &&
                                ov.quarter === quarter &&
                                ov.segment_name === segmentName &&
                                ov.metric === metric
                            ),
                    );
                    setSegmentOverrides(newOverrides);

                    // Re-resolve segments
                    const stubs = generateMissingQuarterStubs(segments);
                    const withStubs = [...segments, ...stubs];
                    const resolved = resolveSegmentsWithOverrides(
                        withStubs,
                        newOverrides,
                    );
                    setResolvedSegments(resolved);
                }
            } catch (err) {
                console.error("Override delete failed:", err);
                setErrorMsg(
                    `手入力削除失敗: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        },
        [activeTicker, user, segments, segmentOverrides],
    );

    // ============================================================
    // Segment Override — Bulk Paste (複数セル一括保存)
    // ============================================================

    const handleBulkSaveOverrides = useCallback(
        async (items: SegmentOverrideSaveRequest[]): Promise<{ saved: number; failed: number }> => {
            if (!activeTicker || !user?.email) return { saved: 0, failed: items.length };

            // ticker を items に注入（FinancialsTable 側では空文字で渡される）
            const requests = items.map((item) => ({
                ...item,
                ticker: activeTicker,
            }));

            try {
                const result = await saveSegmentOverridesBulk(requests, user.email);

                if (result.saved.length > 0) {
                    // 既存 overrides に merge
                    let newOverrides = [...segmentOverrides];
                    for (const saved of result.saved) {
                        newOverrides = newOverrides.filter(
                            (ov) =>
                                !(
                                    ov.fiscal_year === saved.fiscal_year &&
                                    ov.quarter === saved.quarter &&
                                    ov.segment_name === saved.segment_name &&
                                    ov.metric === saved.metric
                                ),
                        );
                        newOverrides.push(saved);
                    }
                    setSegmentOverrides(newOverrides);

                    // Re-resolve
                    const stubs = generateMissingQuarterStubs(segments);
                    const withStubs = [...segments, ...stubs];
                    const resolved = resolveSegmentsWithOverrides(withStubs, newOverrides);
                    setResolvedSegments(resolved);
                }

                return { saved: result.saved.length, failed: result.failed };
            } catch (err) {
                console.error("Bulk override save failed:", err);
                setErrorMsg(
                    `一括保存失敗: ${err instanceof Error ? err.message : String(err)}`,
                );
                return { saved: 0, failed: items.length };
            }
        },
        [activeTicker, user, segments, segmentOverrides],
    );

    // ============================================================
    // Order KPI — review承認/却下
    // ============================================================

    const handleOrderKpiReview = useCallback(
        async (
            id: number,
            nextStatus: "auto_accepted" | "rejected",
            reviewNote?: string,
        ): Promise<{ success: boolean; error?: string }> => {
            const result = await updateOrderKpiReviewStatus(
                id,
                nextStatus,
                user?.email ?? undefined,
                reviewNote,
            );
            if (result.success && activeTicker) {
                // 再fetch でUI更新（却下されたレコードは best view から消える）
                const updated = await loadOrderKpis(activeTicker);
                setOrderKpis(updated);
            }
            return result;
        },
        [activeTicker, user],
    );

    const handleRestoreOrderKpi = useCallback(
        async (id: number): Promise<{ success: boolean; error?: string }> => {
            const result = await restoreOrderKpi(id, user?.email ?? undefined);
            if (result.success && activeTicker) {
                const [updated, rejected] = await Promise.all([
                    loadOrderKpis(activeTicker),
                    loadRejectedOrderKpis(activeTicker),
                ]);
                setOrderKpis(updated);
                setRejectedKpis(rejected);
            }
            return result;
        },
        [activeTicker, user],
    );

    const handleEditOrderKpiValue = useCallback(
        async (
            id: number,
            newValue: number,
            reviewNote?: string,
        ): Promise<{ success: boolean; error?: string }> => {
            const result = await updateOrderKpiValue(
                id,
                newValue,
                user?.email ?? undefined,
                reviewNote,
            );
            if (result.success && activeTicker) {
                const updated = await loadOrderKpis(activeTicker);
                setOrderKpis(updated);
            }
            return result;
        },
        [activeTicker, user],
    );

    useEffect(() => {
        if (status === "saved") {
            const timer = setTimeout(() => setStatus("loaded"), 3000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    if (authLoading) return <div className="viewer-container"><div className="placeholder">認証確認中...</div></div>;
    if (!user) return <div className="viewer-container"><div className="placeholder">ログインが必要です</div></div>;

    return (
        <div className={`viewer-container font-${fontTheme}`}>
            <TickerHeader
                tickerInput={tickerInput}
                onTickerChange={setTickerInput}
                onLoad={handleLoad}
                onSelectCandidate={handleSelectCandidate}
                loading={status === "loading"}
                activeTicker={activeTicker}
                companyName={companyInfo?.companyName || null}
                errorMsg={errorMsg}
                userEmail={user.email}
                fontTheme={fontTheme}
                onFontThemeChange={setFontTheme}
                candidates={companyMaster}
                onRequestMaster={handleRequestMaster}
            />

            {/* 同時閲覧ユーザー表示 */}
            {viewers.length > 0 && (
                <div className="presence-bar">
                    <span className="presence-icon">👁️</span>
                    <span className="presence-text">
                        同時閲覧中: {viewers.map((v) => v.displayName).join(", ")}
                    </span>
                </div>
            )}

            {/* マーケット指標バー: 企業コード検索の直下 */}
            {activeTicker && (
                <ValuationCard valuation={valuation} loading={dataLoading} compact />
            )}

            {!activeTicker && status === "idle" && (
                <div className="placeholder">企業コードを入力して「読込」を押してください</div>
            )}

            {activeTicker && (
                <div className="viewer-main">
                    <FinancialsTable
                        data={financials}
                        loading={dataLoading}
                        selectedPeriod={selectedPeriod}
                        selectedQuarter={selectedQuarter}
                        onRowClick={handlePLRowClick}
                        memoMap={memoMap}
                        onMemoEdit={handlePLMemoEdit}
                        onMemoPaste={handlePLMemoPaste}
                        segments={resolvedSegments}
                        kpiDefs={kpiDefs}
                        kpiValues={kpiValues}
                        onKpiHeaderEdit={handleKpiHeaderEdit}
                        onKpiValueEdit={handleKpiValueEdit}
                        onSegmentOverrideSave={handleSaveOverride}
                        onSegmentOverrideDelete={handleDeleteOverride}
                        onBulkSaveOverrides={handleBulkSaveOverrides}
                        onUndo={handleUndo}
                    />
                    <ForecastTable data={forecasts} loading={dataLoading} />
                    <MonthlyTable data={monthly} loading={dataLoading} />

                    <PerShareTable data={perShareData} loading={dataLoading} />
                    <KpiTable data={kpi} loading={dataLoading} />
                    <OrderKpiTable
                        data={orderKpis}
                        loading={dataLoading}
                    />
                </div>
            )}
        </div>
    );
}
