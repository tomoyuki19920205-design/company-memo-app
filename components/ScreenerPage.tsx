"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCREENER_METRICS, type ScreenerRow } from "@/lib/screener";
import {
    appendCategorySelections,
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

type Option = { code: string; name: string };
type Options = { markets: Option[]; sectors17: Option[]; sectors33: Option[] };
type Range = { min: string; max: string };
type DropTarget = { key: string; edge: "before" | "after" } | null;
type ReorderDragState = { sourceKey: string; startX: number; startY: number; active: boolean; target: DropTarget };

const METRIC_KEYS = new Set(SCREENER_METRICS.map((metric) => metric.key));
const METRIC_ORDER = SCREENER_METRICS.map((metric) => metric.key);
const METRIC_BY_KEY = new Map(SCREENER_METRICS.map((metric) => [metric.key, metric]));
const COLUMN_BY_KEY = new Map(SCREENER_COLUMN_DEFINITIONS.map((column) => [column.key, column]));

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

export default function ScreenerPage() {
    const [options, setOptions] = useState<Options>({ markets: [], sectors17: [], sectors33: [] });
    const [ranges, setRanges] = useState<Record<string, Range>>({});
    const [columns, setColumns] = useState<string[]>([]);
    const [columnOverrides, setColumnOverrides] = useState<ColumnOverrides>({});
    const [columnOrder, setColumnOrder] = useState(DEFAULT_SCREENER_COLUMN_ORDER);
    const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => normalizeColumnWidths(null));
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget>(null);
    const [resizingColumn, setResizingColumn] = useState<string | null>(null);
    const [markets, setMarkets] = useState<string[]>([]);
    const [sectors17, setSectors17] = useState<string[]>([]);
    const [sectors33, setSectors33] = useState<string[]>([]);
    const [flags, setFlags] = useState<Record<string, boolean>>({ exclude_stale: true });
    const [sort, setSort] = useState("market_cap");
    const [sortWasExplicitlySelected, setSortWasExplicitlySelected] = useState(false);
    const [direction, setDirection] = useState("desc");
    const [rows, setRows] = useState<ScreenerRow[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const reorderCleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const saved = loadScreenerColumnPreferences(window.localStorage);
        setColumnOrder(saved.order);
        setColumnWidths(saved.widths);
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

    const automaticColumns = useMemo(
        () => automaticMetricColumnKeys(ranges, METRIC_ORDER, sort, sortWasExplicitlySelected),
        [ranges, sort, sortWasExplicitlySelected],
    );

    useEffect(() => {
        setColumns((current) => {
            const next = resolveMetricColumns(automaticColumns, columnOverrides, METRIC_ORDER);
            return current.length === next.length && current.every((key, index) => key === next[index]) ? current : next;
        });
    }, [automaticColumns, columnOverrides]);

    useEffect(() => () => {
        resizeCleanupRef.current?.();
        reorderCleanupRef.current?.();
    }, []);

    useEffect(() => {
        fetch("/api/screener?mode=options").then((response) => response.json()).then((data) => {
            if (!data.error) setOptions(data);
        }).catch(() => undefined);
    }, []);

    const queryString = useCallback((targetPage: number) => {
        const params = new URLSearchParams({ page: String(targetPage), page_size: "50", columns: columns.join(","), sort, direction });
        for (const [key, range] of Object.entries(ranges)) {
            if (range.min !== "") params.set(`${key}_min`, range.min);
            if (range.max !== "") params.set(`${key}_max`, range.max);
        }
        appendCategorySelections(params, { markets, sectors17, sectors33 });
        for (const [key, enabled] of Object.entries(flags)) if (enabled) params.set(key, "true");
        return params.toString();
    }, [columns, direction, flags, markets, ranges, sectors17, sectors33, sort]);

    const search = useCallback(async (targetPage = 1) => {
        setLoading(true); setError("");
        try {
            const response = await fetch(`/api/screener?${queryString(targetPage)}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "検索に失敗しました");
            setRows(data.rows); setCount(data.count); setPage(data.page);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "検索に失敗しました");
        } finally { setLoading(false); }
    }, [queryString]);

    useEffect(() => { void search(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const visibleColumnDefinitions = useMemo(() => columnOrder
        .map((key) => COLUMN_BY_KEY.get(key))
        .filter((column): column is ScreenerColumnDefinition => !!column && (!METRIC_KEYS.has(column.key) || columns.includes(column.key))), [columnOrder, columns]);
    const totalTableWidth = useMemo(() => visibleColumnDefinitions.reduce((sum, column) => sum + columnWidths[column.key], 0), [columnWidths, visibleColumnDefinitions]);
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
            <div><h1>株式スクリーニング</h1><p>最新nightly snapshot・全{count.toLocaleString()}件</p></div>
            <Link href="/" className="screener-nav">Company Viewerへ</Link>
        </header>

        <section className="screener-panel">
            <h2>数値範囲</h2>
            <div className="range-grid">
                {SCREENER_METRICS.map((metric) => <div className="range-item" key={metric.key}>
                    <label>{metric.label}</label>
                    <div><input aria-label={`${metric.label} 下限`} type="number" step="any" placeholder="以上" value={ranges[metric.key]?.min ?? ""} onChange={(e) => setRanges((old) => ({ ...old, [metric.key]: { min: e.target.value, max: old[metric.key]?.max ?? "" } }))} />
                    <span>–</span><input aria-label={`${metric.label} 上限`} type="number" step="any" placeholder="以下" value={ranges[metric.key]?.max ?? ""} onChange={(e) => setRanges((old) => ({ ...old, [metric.key]: { min: old[metric.key]?.min ?? "", max: e.target.value } }))} /></div>
                </div>)}
            </div>
        </section>

        <section className="screener-panel filter-grid">
            <CheckboxFilterGroup filterKey="markets" label="上場市場" options={options.markets} selected={markets} setSelected={setMarkets} />
            <CheckboxFilterGroup filterKey="sectors17" label="17業種" options={options.sectors17} selected={sectors17} setSelected={setSectors17} includeSelectAll />
            <CheckboxFilterGroup filterKey="sectors33" label="33業種" options={options.sectors33} selected={sectors33} setSelected={setSectors33} includeSelectAll />
            <div className="flag-list"><span>条件</span>
                {([ ["new_ytd_high_last_5d", "年初来高値更新"], ["turnaround", "黒字転換"], ["loss_expansion", "赤字拡大"], ["profit_to_loss", "黒字→赤字"], ["exclude_stale", "stale price除外"] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={!!flags[key]} onChange={(e) => setFlags((old) => ({ ...old, [key]: e.target.checked }))} />{label}</label>)}
            </div>
        </section>

        <section className="screener-panel">
            <div className="screener-column-title"><h2>表示列</h2><button type="button" className="column-reset-button" onClick={resetColumnSettings}>列設定をリセット</button></div>
            <div className="column-selector">{SCREENER_METRICS.map((metric) => <label key={metric.key}><input type="checkbox" checked={columns.includes(metric.key)} onChange={(e) => setMetricColumnVisible(metric.key, e.target.checked)} />{metric.label}</label>)}</div>
            <div className="search-actions"><label>並び順<select value={sort} onChange={(e) => { const next = e.target.value; setSort(next); setSortWasExplicitlySelected(true); if (next === "forward_per_per_forecast_sales_growth") setDirection("asc"); }}>{SCREENER_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><select aria-label="昇順降順" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="desc">降順</option><option value="asc">昇順</option></select><button onClick={() => void search(1)} disabled={loading}>{loading ? "検索中…" : "検索"}</button></div>
        </section>

        {error && <p className="screener-error">{error}</p>}
        <div className="screener-results" data-testid="screener-results-scroll">
            <table style={{ width: `${totalTableWidth}px` }}>
                <colgroup>{visibleColumnDefinitions.map((column) => <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />)}</colgroup>
                <thead><tr>{visibleColumnDefinitions.map((column, columnIndex) => {
                    const dropClass = dropTarget?.key === column.key ? ` screener-drop-${dropTarget.edge}` : "";
                    return <th
                        key={column.key}
                        data-column-key={column.key}
                        aria-grabbed={draggedColumn === column.key}
                        className={`${column.numeric ? "screener-column-numeric" : "screener-column-text"}${draggedColumn === column.key ? " screener-column-dragging" : ""}${dropClass}`}
                        style={{ zIndex: visibleColumnDefinitions.length - columnIndex + 2 }}
                        onMouseDown={(event) => startReorder(event, column.key)}
                    ><span className="screener-header-label">{column.label}</span><span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`${column.label} 列幅変更`}
                        data-resize-key={column.key}
                        className={`screener-resize-handle${resizingColumn === column.key ? " is-resizing" : ""}`}
                        onMouseDown={(event) => startResize(event, column)}
                    /></th>;
                })}</tr></thead>
                <tbody>{rows.map((row) => <tr key={String(row.ticker)}>{visibleColumnDefinitions.map((column) => <td
                    key={column.key}
                    data-column-key={column.key}
                    className={column.numeric ? "screener-column-numeric" : "screener-column-text"}
                    title={String(row[column.key] ?? "")}
                >{renderCell(column.key, row)}</td>)}</tr>)}</tbody>
            </table>
        </div>
        <nav className="pagination"><button disabled={page <= 1 || loading} onClick={() => void search(page - 1)}>前へ</button><span>{page} / {Math.max(1, Math.ceil(count / 50))}</span><button disabled={page * 50 >= count || loading} onClick={() => void search(page + 1)}>次へ</button></nav>
    </main>;
}
