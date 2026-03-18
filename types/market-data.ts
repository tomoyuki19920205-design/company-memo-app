// =============================================================
// market-data.ts — 株価 & バリュエーション型定義
// =============================================================

/** Supabase market_data テーブル行 */
export interface MarketDataRecord {
    ticker: string;
    date: string;           // YYYY-MM-DD
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    turnover: number | null;
    adj_close: number | null;
    market_cap: number | null;
}

/** Supabase per_share_data テーブル行 */
export interface PerShareRecord {
    ticker: string;
    period: string;         // YYYY-MM-DD (fiscal year end)
    quarter: string;        // 1Q/2Q/3Q/4Q/FY
    disclosed_date: string | null;
    // 実績
    eps: number | null;
    diluted_eps: number | null;
    bps: number | null;
    dividend_q1: number | null;
    dividend_q2: number | null;
    dividend_q3: number | null;
    dividend_fy_end: number | null;
    dividend_annual: number | null;
    payout_ratio: number | null;
    // 予想
    forecast_eps: number | null;
    forecast_dividend_annual: number | null;
    forecast_payout_ratio: number | null;
    // 株式数
    shares_outstanding: number | null;
    treasury_stock: number | null;
    avg_shares: number | null;
    // BS
    total_assets: number | null;
    equity: number | null;
    equity_ratio: number | null;
}

/** API計算後のバリュエーション指標 */
export interface ValuationMetrics {
    stock_price: number | null;      // 直近終値
    market_cap: number | null;       // 時価総額 (円)
    per: number | null;              // PER（予想EPS優先）
    pbr: number | null;              // PBR（最新BPS）
    div_yield: number | null;        // 配当利回り % (予想配当優先)
    price_date: string | null;       // 株価基準日
    // 内訳（デバッグ・表示用）
    eps_used: number | null;         // PER計算に使用したEPS
    eps_basis: "forecast" | "actual" | null;  // どちらのEPSを使用したか
    bps_used: number | null;
    dividend_used: number | null;
    dividend_basis: "forecast" | "actual" | null;
}
