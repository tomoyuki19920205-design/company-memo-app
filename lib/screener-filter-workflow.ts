import { appendCategorySelections, type CategorySelections } from "./screener-category-filters";

export type FilterRange = { min: string; max: string };
export type ScreenerFilterState = CategorySelections & {
    ranges: Record<string, FilterRange>;
    flags: Record<string, boolean>;
    detailedKeys: string[];
};

export function createInitialFilterState(): ScreenerFilterState {
    return {
        ranges: {},
        flags: { exclude_stale: true },
        markets: [],
        sectors17: [],
        sectors33: [],
        detailedKeys: [],
    };
}

export function snapshotFilterState(filters: ScreenerFilterState): ScreenerFilterState {
    return {
        ranges: Object.fromEntries(Object.entries(filters.ranges).map(([key, range]) => [key, { ...range }])),
        flags: { ...filters.flags },
        markets: [...filters.markets],
        sectors17: [...filters.sectors17],
        sectors33: [...filters.sectors33],
        detailedKeys: [...filters.detailedKeys],
    };
}

export function buildScreenerQuery(args: {
    page: number;
    filters: ScreenerFilterState;
    columns: readonly string[];
    sort: string;
    direction: string;
}): string {
    const params = new URLSearchParams({
        page: String(args.page),
        page_size: "50",
        columns: args.columns.join(","),
        sort: args.sort,
        direction: args.direction,
    });
    for (const [key, range] of Object.entries(args.filters.ranges)) {
        if (range.min.trim() !== "") params.set(`${key}_min`, range.min);
        if (range.max.trim() !== "") params.set(`${key}_max`, range.max);
    }
    appendCategorySelections(params, args.filters);
    for (const [key, enabled] of Object.entries(args.filters.flags)) {
        if (enabled) params.set(key, "true");
    }
    return params.toString();
}
