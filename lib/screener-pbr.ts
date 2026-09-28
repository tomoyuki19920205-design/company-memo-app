import { calculateValuation } from "./viewer-api";
import type { ScreenerRow } from "./screener";
import type { CorporateActionRecord, MarketDataRecord, PerShareRecord } from "@/types/market-data";

export type PbrRange = {
    min: number | null;
    max: number | null;
    active: boolean;
};

export type PbrSourceRow = {
    ticker: string;
    period: string;
    quarter: string;
    disclosed_date: string | null;
    bps: number | string | null;
};

export type CorporateActionSourceRow = {
    ticker: string;
    date: string;
    adj_factor: number | string | null;
};

function finite(value: string | null): number | null {
    if (value === null || value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function parsePbrRange(params: URLSearchParams): PbrRange {
    const min = finite(params.get("pbr_min"));
    const max = finite(params.get("pbr_max"));
    return { min, max, active: min !== null || max !== null };
}

function perShareRecord(row: PbrSourceRow): PerShareRecord {
    const bps = row.bps === null ? null : Number(row.bps);
    return {
        ticker: row.ticker,
        period: row.period,
        quarter: row.quarter,
        disclosed_date: row.disclosed_date,
        eps: null,
        diluted_eps: null,
        bps: Number.isFinite(bps) ? bps : null,
        dividend_q1: null,
        dividend_q2: null,
        dividend_q3: null,
        dividend_fy_end: null,
        dividend_annual: null,
        payout_ratio: null,
        forecast_eps: null,
        forecast_eps_basis_factor: 1,
        initial_forecast_eps: null,
        forecast_dividend_annual: null,
        forecast_payout_ratio: null,
        shares_outstanding: null,
        treasury_stock: null,
        avg_shares: null,
        total_assets: null,
        equity: null,
        equity_ratio: null,
        source: null,
        updated_at: null,
    };
}

export function canonicalPbrForScreenerRow(
    row: ScreenerRow,
    perShareRows: PbrSourceRow[],
    corporateActionRows: CorporateActionSourceRow[],
): number | null {
    const price = Number(row.latest_valid_price);
    const priceDate = typeof row.price_as_of === "string" ? row.price_as_of : "";
    if (!Number.isFinite(price) || price <= 0 || !priceDate) return null;

    const market: MarketDataRecord = {
        ticker: String(row.ticker),
        date: priceDate,
        open: null,
        high: null,
        low: null,
        close: price,
        volume: null,
        turnover: null,
        adj_close: null,
        market_cap: row.market_cap === null ? null : Number(row.market_cap),
    };
    const actions: CorporateActionRecord[] = corporateActionRows
        .map((action) => ({ date: action.date, adj_factor: Number(action.adj_factor) }))
        .filter((action) => Number.isFinite(action.adj_factor) && action.adj_factor > 0);

    return calculateValuation(market, perShareRows.map(perShareRecord), actions).pbr;
}

export function attachAndFilterCanonicalPbr(
    rows: ScreenerRow[],
    pbrByTicker: ReadonlyMap<string, number | null>,
    range: PbrRange,
): ScreenerRow[] {
    if (!range.active) return rows;
    return rows.flatMap((row) => {
        const pbr = pbrByTicker.get(String(row.ticker)) ?? null;
        if (pbr === null) return [];
        if (range.min !== null && pbr < range.min) return [];
        if (range.max !== null && pbr > range.max) return [];
        return [{ ...row, pbr }];
    });
}

export function attachCanonicalPbr(
    rows: ScreenerRow[],
    pbrByTicker: ReadonlyMap<string, number | null>,
): ScreenerRow[] {
    return rows.map((row) => ({ ...row, pbr: pbrByTicker.get(String(row.ticker)) ?? null }));
}

export function sortRowsByPbr(rows: ScreenerRow[], ascending: boolean): ScreenerRow[] {
    return [...rows].sort((left, right) => {
        const leftPbr = typeof left.pbr === "number" && Number.isFinite(left.pbr) ? left.pbr : null;
        const rightPbr = typeof right.pbr === "number" && Number.isFinite(right.pbr) ? right.pbr : null;
        if (leftPbr === null && rightPbr === null) return String(left.ticker).localeCompare(String(right.ticker));
        if (leftPbr === null) return 1;
        if (rightPbr === null) return -1;
        const comparison = leftPbr - rightPbr;
        return comparison === 0
            ? String(left.ticker).localeCompare(String(right.ticker))
            : (ascending ? comparison : -comparison);
    });
}
