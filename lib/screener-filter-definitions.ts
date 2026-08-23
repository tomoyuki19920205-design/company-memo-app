import { BOOLEAN_FILTER_DEFINITIONS, SCREENER_METRICS } from "./screener";
import { TECHNICAL_FAMILIES } from "./screener-technical-filters";

export type DetailedFilterKind = "range" | "boolean" | "technical_range" | "technical_boolean";
export type DetailedFilterGroup = "バリュエーション" | "業績・財務" | "株価・モメンタム" | "上方修正";
export type DetailedFilterDefinition = {
    key: string;
    label: string;
    kind: DetailedFilterKind;
    group: DetailedFilterGroup;
};

const VALUATION_KEYS = new Set([
    "forward_per", "actual_per", "actual_dividend_yield_pct", "forecast_dividend_yield_pct",
    "market_cap", "forward_per_per_forecast_sales_growth", "forward_peg",
]);
const PRICE_KEYS = new Set([
    "bullish_candle_ratio_1d_pct",
    "bullish_candle_ratio_3d_pct", "bullish_candle_ratio_5d_pct", "bullish_candle_ratio_10d_pct",
    "bearish_candle_ratio_1d_pct",
    "bearish_candle_ratio_3d_pct", "bearish_candle_ratio_5d_pct", "bearish_candle_ratio_10d_pct",
    "return_1d_pct", "return_5d_pct", "return_20d_pct", "return_60d_pct",
    "rise_rate_1d_pct", "rise_rate_5d_pct", "rise_rate_20d_pct", "rise_rate_60d_pct",
    "decline_rate_1d_pct", "decline_rate_5d_pct", "decline_rate_20d_pct", "decline_rate_60d_pct",
    "psychological_line_1d_pct", "psychological_line_3d_pct", "psychological_line_5d_pct", "psychological_line_10d_pct",
    "new_ytd_high_last_1d", "new_ytd_high_last_3d", "new_ytd_high_last_5d", "new_ytd_high_last_10d",
]);
const TECHNICAL_BACKEND_KEYS = new Set(PRICE_KEYS);
const TECHNICAL_BOOLEAN_KEYS = new Set(["new_ytd_high_last_1d", "new_ytd_high_last_3d", "new_ytd_high_last_5d", "new_ytd_high_last_10d"]);
const REVISION_KEYS = new Set([
    "op_upward_revision_count_3y", "any_earnings_upward_revision_event_count_3y",
]);

function numericGroup(key: string): DetailedFilterGroup {
    if (VALUATION_KEYS.has(key)) return "バリュエーション";
    if (PRICE_KEYS.has(key)) return "株価・モメンタム";
    if (REVISION_KEYS.has(key)) return "上方修正";
    return "業績・財務";
}

function booleanGroup(key: string): DetailedFilterGroup {
    return key === "new_ytd_high_last_5d" ? "株価・モメンタム" : "業績・財務";
}

export const DETAILED_FILTER_DEFINITIONS: DetailedFilterDefinition[] = [
    ...SCREENER_METRICS.filter((metric) => !TECHNICAL_BACKEND_KEYS.has(metric.key)).map((metric) => ({
        key: metric.key,
        label: metric.label,
        kind: "range" as const,
        group: numericGroup(metric.key),
    })),
    ...BOOLEAN_FILTER_DEFINITIONS.filter((filter) => !TECHNICAL_BOOLEAN_KEYS.has(filter.key)).map((filter) => ({
        key: filter.key,
        label: filter.label,
        kind: "boolean" as const,
        group: booleanGroup(filter.key),
    })),
    ...TECHNICAL_FAMILIES.map((definition) => ({
        key: `technical:${definition.family}`,
        label: definition.label,
        kind: definition.kind === "range" ? "technical_range" as const : "technical_boolean" as const,
        group: "株価・モメンタム" as const,
    })),
];

export const DETAILED_FILTER_BY_KEY = new Map(DETAILED_FILTER_DEFINITIONS.map((filter) => [filter.key, filter]));
export const DETAILED_FILTER_GROUPS: DetailedFilterGroup[] = ["バリュエーション", "業績・財務", "株価・モメンタム", "上方修正"];

export function filterDetailedDefinitions(search: string): DetailedFilterDefinition[] {
    const normalized = search.trim().toLocaleLowerCase("ja-JP");
    if (!normalized) return DETAILED_FILTER_DEFINITIONS;
    return DETAILED_FILTER_DEFINITIONS.filter((filter) =>
        filter.label.toLocaleLowerCase("ja-JP").includes(normalized),
    );
}

export function addDetailedFilter(keys: string[], key: string): string[] {
    if (!DETAILED_FILTER_BY_KEY.has(key) || keys.includes(key)) return keys;
    return [...keys, key];
}

export function removeDetailedFilter(keys: string[], key: string): string[] {
    return keys.filter((candidate) => candidate !== key);
}
