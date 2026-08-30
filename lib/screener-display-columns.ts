export type MetricRange = { min?: string; max?: string };
export type ColumnOverrides = Record<string, boolean>;

export function activeRangeMetricKeys(
    ranges: Record<string, MetricRange>,
    metricOrder: readonly string[],
): string[] {
    return metricOrder.filter((key) => {
        const range = ranges[key];
        return (range?.min?.trim() ?? "") !== "" || (range?.max?.trim() ?? "") !== "";
    });
}

export function automaticMetricColumnKeys(
    ranges: Record<string, MetricRange>,
    metricOrder: readonly string[],
    sortMetric: string,
    sortWasExplicitlySelected: boolean,
): string[] {
    const active = new Set(activeRangeMetricKeys(ranges, metricOrder));
    if (sortWasExplicitlySelected && metricOrder.includes(sortMetric)) active.add(sortMetric);
    return metricOrder.filter((key) => active.has(key));
}

export function resolveMetricColumns(
    automaticKeys: readonly string[],
    overrides: ColumnOverrides,
    metricOrder: readonly string[],
): string[] {
    const automatic = new Set(automaticKeys);
    return metricOrder.filter((key) => overrides[key] === true || (automatic.has(key) && overrides[key] !== false));
}
