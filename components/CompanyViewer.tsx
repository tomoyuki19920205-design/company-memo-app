"use client";

import React, {
    useState, useCallback, useEffect, useRef,
    forwardRef, useImperativeHandle,
} from "react";
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
    saveManualTableMemo,
    loadManualTableMemos,
    saveSegmentManualHeaders,
    loadSegmentManualHeaders,
    DEFAULT_SEGMENT_MANUAL_HEADERS,
    type GridData,
    type GridMemoRecord,
    type ManualTableType,
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

/** 手入力メモ専用行 state 型 */
type ManualTableMemos = {
    pl_cum: string[][];
    pl_q: string[][];
    segment_cum: string[][];
    segment_q: string[][];
    segment_manual: string[][];
};

/** 手入力メモ初期値 */
const MANUAL_ROW_COUNT = 4;

const EMPTY_MANUAL_MEMOS: ManualTableMemos = {
    pl_cum:         Array.from({ length: MANUAL_ROW_COUNT }, () => []),
    pl_q:           Array.from({ length: MANUAL_ROW_COUNT }, () => []),
    segment_cum:    Array.from({ length: MANUAL_ROW_COUNT }, () => []),
    segment_q:      Array.from({ length: MANUAL_ROW_COUNT }, () => []),
    segment_manual: [],  // 行数は cumRows.length に連動
};

function buildMemoMap(memos: Map<string, GridMemoRecord>): MemoMapType {
    const map: MemoMapType = {};
    memos.forEach((record, key) => {
        map[key] = record.grid_json;
    });
    return map;
}

/** loadManualTableMemos の結果を ManualTableMemos 型に変換 */
function buildManualTableMemos(
    raw: Record<ManualTableType, string[][] | null>
): ManualTableMemos {
    const pad = (grid: string[][] | null, rows: number): string[][] => {
        const base = (grid ?? []).map((r) => [...r]);
        while (base.length < rows) base.push([]);
        return base;
    };
    return {
        pl_cum:         pad(raw.pl_cum,         MANUAL_ROW_COUNT),
        pl_q:           pad(raw.pl_q,           MANUAL_ROW_COUNT),
        segment_cum:    pad(raw.segment_cum,    MANUAL_ROW_COUNT),
        segment_q:      pad(raw.segment_q,      MANUAL_ROW_COUNT),
        segment_manual: (raw.segment_manual ?? []).map((r) => [...r]),
    };
}

/** CompanyViewer の外部制御インターフェース */
export interface CompanyViewerHandle {
    loadTicker: (ticker: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CompanyViewer = forwardRef<CompanyViewerHandle, {}>((_, ref) => {
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
    const memoMapRef = useRef<MemoMapType>(memoMap);
    useEffect(() => { memoMapRef.current = memoMap; }, [memoMap]);
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
    const kpiValuesRef = useRef<KpiValueMap>(kpiValues);
    useEffect(() => { kpiValuesRef.current = kpiValues; }, [kpiValues]);
    const [manualTableMemos, setManualTableMemos] = useState<ManualTableMemos>(EMPTY_MANUAL_MEMOS);
    const manualTableMemosRef = useRef<ManualTableMemos>(manualTableMemos);
    useEffect(() => { manualTableMemosRef.current = manualTableMemos; }, [manualTableMemos]);
    const [segmentManualHeaders, setSegmentManualHeaders] = useState<string[]>([...DEFAULT_SEGMENT_MANUAL_HEADERS]);
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

    // ============================================================
    // カスタム固定横スクロール操作バー
    // ============================================================
    const [xScrollMax, setXScrollMax] = useState(0);
    const [xScrollLeft, setXScrollLeft] = useState(0);

    useEffect(() => {
        const getPageScrollEl = (): HTMLElement =>
            (document.scrollingElement as HTMLElement | null) ?? document.documentElement;

        const update = () => {
            const el = getPageScrollEl();
            const max = Math.max(0, el.scrollWidth - el.clientWidth);
            const scrollX = window.scrollX ?? el.scrollLeft ?? 0;
            setXScrollMax(max);
            setXScrollLeft(scrollX);
        };

        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        const ro = new ResizeObserver(update);
        ro.observe(document.documentElement);
        if (document.body) ro.observe(document.body);

        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            ro.disconnect();
        };
    }, []);

    const pushUndo = useCallback((label: string, restore: () => void) => {
        undoStackRef.current.push({ label, restore });
        if (undoStackRef.current.length > MAX_UNDO) {
            undoStackRef.current.shift();
        }
    }, []);

    const handleUndo = useCallback(() => {
        const entry = undoStackRef.current.pop();
        if (!entry) return;
        entry.restore();
    }, []);

    // グローバル Ctrl+Z ハンドラ
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
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
        setManualTableMemos(EMPTY_MANUAL_MEMOS);
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

        const [companyResult, financialsResult, forecastResult, monthlyResult, kpiResult, memosResult, segmentResult, kpiDefsResult, kpiValsResult, orderKpisResult, marketResult, perShareResult, manualMemosResult, segManualHeadersResult] =
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
                loadManualTableMemos(ticker),
                loadSegmentManualHeaders(ticker),
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

        // 手入力メモ専用行
        if (manualMemosResult.status === "fulfilled") {
            setManualTableMemos(buildManualTableMemos(manualMemosResult.value));
        }
        // segment_manual ヘッダー
        if (segManualHeadersResult.status === "fulfilled") {
            setSegmentManualHeaders(segManualHeadersResult.value);
        } else {
            setSegmentManualHeaders([...DEFAULT_SEGMENT_MANUAL_HEADERS]);
        }

        // Market data & per share data
        const mktData = marketResult.status === "fulfilled" ? marketResult.value : null;
        const psData = perShareResult.status === "fulfilled" ? perShareResult.value : [];
        setMarketData(mktData);
        setPerShareData(psData);
        setValuation(calculateValuation(mktData, psData));

        // 却下レコードは別途取得
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

    // handleLoad の最新参照を ref で保持（外部呼び出し用）
    const handleLoadRef = useRef(handleLoad);
    useEffect(() => { handleLoadRef.current = handleLoad; }, [handleLoad]);

    // ============================================================
    // URL クエリ ?ticker=xxxx からの初期ロード
    // ============================================================
    const urlTickerLoadedRef = useRef(false);
    useEffect(() => {
        if (authLoading || !user || urlTickerLoadedRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const t = params.get("ticker")?.trim();
        if (!t) { urlTickerLoadedRef.current = true; return; }
        urlTickerLoadedRef.current = true;
        setTickerInput(t);
        handleLoad(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading]);

    // ============================================================
    // 外部制御: forwardRef で loadTicker を公開
    // ============================================================
    useImperativeHandle(ref, () => ({
        loadTicker: (ticker: string) => {
            const t = normalizeTicker(ticker);
            if (!t) return;
            setTickerInput(t);
            // handleLoadRef.current を呼ぶことで stale closure を回避
            handleLoadRef.current(t);
        },
    }));

    // ============================================================
    // 手入力メモ専用行 — 編集ハンドラ
    // ============================================================
    const handleManualTableMemoEdit = useCallback(
        async (
            tableType: ManualTableType,
            rowIdx: number,
            colIdx: number,
            value: string,
        ) => {
            if (!activeTicker) return;
            const curMemos = manualTableMemosRef.current;
            const prevGrid = curMemos[tableType];
            const prevGridCopy = prevGrid.map((r) => [...r]);

            const newGrid = prevGrid.map((r) => [...r]);
            while (newGrid.length <= rowIdx) newGrid.push([]);
            while (newGrid[rowIdx].length <= colIdx) newGrid[rowIdx].push("");
            newGrid[rowIdx][colIdx] = value;

            pushUndo(`手入力メモ ${tableType} r${rowIdx}c${colIdx}`, () => {
                setManualTableMemos((prev) => ({ ...prev, [tableType]: prevGridCopy }));
                saveManualTableMemo(activeTicker, tableType, prevGridCopy).catch(console.error);
            });

            setManualTableMemos((prev) => ({ ...prev, [tableType]: newGrid }));

            try {
                await saveManualTableMemo(activeTicker, tableType, newGrid);
            } catch (err) {
                console.error("手入力メモ保存失敗:", err);
                setManualTableMemos((prev) => ({ ...prev, [tableType]: prevGridCopy }));
                setErrorMsg(`手入力メモ保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, pushUndo]
    );

    // ============================================================
    // segment_manual ヘッダー編集
    // ============================================================
    const handleSegmentManualHeaderEdit = useCallback(
        async (colIdx: number, value: string) => {
            if (!activeTicker) return;
            const prevHeaders = [...segmentManualHeaders];
            const newHeaders = [...segmentManualHeaders];
            newHeaders[colIdx] = value;
            setSegmentManualHeaders(newHeaders);
            try {
                await saveSegmentManualHeaders(activeTicker, newHeaders);
            } catch (err) {
                console.error("ヘッダー保存失敗:", err);
                setSegmentManualHeaders(prevHeaders);
                setErrorMsg(`ヘッダー保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, segmentManualHeaders]
    );

    /** segment_manual ペースト用バッチアップデート */
    const handleManualTableMemoGridUpdate = useCallback(
        async (tableType: ManualTableType, newGrid: string[][]) => {
            if (!activeTicker) return;

            const curMemos = manualTableMemosRef.current;
            const prevGrid = curMemos[tableType] ?? [];
            const prevCopy = prevGrid.map((r) => [...r]);
            setManualTableMemos((prev) => ({ ...prev, [tableType]: newGrid }));
            try {
                await saveManualTableMemo(activeTicker, tableType, newGrid);
            } catch (err) {
                console.error("手入力メモ一括保存失敗:", err);
                setManualTableMemos((prev) => ({ ...prev, [tableType]: prevCopy }));
                setErrorMsg(`手入力メモ保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker]
    );

    // ---- 企業マスタ lazy load ----
    const handleRequestMaster = useCallback(async () => {
        if (masterLoadedRef.current || masterLoadingRef.current) return;
        masterLoadingRef.current = true;
        try {
            const raw = await loadCompanyMaster();
            const normalized = preNormalizeCandidates(raw);
            setCompanyMaster(normalized);
            masterLoadedRef.current = true;
        } catch (err) {
            console.warn("[companies master] lazy load failed:", err);
        } finally {
            masterLoadingRef.current = false;
        }
    }, []);

    // ---- 候補選択 ----
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
            pushUndo(`KPIヘッダー ${kpiSlot}`, () => {
                setKpiDefs((d) => ({ ...d, [kpiSlot]: prev }));
                saveKpiDefinition(activeTicker, kpiSlot, prev ?? `KPI ${kpiSlot}`).catch(console.error);
            });
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
        async (period: string, quarter: string, kpiSlot: number, value: string, tableScope: "cum" | "q" = "cum") => {
            if (!activeTicker) return;
            const curKpiValues = kpiValuesRef.current;
            const key = `${tableScope}|${period}|${quarter}`;
            const prevValue = curKpiValues[key]?.[kpiSlot] ?? "";
            pushUndo(`KPI値 ${key} slot${kpiSlot}`, () => {
                setKpiValues((prev) => ({
                    ...prev,
                    [key]: { ...(prev[key] || {}), [kpiSlot]: prevValue },
                }));
                saveKpiValue(activeTicker, period, quarter, kpiSlot, prevValue, tableScope).catch(console.error);
            });
            setKpiValues((prev) => ({
                ...prev,
                [key]: { ...(prev[key] || {}), [kpiSlot]: value },
            }));
            try {
                await saveKpiValue(activeTicker, period, quarter, kpiSlot, value, tableScope);
            } catch (err) {
                console.error("KPI値保存失敗:", err);
                setKpiValues((prev) => ({
                    ...prev,
                    [key]: { ...(prev[key] || {}), [kpiSlot]: prevValue },
                }));
                setErrorMsg(`KPI値保存失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, pushUndo]
    );

    const handlePLMemoEdit = useCallback(
        async (period: string, quarter: string, colIdx: number, value: string) => {
            if (!activeTicker) return;
            const curMemoMap = memoMapRef.current;
            const memoKey = `${period}|${quarter}`;
            const existingGrid = curMemoMap[memoKey]
                ? curMemoMap[memoKey].map((row) => [...row])
                : createEmptyGrid();
            existingGrid[0][colIdx] = value;

            const prevGrid = curMemoMap[memoKey];
            const prevGridCopy = prevGrid ? prevGrid.map((row) => [...row]) : undefined;
            pushUndo(`メモ ${memoKey} col${colIdx}`, () => {
                if (prevGridCopy) {
                    setMemoMap((prev) => ({ ...prev, [memoKey]: prevGridCopy }));
                    saveGridMemo(activeTicker, period, quarter, prevGridCopy, user?.id).catch(console.error);
                } else {
                    setMemoMap((prev) => { const next = { ...prev }; delete next[memoKey]; return next; });
                }
            });

            setMemoMap((prev) => ({ ...prev, [memoKey]: existingGrid }));

            try {
                await saveGridMemo(activeTicker, period, quarter, existingGrid, user?.id);
            } catch (err) {
                console.error("PLメモ保存失敗:", err);
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
        [activeTicker, user, pushUndo]
    );

    const handlePLMemoPaste = useCallback(
        async (edits: { period: string; quarter: string; colIdx: number; value: string }[]) => {
            if (!activeTicker || edits.length === 0) return;
            const curMemoMap = memoMapRef.current;

            const byRow = new Map<string, { period: string; quarter: string; updates: { colIdx: number; value: string }[] }>();
            for (const edit of edits) {
                const key = `${edit.period}|${edit.quarter}`;
                if (!byRow.has(key)) byRow.set(key, { period: edit.period, quarter: edit.quarter, updates: [] });
                byRow.get(key)!.updates.push({ colIdx: edit.colIdx, value: edit.value });
            }

            const prevMemoMapCopy: MemoMapType = {};
            for (const key of Object.keys(curMemoMap)) {
                prevMemoMapCopy[key] = curMemoMap[key].map((row) => [...row]);
            }
            pushUndo(`メモペースト ${edits.length}セル`, () => {
                setMemoMap(prevMemoMapCopy);
                for (const [key, { period, quarter }] of byRow) {
                    const restoreGrid = prevMemoMapCopy[key] ?? createEmptyGrid();
                    saveGridMemo(activeTicker, period, quarter, restoreGrid, user?.id).catch(console.error);
                }
            });

            const newMemoMap = { ...curMemoMap };
            const prevMemoMap = { ...curMemoMap };
            for (const [key, { updates }] of byRow) {
                const grid = newMemoMap[key] ? newMemoMap[key].map((row) => [...row]) : createEmptyGrid();
                for (const { colIdx, value } of updates) grid[0][colIdx] = value;
                newMemoMap[key] = grid;
            }
            setMemoMap(newMemoMap);

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
        [activeTicker, user, pushUndo]
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

                    const stubs = generateMissingQuarterStubs(segments);
                    const withStubs = [...segments, ...stubs];
                    const resolved = resolveSegmentsWithOverrides(withStubs, newOverrides);
                    setResolvedSegments(resolved);
                }
            } catch (err) {
                console.error("Override save failed:", err);
                setErrorMsg(`手入力保存失敗: ${err instanceof Error ? err.message : String(err)}`);
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

                    const stubs = generateMissingQuarterStubs(segments);
                    const withStubs = [...segments, ...stubs];
                    const resolved = resolveSegmentsWithOverrides(withStubs, newOverrides);
                    setResolvedSegments(resolved);
                }
            } catch (err) {
                console.error("Override delete failed:", err);
                setErrorMsg(`手入力削除失敗: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [activeTicker, user, segments, segmentOverrides],
    );

    // ============================================================
    // Segment Override — Bulk Paste
    // ============================================================

    const handleBulkSaveOverrides = useCallback(
        async (items: SegmentOverrideSaveRequest[]): Promise<{ saved: number; failed: number }> => {
            if (!activeTicker || !user?.email) return { saved: 0, failed: items.length };

            const requests = items.map((item) => ({
                ...item,
                ticker: activeTicker,
            }));

            try {
                const result = await saveSegmentOverridesBulk(requests, user.email);

                if (result.saved.length > 0) {
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

                    const stubs = generateMissingQuarterStubs(segments);
                    const withStubs = [...segments, ...stubs];
                    const resolved = resolveSegmentsWithOverrides(withStubs, newOverrides);
                    setResolvedSegments(resolved);
                }

                return { saved: result.saved.length, failed: result.failed };
            } catch (err) {
                console.error("Bulk override save failed:", err);
                setErrorMsg(`一括保存失敗: ${err instanceof Error ? err.message : String(err)}`);
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

    // NOTE: 以下のコールバック・state は OrderKpiTable の将来の拡張用に定義済み。
    // 現在は OrderKpiTable の Props が { data, loading } のみのため未使用。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void [rejectedKpis, marketData, handleOrderKpiReview, handleRestoreOrderKpi, handleEditOrderKpiValue];

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

            {/* マーケット指標バー */}
            {activeTicker && (
                <ValuationCard valuation={valuation} loading={dataLoading} compact />
            )}

            {!activeTicker && status === "idle" && (
                <div className="placeholder">企業コードを入力して「読込」を押してください</div>
            )}

            {activeTicker && (
                <div className="company-page-x-scroll">
                    <div className="company-page-wide-content">
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
                                manualTableMemos={manualTableMemos}
                                onManualMemoEdit={handleManualTableMemoEdit}
                                onManualMemoGridUpdate={handleManualTableMemoGridUpdate}
                                segmentManualHeaders={segmentManualHeaders}
                                onSegmentManualHeaderEdit={handleSegmentManualHeaderEdit}
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
                    </div>
                </div>
            )}

            {xScrollMax > 0 && (
                <div className="custom-fixed-x-scroll">
                    <input
                        type="range"
                        min={0}
                        max={xScrollMax}
                        value={xScrollLeft}
                        onChange={(e) => {
                            const next = Number(e.target.value);
                            setXScrollLeft(next);
                            window.scrollTo({
                                left: next,
                                top: window.scrollY,
                                behavior: "auto",
                            });
                        }}
                        className="custom-fixed-x-scroll-range"
                        aria-label="横スクロール"
                    />
                </div>
            )}
        </div>
    );
});

CompanyViewer.displayName = "CompanyViewer";

export default CompanyViewer;
