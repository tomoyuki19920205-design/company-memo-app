export type TechnicalMetricFamily =
    | "bullish_candle_ratio"
    | "bearish_candle_ratio"
    | "psychological_line"
    | "new_ytd_high"
    | "rise_rate"
    | "decline_rate";
export type TechnicalPeriod = "1d" | "3d" | "5d" | "10d" | "20d" | "60d";
export type TechnicalFilter = {
    id: string;
    family: TechnicalMetricFamily;
    period: TechnicalPeriod;
    min: string;
    max: string;
    enabled: boolean;
};
export type TechnicalFamilyDefinition = {
    family: TechnicalMetricFamily;
    label: string;
    kind: "range" | "boolean";
    periods: readonly TechnicalPeriod[];
    defaultPeriod: TechnicalPeriod;
};

const SESSION_PERIODS = ["1d", "3d", "5d", "10d"] as const;
const RETURN_PERIODS = ["1d", "5d", "20d", "60d"] as const;

export const TECHNICAL_FAMILIES: readonly TechnicalFamilyDefinition[] = [
    { family: "bullish_candle_ratio", label: "陽線率", kind: "range", periods: SESSION_PERIODS, defaultPeriod: "3d" },
    { family: "bearish_candle_ratio", label: "陰線率", kind: "range", periods: SESSION_PERIODS, defaultPeriod: "3d" },
    { family: "psychological_line", label: "心理線", kind: "range", periods: SESSION_PERIODS, defaultPeriod: "5d" },
    { family: "new_ytd_high", label: "年初来高値更新", kind: "boolean", periods: SESSION_PERIODS, defaultPeriod: "5d" },
    { family: "rise_rate", label: "値上がり率", kind: "range", periods: RETURN_PERIODS, defaultPeriod: "20d" },
    { family: "decline_rate", label: "値下がり率", kind: "range", periods: RETURN_PERIODS, defaultPeriod: "20d" },
];
export const TECHNICAL_FAMILY_BY_KEY = new Map(TECHNICAL_FAMILIES.map((item) => [item.family, item]));

const METRIC_MAPPING: Record<TechnicalMetricFamily, Partial<Record<TechnicalPeriod, string>>> = {
    bullish_candle_ratio: { "1d": "bullish_candle_ratio_1d_pct", "3d": "bullish_candle_ratio_3d_pct", "5d": "bullish_candle_ratio_5d_pct", "10d": "bullish_candle_ratio_10d_pct" },
    bearish_candle_ratio: { "1d": "bearish_candle_ratio_1d_pct", "3d": "bearish_candle_ratio_3d_pct", "5d": "bearish_candle_ratio_5d_pct", "10d": "bearish_candle_ratio_10d_pct" },
    psychological_line: { "1d": "psychological_line_1d_pct", "3d": "psychological_line_3d_pct", "5d": "psychological_line_5d_pct", "10d": "psychological_line_10d_pct" },
    new_ytd_high: { "1d": "new_ytd_high_last_1d", "3d": "new_ytd_high_last_3d", "5d": "new_ytd_high_last_5d", "10d": "new_ytd_high_last_10d" },
    rise_rate: { "1d": "rise_rate_1d_pct", "5d": "rise_rate_5d_pct", "20d": "rise_rate_20d_pct", "60d": "rise_rate_60d_pct" },
    decline_rate: { "1d": "decline_rate_1d_pct", "5d": "decline_rate_5d_pct", "20d": "decline_rate_20d_pct", "60d": "decline_rate_60d_pct" },
};

export function resolveTechnicalMetric(family: TechnicalMetricFamily, period: TechnicalPeriod): string {
    const key = METRIC_MAPPING[family]?.[period];
    if (!key) throw new Error(`Unsupported technical metric: ${family}/${period}`);
    return key;
}

export function periodLabel(period: TechnicalPeriod): string {
    if (period === "1d") return "当日";
    if (period === "60d") return "3か月";
    return `${Number.parseInt(period, 10)}日`;
}

export function technicalFilterLabel(filter: Pick<TechnicalFilter, "family" | "period">): string {
    return `${TECHNICAL_FAMILY_BY_KEY.get(filter.family)?.label ?? filter.family}（${periodLabel(filter.period)}）`;
}

export function addTechnicalFilter(filters: readonly TechnicalFilter[], family: TechnicalMetricFamily): TechnicalFilter[] {
    const definition = TECHNICAL_FAMILY_BY_KEY.get(family);
    if (!definition) return [...filters];
    const candidates = [definition.defaultPeriod, ...definition.periods.filter((period) => period !== definition.defaultPeriod)];
    const period = candidates.find((candidate) => !filters.some((item) => item.family === family && item.period === candidate));
    if (!period) return [...filters];
    return [...filters, { id: `${family}-${period}-${filters.length + 1}`, family, period, min: "", max: "", enabled: definition.kind === "boolean" }];
}

export function updateTechnicalPeriod(filters: readonly TechnicalFilter[], id: string, period: TechnicalPeriod): TechnicalFilter[] {
    const target = filters.find((item) => item.id === id);
    if (!target || filters.some((item) => item.id !== id && item.family === target.family && item.period === period)) return [...filters];
    return filters.map((item) => item.id === id ? { ...item, period } : item);
}

export function resolvedTechnicalRanges(filters: readonly TechnicalFilter[]): Record<string, { min: string; max: string }> {
    return Object.fromEntries(filters.filter((item) => TECHNICAL_FAMILY_BY_KEY.get(item.family)?.kind === "range")
        .map((item) => [resolveTechnicalMetric(item.family, item.period), { min: item.min, max: item.max }]));
}

export function activeTechnicalMetricKeys(filters: readonly TechnicalFilter[]): string[] {
    return filters.filter((item) => {
        const definition = TECHNICAL_FAMILY_BY_KEY.get(item.family);
        return definition?.kind === "boolean" ? item.enabled : item.min.trim() !== "" || item.max.trim() !== "";
    }).map((item) => resolveTechnicalMetric(item.family, item.period));
}
