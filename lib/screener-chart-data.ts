export const CHART_PERIODS = ["1m", "3m", "6m", "1y"] as const;
export type ChartPeriod = typeof CHART_PERIODS[number];

export type RawMarketDataRow = {
    ticker: string;
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    adj_close: number | null;
    adj_volume: number | null;
};

export type ChartPricePoint = {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

const PERIOD_DAYS: Record<ChartPeriod, number> = { "1m": 31, "3m": 93, "6m": 186, "1y": 370 };

function finite(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function parseChartPeriod(value: string | null): ChartPeriod | null {
    return CHART_PERIODS.includes(value as ChartPeriod) ? value as ChartPeriod : null;
}

export function normalizeChartTickers(value: string | null, limit = 50): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of (value ?? "").split(",")) {
        const ticker = raw.trim().toUpperCase();
        if (!/^[0-9A-Z]{4}$/.test(ticker) || seen.has(ticker)) continue;
        seen.add(ticker);
        result.push(ticker);
        if (result.length >= limit) break;
    }
    return result;
}

export function chunkTickers(tickers: readonly string[], size = 3): string[][] {
    const chunks: string[][] = [];
    for (let index = 0; index < tickers.length; index += size) chunks.push(tickers.slice(index, index + size));
    return chunks;
}

/**
 * J-Quants stored adjustment basis:
 * - adj_close is authoritative for adjusted close.
 * - adj_close / raw close is applied to raw O/H/L to keep one common share basis.
 * - adj_volume is authoritative; raw volume / price ratio is the safe fallback.
 */
export function toAdjustedChartPoint(row: RawMarketDataRow): ChartPricePoint | null {
    const open = finite(row.open);
    const high = finite(row.high);
    const low = finite(row.low);
    const close = finite(row.close);
    const adjustedClose = finite(row.adj_close);
    if (open === null || high === null || low === null || close === null || adjustedClose === null || close <= 0 || adjustedClose <= 0) return null;
    const ratio = adjustedClose / close;
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const adjustedVolume = finite(row.adj_volume);
    const rawVolume = finite(row.volume);
    const volume = adjustedVolume !== null && adjustedVolume >= 0
        ? adjustedVolume
        : rawVolume !== null && rawVolume >= 0 ? rawVolume / ratio : 0;
    return {
        date: row.date,
        open: open * ratio,
        high: high * ratio,
        low: low * ratio,
        close: adjustedClose,
        volume,
    };
}

export function sliceChartPeriod(points: readonly ChartPricePoint[], period: ChartPeriod): ChartPricePoint[] {
    if (!points.length) return [];
    const latest = Date.parse(`${points[points.length - 1].date}T00:00:00Z`);
    const cutoff = latest - PERIOD_DAYS[period] * 86_400_000;
    return points.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= cutoff);
}

export function groupAdjustedChartRows(
    rows: readonly RawMarketDataRow[],
    requestedTickers: readonly string[],
    period: ChartPeriod,
): Record<string, ChartPricePoint[]> {
    const requested = new Set(requestedTickers);
    const grouped = Object.fromEntries(requestedTickers.map((ticker) => [ticker, [] as ChartPricePoint[]]));
    for (const row of rows) {
        if (!requested.has(row.ticker)) continue;
        const point = toAdjustedChartPoint(row);
        if (point) grouped[row.ticker].push(point);
    }
    for (const ticker of requestedTickers) {
        grouped[ticker].sort((left, right) => left.date.localeCompare(right.date));
        grouped[ticker] = sliceChartPeriod(grouped[ticker], period);
    }
    return grouped;
}
