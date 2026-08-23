import type { ScreenerFilterState } from "./screener-filter-workflow";

export type ChartViewMode = "table" | "chart";

export function chartCardMetricKeys(
    filters: ScreenerFilterState,
    metricOrder: readonly string[],
    sortMetric: string,
    sortWasExplicitlySelected: boolean,
): string[] {
    const selected = new Set<string>();
    for (const key of filters.detailedKeys) {
        const range = filters.ranges[key];
        if ((range?.min.trim() ?? "") !== "" || (range?.max.trim() ?? "") !== "" || filters.flags[key]) selected.add(key);
    }
    if (sortWasExplicitlySelected) selected.add(sortMetric);
    return metricOrder.filter((key) => selected.has(key));
}

export function latestChartReturn(points: readonly { close: number }[]): number | null {
    if (points.length < 2 || points[points.length - 2].close === 0) return null;
    return (points[points.length - 1].close / points[points.length - 2].close - 1) * 100;
}

export function loadChartPreference<T extends string>(storage: Pick<Storage, "getItem">, key: string, allowed: readonly T[], fallback: T): T {
    const value = storage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
}
