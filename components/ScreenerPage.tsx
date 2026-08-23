"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScreenerChartGrid from "@/components/ScreenerChartGrid";
import { SCREENER_METRICS, type ScreenerRow } from "@/lib/screener";
import { CHART_PERIODS, type ChartPeriod, type ChartPricePoint } from "@/lib/screener-chart-data";
import { chartCardMetricKeys, loadChartPreference, type ChartViewMode } from "@/lib/screener-chart-ui";
import {
    selectionStatus,
    updateAllSelections,
    updateCodeSelection,
} from "@/lib/screener-category-filters";
import {
    DEFAULT_SCREENER_COLUMN_ORDER,
    SCREENER_COLUMN_DEFINITIONS,
    clearScreenerColumnPreferences,
    loadScreenerColumnPreferences,
    moveColumn,
    normalizeColumnWidths,
    saveScreenerColumnPreferences,
    updateColumnWidth,
    type ColumnWidths,
    type ScreenerColumnDefinition,
} from "@/lib/screener-column-preferences";
import {
    automaticMetricColumnKeys,
    resolveMetricColumns,
    type ColumnOverrides,
} from "@/lib/screener-display-columns";
import {
    DETAILED_FILTER_BY_KEY,
    DETAILED_FILTER_DEFINITIONS,
    DETAILED_FILTER_GROUPS,
    addDetailedFilter,
    filterDetailedDefinitions,
    removeDetailedFilter,
} from "@/lib/screener-filter-definitions";
import {
    buildScreenerQuery,
    createInitialFilterState,
    snapshotFilterState,
    type FilterRange,
    type ScreenerFilterState,
} from "@/lib/screener-filter-workflow";

type Option = { code: string; name: string };
type Options = { markets: Option[]; sectors17: Option[]; sectors33: Option[] };
type DropTarget = { key: string; edge: "before" | "after" } | null;
type ReorderDragState = { sourceKey: string; startX: number; startY: number; active: boolean; target: DropTarget };

const METRIC_KEYS = new Set(SCREENER_METRICS.map((metric) => metric.key));
const METRIC_ORDER = SCREENER_METRICS.map((metric) => metric.key);
const METRIC_BY_KEY = new Map(SCREENER_METRICS.map((metric) => [metric.key, metric]));
const COLUMN_BY_KEY = new Map(SCREENER_COLUMN_DEFINITIONS.map((column) => [column.key, column]));
const CHART_VIEW_MODE_KEY = "screener_result_view_mode";
const CHART_PERIOD_KEY = "screener_chart_period";
const CHART_VIEW_MODES: ChartViewMode[] = ["table", "chart"];

type CheckboxFilterGroupProps = {
    filterKey: "markets" | "sectors17" | "sectors33";
    label: string;
    options: Option[];
    selected: string[];
    setSelected: React.Dispatch<React.SetStateAction<string[]>>;
    includeSelectAll?: boolean;
};

function CheckboxFilterGroup({ filterKey, label, options, selected, setSelected, includeSelectAll = false }: CheckboxFilterGroupProps) {
    const selectAllRef = useRef<HTMLInputElement>(null);
    const optionCodes = useMemo(() => options.map((option) => option.code), [options]);
    const status = selectionStatus(selected, optionCodes);

    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = status.indeterminate;
    }, [status.indeterminate]);

    return <fieldset className="checkbox-filter-group" data-filter-group={filterKey}>
        <legend>{label}</legend>
        <div className="checkbox-filter-list">
            {includeSelectAll && <label className="checkbox-filter-option checkbox-filter-select-all">
                <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label={`${label} 全選択`}
                    checked={status.all}
                    onChange={(event) => setSelected(updateAllSelections(optionCodes, event.target.checked))}
                />
                <span>全選択</span>
            </label>}
            {options.map((option) => {
                const id = `screener-${filterKey}-${option.code}`;
                return <label className="checkbox-filter-option" htmlFor={id} key={option.code}>
                    <input
                        id={id}
                        type="checkbox"
                        value={option.code}
                        checked={selected.includes(option.code)}
                        onChange={(event) => setSelected((current) => updateCodeSelection(current, option.code, event.target.checked))}
                    />
                    <span>{option.name}</span>
                </label>;
            })}
        </div>
    </fieldset>;
}

function MetricPicker({ selectedKeys, onSelect, onClose }: {
    selectedKeys: string[];
    onSelect: (key: string) => void;
    onClose: () => void;
}) {
    const [search, setSearch] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    const filtered = useMemo(() => filterDetailedDefinitions(search), [search]);

    useEffect(() => {
        searchRef.current?.focus();
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    return <div className="metric-picker-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
    }}>
        <section className="metric-picker" role="dialog" aria-modal="true" aria-labelledby="metric-picker-title">
            <header>
                <div><h2 id="metric-picker-title">詳細検索項目</h2><p>利用する検索条件を選択してください</p></div>
                <button type="button" className="metric-picker-close" aria-label="詳細検索項目を閉じる" onClick={onClose}>×</button>
            </header>
            <input ref={searchRef} className="metric-picker-search" type="search" placeholder="検索項目を検索..." aria-label="検索項目を検索" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="metric-picker-groups">
                {DETAILED_FILTER_GROUPS.map((group) => {
                    const definitions = filtered.filter((definition) => definition.group === group);
                    if (!definitions.length) return null;
                    return <section className="metric-picker-group" key={group}>
                        <h3>{group}</h3>
                        <div>{definitions.map((definition) => {
                            const added = selectedKeys.includes(definition.key);
                            return <button type="button" key={definition.key} disabled={added} onClick={() => { onSelect(definition.key); onClose(); }}>
                                <span>{definition.label}</span>{added && <small>✓ 追加済み</small>}
                            </button>;
                        })}</div>
                    </section>;
                })}
                {!filtered.length && <p className="metric-picker-empty">一致する検索項目はありません。</p>}
            </div>
        </section>
    </div>;
}

function optionName(options: Option[], code: string) {
    return options.find((option) => option.code === code)?.name ?? code;
}

export default function ScreenerPage() {
    const [options, setOptions] = useState<Options>({ markets: [], sectors17: [], sectors33: [] });
    const [draftFilters, setDraftFiltersState] = useState<ScreenerFilterState>(() => createInitialFilterState());
    const draftFiltersRef = useRef(draftFilters);
    const setDraftFilters = useCallback((update: React.SetStateAction<ScreenerFilterState>) => {
        const next = typeof update === "function" ? update(draftFiltersRef.current) : update;
        draftFiltersRef.current = next;
        setDraftFiltersState(next);
    }, []);
    const [appliedFilters, setAppliedFilters] = useState<ScreenerFilterState>(() => createInitialFilterState());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [columnOverrides, setColumnOverrides] = useState<ColumnOverrides>({});
    const [columnOrder, setColumnOrder] = useState(DEFAULT_SCREENER_COLUMN_ORDER);
    const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => normalizeColumnWidths(null));
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget>(null);
    const [resizingColumn, setResizingColumn] = useState<string | null>(null);
    const [sort, setSort] = useState("market_cap");
    const [sortWasExplicitlySelected, setSortWasExplicitlySelected] = useState(false);
    const [direction, setDirection] = useState("desc");
    const [rows, setRows] = useState<ScreenerRow[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [viewMode, setViewMode] = useState<ChartViewMode>("table");
    const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("6m");
    const [chartSeries, setChartSeries] = useState<Record<string, ChartPricePoint[]>>({});
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState("");
    const chartCacheRef = useRef(new Map<string, ChartPricePoint[]>());
    const chartAbortRef = useRef<AbortController | null>(null);
    const chartRequestRef = useRef(0);
    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const reorderCleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const saved = loadScreenerColumnPreferences(window.localStorage);
        setColumnOrder(saved.order);
        setColumnWidths(saved.widths);
        setViewMode(loadChartPreference(window.localStorage, CHART_VIEW_MODE_KEY, CHART_VIEW_MODES, "table"));
        setChartPeriod(loadChartPreference(window.localStorage, CHART_PERIOD_KEY, CHART_PERIODS, "6m"));
        setPreferencesReady(true);
    }, []);

    useEffect(() => {
        if (!preferencesReady) return;
        try {
            saveScreenerColumnPreferences(window.localStorage, columnOrder, columnWidths);
        } catch {
            // Storage can be unavailable in privacy mode; table interaction still works in memory.
        }
    }, [columnOrder, columnWidths, preferencesReady]);

    useEffect(() => {
        if (!preferencesReady) return;
        try {
            window.localStorage.setItem(CHART_VIEW_MODE_KEY, viewMode);
            window.localStorage.setItem(CHART_PERIOD_KEY, chartPeriod);
        } catch {
            // Preferences remain usable for this session when storage is unavailable.
        }
    }, [chartPeriod, preferencesReady, viewMode]);

    const automaticColumns = useMemo(
        () => automaticMetricColumnKeys(appliedFilters.ranges, METRIC_ORDER, sort, sortWasExplicitlySelected),
        [appliedFilters.ranges, sort, sortWasExplicitlySelected],
    );
    const requestedColumns = useMemo(
        () => resolveMetricColumns(automaticColumns, columnOverrides, METRIC_ORDER),
        [automaticColumns, columnOverrides],
    );

    useEffect(() => {
        setColumns((current) => {
            const next = requestedColumns;
            return current.length === next.length && current.every((key, index) => key === next[index]) ? current : next;
        });
    }, [requestedColumns]);

    useEffect(() => () => {
        resizeCleanupRef.current?.();
        reorderCleanupRef.current?.();
        chartAbortRef.current?.abort();
    }, []);

    useEffect(() => {
        fetch("/api/screener?mode=options").then((response) => response.json()).then((data) => {
            if (!data.error) setOptions(data);
        }).catch(() => undefined);
    }, []);

    const columnsForRequest = useCallback((filters: ScreenerFilterState, sortMetric: string, sortExplicit: boolean) => {
        const automatic = automaticMetricColumnKeys(filters.ranges, METRIC_ORDER, sortMetric, sortExplicit);
        return resolveMetricColumns(automatic, columnOverrides, METRIC_ORDER);
    }, [columnOverrides]);

    const executeSearch = useCallback(async (
        targetPage = 1,
        filters = appliedFilters,
        sortMetric = sort,
        sortDirection = direction,
        sortExplicit = sortWasExplicitlySelected,
    ) => {
        setLoading(true);
        setError("");
        try {
            const query = buildScreenerQuery({
                page: targetPage,
                filters,
                columns: columnsForRequest(filters, sortMetric, sortExplicit),
                sort: sortMetric,
                direction: sortDirection,
            });
            const response = await fetch(`/api/screener?${query}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "検索に失敗しました");
            setRows(data.rows); setCount(data.count); setPage(data.page);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "検索に失敗しました");
        } finally { setLoading(false); }
    }, [appliedFilters, columnsForRequest, direction, sort, sortWasExplicitlySelected]);

    useEffect(() => {
        void executeSearch(1, createInitialFilterState(), "market_cap", "desc", false);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (viewMode !== "chart") return;
        const tickers = rows.map((row) => String(row.ticker)).filter(Boolean);
        const currentSeries = Object.fromEntries(tickers.filter((ticker) => chartCacheRef.current.has(ticker)).map((ticker) => [ticker, chartCacheRef.current.get(ticker)!]));
        setChartSeries(currentSeries);
        const missing = tickers.filter((ticker) => !chartCacheRef.current.has(ticker));
        chartAbortRef.current?.abort();
        if (!missing.length) { setChartLoading(false); setChartError(""); return; }
        const controller = new AbortController();
        const requestId = ++chartRequestRef.current;
        chartAbortRef.current = controller;
        setChartLoading(true);
        setChartError("");
        fetch(`/api/screener/charts?tickers=${encodeURIComponent(missing.join(","))}&period=1y`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "チャート取得に失敗しました");
                if (requestId !== chartRequestRef.current) return;
                const failedTickers = new Set<string>(data.failedTickers ?? []);
                for (const ticker of missing) if (!failedTickers.has(ticker)) chartCacheRef.current.set(ticker, data.series?.[ticker] ?? []);
                setChartSeries(Object.fromEntries(tickers.filter((ticker) => chartCacheRef.current.has(ticker)).map((ticker) => [ticker, chartCacheRef.current.get(ticker)!])));
                if (failedTickers.size) setChartError(`${failedTickers.size}銘柄のチャート取得に失敗しました`);
            })
            .catch((reason) => {
                if (reason instanceof DOMException && reason.name === "AbortError") return;
                if (requestId === chartRequestRef.current) setChartError(reason instanceof Error ? reason.message : "チャート取得に失敗しました");
            })
            .finally(() => {
                if (requestId === chartRequestRef.current) setChartLoading(false);
            });
        return () => controller.abort();
    }, [rows, viewMode]);

    const applyDraftAndSearch = () => {
        const next = snapshotFilterState(draftFiltersRef.current);
        setAppliedFilters(next);
        void executeSearch(1, next);
    };

    const changeSort = (nextSort: string) => {
        const nextDirection = nextSort === "forward_per_per_forecast_sales_growth" ? "asc" : direction;
        setSort(nextSort);
        setDirection(nextDirection);
        setSortWasExplicitlySelected(true);
        void executeSearch(1, appliedFilters, nextSort, nextDirection, true);
    };

    const changeDirection = (nextDirection: string) => {
        setDirection(nextDirection);
        void executeSearch(1, appliedFilters, sort, nextDirection, true);
    };

    const setDraftList = (key: "markets" | "sectors17" | "sectors33"): React.Dispatch<React.SetStateAction<string[]>> => (update) => {
        setDraftFilters((current) => ({
            ...current,
            [key]: typeof update === "function" ? update(current[key]) : update,
        }));
    };

    const updateDraftRange = (key: string, field: keyof FilterRange, value: string) => {
        setDraftFilters((current) => {
            const range = current.ranges[key] ?? { min: "", max: "" };
            return { ...current, ranges: { ...current.ranges, [key]: { ...range, [field]: value } } };
        });
    };

    const addFilter = (key: string) => {
        setDraftFilters((current) => ({ ...current, detailedKeys: addDetailedFilter(current.detailedKeys, key) }));
    };

    const removeFilter = (key: string) => {
        setDraftFilters((current) => {
            const ranges = { ...current.ranges };
            const flags = { ...current.flags };
            delete ranges[key];
            delete flags[key];
            return { ...current, ranges, flags, detailedKeys: removeDetailedFilter(current.detailedKeys, key) };
        });
    };

    const appliedSummary = useMemo(() => {
        const summary: string[] = [];
        for (const key of appliedFilters.detailedKeys) {
            const definition = DETAILED_FILTER_BY_KEY.get(key);
            if (!definition) continue;
            if (definition.kind === "boolean") {
                if (appliedFilters.flags[key]) summary.push(definition.label);
                continue;
            }
            const range = appliedFilters.ranges[key];
            if (range?.min.trim()) summary.push(`${definition.label} ≥ ${range.min}`);
            if (range?.max.trim()) summary.push(`${definition.label} ≤ ${range.max}`);
        }
        summary.push(...appliedFilters.markets.map((code) => optionName(options.markets, code)));
        summary.push(...appliedFilters.sectors17.map((code) => optionName(options.sectors17, code)));
        summary.push(...appliedFilters.sectors33.map((code) => optionName(options.sectors33, code)));
        if (appliedFilters.flags.exclude_stale) summary.push("stale price除外");
        return summary;
    }, [appliedFilters, options]);

    const visibleColumnDefinitions = useMemo(() => columnOrder
        .map((key) => COLUMN_BY_KEY.get(key))
        .filter((column): column is ScreenerColumnDefinition => !!column && (!METRIC_KEYS.has(column.key) || columns.includes(column.key))), [columnOrder, columns]);
    const totalTableWidth = useMemo(() => visibleColumnDefinitions.reduce((sum, column) => sum + columnWidths[column.key], 0), [columnWidths, visibleColumnDefinitions]);
    const chartMetricKeys = useMemo(() => chartCardMetricKeys(appliedFilters, METRIC_ORDER, sort, sortWasExplicitlySelected), [appliedFilters, sort, sortWasExplicitlySelected]);
    const chartBooleanKeys = useMemo(() => appliedFilters.detailedKeys.filter((key) => !!appliedFilters.flags[key] && !METRIC_KEYS.has(key)), [appliedFilters]);
    const format = (value: unknown, digits = 2) => value === null || value === undefined ? "—" : Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });

    const startResize = (event: React.MouseEvent<HTMLSpanElement>, column: ScreenerColumnDefinition) => {
        event.preventDefault();
        event.stopPropagation();
        resizeCleanupRef.current?.();
        const startX = event.clientX;
        const startWidth = columnWidths[column.key];
        setResizingColumn(column.key);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const handleMove = (moveEvent: MouseEvent) => {
            setColumnWidths((current) => updateColumnWidth(current, column.key, startWidth + moveEvent.clientX - startX));
        };
        const cleanup = () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleEnd);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            setResizingColumn(null);
            resizeCleanupRef.current = null;
        };
        const handleEnd = () => cleanup();
        resizeCleanupRef.current = cleanup;
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleEnd);
    };

    const startReorder = (event: React.MouseEvent<HTMLTableCellElement>, sourceKey: string) => {
        if (event.button !== 0 || resizingColumn) return;
        event.preventDefault();
        reorderCleanupRef.current?.();
        const state: ReorderDragState = { sourceKey, startX: event.clientX, startY: event.clientY, active: false, target: null };
        document.body.style.userSelect = "none";

        const handleMove = (moveEvent: MouseEvent) => {
            if (!state.active && Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY) < 5) return;
            if (!state.active) {
                state.active = true;
                setDraggedColumn(sourceKey);
                document.body.style.cursor = "grabbing";
            }
            const targetHeader = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>("th[data-column-key]");
            const targetKey = targetHeader?.dataset.columnKey;
            if (!targetHeader || !targetKey || targetKey === sourceKey) {
                state.target = null;
                setDropTarget(null);
                return;
            }
            const bounds = targetHeader.getBoundingClientRect();
            state.target = { key: targetKey, edge: moveEvent.clientX < bounds.left + bounds.width / 2 ? "before" : "after" };
            setDropTarget(state.target);
        };
        const cleanup = () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleEnd);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            setDraggedColumn(null);
            setDropTarget(null);
            reorderCleanupRef.current = null;
        };
        const handleEnd = () => {
            if (state.active && state.target) {
                setColumnOrder((current) => moveColumn(current, sourceKey, state.target!.key, state.target!.edge));
            }
            cleanup();
        };
        reorderCleanupRef.current = cleanup;
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleEnd);
    };

    const resetColumnSettings = () => {
        clearScreenerColumnPreferences(window.localStorage);
        setColumnOrder(DEFAULT_SCREENER_COLUMN_ORDER);
        setColumnWidths(normalizeColumnWidths(null));
        setColumnOverrides({});
        setColumns(automaticColumns);
        setDraggedColumn(null);
        setDropTarget(null);
    };

    const setMetricColumnVisible = (key: string, visible: boolean) => {
        setColumnOverrides((current) => ({ ...current, [key]: visible }));
        setColumns((current) => visible
            ? (current.includes(key) ? current : METRIC_ORDER.filter((metricKey) => current.includes(metricKey) || metricKey === key))
            : current.filter((metricKey) => metricKey !== key));
    };

    const renderCell = (columnKey: string, row: ScreenerRow) => {
        switch (columnKey) {
            case "ticker": return <Link href={`/?ticker=${row.ticker}`}>{row.ticker}</Link>;
            case "company_name": return <Link href={`/?ticker=${row.ticker}`}>{row.company_name}</Link>;
            case "market": return row.market_name ?? row.market_code;
            case "sector33": return row.sector33_name ?? row.sector33_code;
            case "price": return format(row.latest_valid_price, 2);
            case "price_status": return <>{row.price_as_of}<br/><small>{row.price_status}{Number(row.price_stale_sessions) > 0 ? ` (${row.price_stale_sessions}営業日)` : ""}</small></>;
            default: {
                const metric = METRIC_BY_KEY.get(columnKey);
                return format(row[columnKey], metric?.digits);
            }
        }
    };

    return <main className="screener-page">
        <header className="screener-titlebar">
            <div><h1>株式スクリーニング</h1><p>最新nightly snapshot</p></div>
            <Link href="/" className="screener-nav">Company Viewerへ</Link>
        </header>

        <div className="screener-workspace">
            <aside className="screener-condition-pane">
                <div className="condition-pane-header">
                    <div><h2>条件指定</h2><p>条件を組み立てて検索します</p></div>
                    <button type="button" onClick={() => setDraftFilters(createInitialFilterState())}>条件をクリア</button>
                </div>

                <details className="condition-accordion">
                    <summary><span>市場</span><small>{draftFilters.markets.length ? `${draftFilters.markets.length}件選択` : "指定なし"}</small></summary>
                    <div className="condition-accordion-body"><CheckboxFilterGroup filterKey="markets" label="上場市場" options={options.markets} selected={draftFilters.markets} setSelected={setDraftList("markets")} /></div>
                </details>

                <details className="condition-accordion">
                    <summary><span>種別</span><small>普通株</small></summary>
                    <div className="condition-accordion-body type-filter-list">
                        <label><input type="checkbox" checked disabled />普通株</label>
                        <p>現在のscreening universeは普通株3,889銘柄です。</p>
                        <label><input type="checkbox" checked={!!draftFilters.flags.exclude_stale} onChange={(event) => setDraftFilters((current) => ({ ...current, flags: { ...current.flags, exclude_stale: event.target.checked } }))} />stale priceを除外</label>
                    </div>
                </details>

                <details className="condition-accordion">
                    <summary><span>業種</span><small>{draftFilters.sectors17.length + draftFilters.sectors33.length ? `${draftFilters.sectors17.length + draftFilters.sectors33.length}件選択` : "指定なし"}</small></summary>
                    <div className="condition-accordion-body industry-filter-sections">
                        <CheckboxFilterGroup filterKey="sectors17" label="17業種" options={options.sectors17} selected={draftFilters.sectors17} setSelected={setDraftList("sectors17")} includeSelectAll />
                        <CheckboxFilterGroup filterKey="sectors33" label="33業種" options={options.sectors33} selected={draftFilters.sectors33} setSelected={setDraftList("sectors33")} includeSelectAll />
                    </div>
                </details>

                <details className="condition-accordion" open>
                    <summary><span>詳細検索項目</span><small>{draftFilters.detailedKeys.length ? `${draftFilters.detailedKeys.length}件` : "未追加"}</small></summary>
                    <div className="condition-accordion-body detailed-filter-stack">
                        {draftFilters.detailedKeys.map((key) => {
                            const definition = DETAILED_FILTER_BY_KEY.get(key);
                            if (!definition) return null;
                            const range = draftFilters.ranges[key] ?? { min: "", max: "" };
                            return <section className="filter-condition-card" key={key} data-filter-key={key}>
                                <header><h3>{definition.label}</h3><button type="button" aria-label={`${definition.label}を削除`} onClick={() => removeFilter(key)}>×</button></header>
                                {definition.kind === "range" ? <div className="condition-range-inputs">
                                    <label>以上<input aria-label={`${definition.label} 下限`} type="number" step="any" value={range.min} onChange={(event) => updateDraftRange(key, "min", event.target.value)} /></label>
                                    <span>～</span>
                                    <label>以下<input aria-label={`${definition.label} 上限`} type="number" step="any" value={range.max} onChange={(event) => updateDraftRange(key, "max", event.target.value)} /></label>
                                </div> : <label className="condition-boolean-input"><input type="checkbox" checked={!!draftFilters.flags[key]} onChange={(event) => setDraftFilters((current) => ({ ...current, flags: { ...current.flags, [key]: event.target.checked } }))} />条件を有効にする</label>}
                            </section>;
                        })}
                        {draftFilters.detailedKeys.length < DETAILED_FILTER_DEFINITIONS.length && <button type="button" className="add-filter-button" onClick={() => setPickerOpen(true)}>＋ 検索条件を追加</button>}
                    </div>
                </details>

                <button type="button" className="apply-search-button" onClick={applyDraftAndSearch} disabled={loading}>{loading ? "検索中…" : "検索"}</button>
            </aside>

            <section className="screener-result-pane">
                <header className="result-pane-header">
                    <div><h2>検索結果</h2><p><strong>{count.toLocaleString()}</strong>件</p></div>
                    <div className="search-actions">
                        <label>並び順<select value={sort} onChange={(event) => changeSort(event.target.value)}>{SCREENER_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>
                        <select aria-label="昇順降順" value={direction} onChange={(event) => changeDirection(event.target.value)}><option value="desc">降順</option><option value="asc">昇順</option></select>
                    </div>
                </header>

                <div className="result-view-toolbar">
                    <div className="result-view-toggle" role="group" aria-label="表示形式">
                        <button type="button" aria-pressed={viewMode === "table"} className={viewMode === "table" ? "is-active" : ""} onClick={() => setViewMode("table")}>表</button>
                        <button type="button" aria-pressed={viewMode === "chart"} className={viewMode === "chart" ? "is-active" : ""} onClick={() => setViewMode("chart")}>チャート</button>
                    </div>
                    {viewMode === "chart" && <div className="chart-period-selector" role="group" aria-label="チャート期間">
                        <span>期間</span>{CHART_PERIODS.map((period) => <button type="button" key={period} aria-pressed={chartPeriod === period} className={chartPeriod === period ? "is-active" : ""} onClick={() => setChartPeriod(period)}>{period.toUpperCase()}</button>)}
                    </div>}
                </div>

                <div className="applied-filter-summary" aria-label="適用中の条件">
                    {appliedSummary.length ? appliedSummary.map((item, index) => <span key={`${item}-${index}`}>{item}</span>) : <small>詳細条件なし</small>}
                </div>

                {viewMode === "table" && <details className="result-column-settings">
                    <summary>表示列</summary>
                    <div className="screener-column-title"><p>任意の列を追加・削除できます</p><button type="button" className="column-reset-button" onClick={resetColumnSettings}>列設定をリセット</button></div>
                    <div className="column-selector">{SCREENER_METRICS.map((metric) => <label key={metric.key}><input type="checkbox" checked={columns.includes(metric.key)} onChange={(event) => setMetricColumnVisible(metric.key, event.target.checked)} />{metric.label}</label>)}</div>
                </details>}

                {error && <p className="screener-error">{error}</p>}
                {viewMode === "table" ? <div className="screener-results" data-testid="screener-results-scroll">
                    <table style={{ width: `${totalTableWidth}px` }}>
                        <colgroup>{visibleColumnDefinitions.map((column) => <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />)}</colgroup>
                        <thead><tr>{visibleColumnDefinitions.map((column, columnIndex) => {
                            const dropClass = dropTarget?.key === column.key ? ` screener-drop-${dropTarget.edge}` : "";
                            return <th key={column.key} data-column-key={column.key} aria-grabbed={draggedColumn === column.key} className={`${column.numeric ? "screener-column-numeric" : "screener-column-text"}${draggedColumn === column.key ? " screener-column-dragging" : ""}${dropClass}`} style={{ zIndex: visibleColumnDefinitions.length - columnIndex + 2 }} onMouseDown={(event) => startReorder(event, column.key)}>
                                <span className="screener-header-label">{column.label}</span><span role="separator" aria-orientation="vertical" aria-label={`${column.label} 列幅変更`} data-resize-key={column.key} className={`screener-resize-handle${resizingColumn === column.key ? " is-resizing" : ""}`} onMouseDown={(event) => startResize(event, column)} />
                            </th>;
                        })}</tr></thead>
                        <tbody>{rows.map((row) => <tr key={String(row.ticker)}>{visibleColumnDefinitions.map((column) => <td key={column.key} data-column-key={column.key} className={column.numeric ? "screener-column-numeric" : "screener-column-text"} title={String(row[column.key] ?? "")}>{renderCell(column.key, row)}</td>)}</tr>)}</tbody>
                    </table>
                </div> : <ScreenerChartGrid rows={rows} series={chartSeries} period={chartPeriod} metricKeys={chartMetricKeys} booleanKeys={chartBooleanKeys} loading={chartLoading} error={chartError} />}
                {viewMode === "chart" && chartError && <p className="screener-error">{chartError}</p>}
                <nav className="pagination"><button disabled={page <= 1 || loading} onClick={() => void executeSearch(page - 1)}>前へ</button><span>{page} / {Math.max(1, Math.ceil(count / 50))}</span><button disabled={page * 50 >= count || loading} onClick={() => void executeSearch(page + 1)}>次へ</button></nav>
            </section>
        </div>

        {pickerOpen && <MetricPicker selectedKeys={draftFilters.detailedKeys} onSelect={addFilter} onClose={() => setPickerOpen(false)} />}
    </main>;
}
