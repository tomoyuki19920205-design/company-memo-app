export type MetricDefinition = { key: string; label: string; digits?: number };

export const SCREENER_METRICS: MetricDefinition[] = [
    { key: "forward_per", label: "予想PER", digits: 2 },
    { key: "actual_per", label: "前期実績PER", digits: 2 },
    { key: "actual_dividend_yield_pct", label: "実績配当利回り(%)", digits: 2 },
    { key: "forecast_dividend_yield_pct", label: "予想配当利回り(%)", digits: 2 },
    { key: "actual_sales_growth_yoy_pct", label: "実績売上成長率(%)", digits: 2 },
    { key: "forecast_sales_growth_yoy_pct", label: "予想売上成長率(%)", digits: 2 },
    { key: "equity_ratio_pct", label: "自己資本比率(%)", digits: 1 },
    { key: "bullish_candle_ratio_5d_pct", label: "陽線率5日(%)", digits: 1 },
    { key: "bullish_candle_ratio_10d_pct", label: "陽線率10日(%)", digits: 1 },
    { key: "bearish_candle_ratio_5d_pct", label: "陰線率5日(%)", digits: 1 },
    { key: "bearish_candle_ratio_10d_pct", label: "陰線率10日(%)", digits: 1 },
    { key: "return_5d_pct", label: "騰落率5日(%)", digits: 2 },
    { key: "return_20d_pct", label: "騰落率20日(%)", digits: 2 },
    { key: "return_60d_pct", label: "騰落率60日(%)", digits: 2 },
    { key: "sales_growth_beat_pp", label: "売上growth beat(pp)", digits: 2 },
    { key: "operating_profit_growth_beat_pp", label: "営業利益growth beat(pp)", digits: 2 },
    { key: "op_upward_revision_count_3y", label: "営業利益上方修正3年", digits: 0 },
    { key: "any_earnings_upward_revision_event_count_3y", label: "業績上方修正イベント3年", digits: 0 },
    { key: "market_cap", label: "時価総額", digits: 0 },
    { key: "psychological_line_5d_pct", label: "心理線5日(%)", digits: 1 },
    { key: "psychological_line_10d_pct", label: "心理線10日(%)", digits: 1 },
    { key: "forward_per_per_forecast_sales_growth", label: "PER/予想売上成長率", digits: 3 },
    { key: "forecast_eps_growth_yoy_pct", label: "EPS予想成長率(%)", digits: 2 },
    { key: "forward_peg", label: "予想PEG", digits: 3 },
];
export const METRIC_KEYS = new Set(SCREENER_METRICS.map((metric) => metric.key));
export const BOOLEAN_FILTERS = new Set(["new_ytd_high_last_5d", "turnaround", "loss_expansion", "profit_to_loss"]);
export const BASE_COLUMNS = ["ticker", "company_name", "market_code", "market_name", "sector17_code", "sector17_name", "sector33_code", "sector33_name", "latest_valid_price", "price_as_of", "price_status", "price_stale_sessions", "market_cap"];
export type ScreenerRow = Record<string, string | number | boolean | null>;
