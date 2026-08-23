import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    chunkTickers,
    groupAdjustedChartRows,
    normalizeChartTickers,
    parseChartPeriod,
    type RawMarketDataRow,
} from "@/lib/screener-chart-data";

const MARKET_FIELDS = "ticker,date,open,high,low,close,volume,adj_close,adj_volume";

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tickers = normalizeChartTickers(request.nextUrl.searchParams.get("tickers"));
    const period = parseChartPeriod(request.nextUrl.searchParams.get("period") ?? "1y");
    if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    if (!tickers.length) return NextResponse.json({ series: {}, period, requested: [] });

    // Fetch enough calendar history for per-ticker 1Y slicing. Three tickers per
    // query stays below the PostgREST 1,000-row response cap for daily bars.
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 380);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    try {
        const { data: currentRows, error: currentError } = await supabase
            .from("screener_metrics_current")
            .select("ticker")
            .in("ticker", tickers);
        if (currentError) throw new Error(currentError.message);
        const currentTickers = new Set((currentRows ?? []).map((row) => String(row.ticker)));
        const allowedTickers = tickers.filter((ticker) => currentTickers.has(ticker));
        const tickerBatches = chunkTickers(allowedTickers);
        const batchResults = await Promise.allSettled(tickerBatches.map(async (batch) => {
            const { data, error } = await supabase
                .from("market_data")
                .select(MARKET_FIELDS)
                .in("ticker", batch)
                .gte("date", cutoffDate)
                .order("ticker", { ascending: true })
                .order("date", { ascending: true })
                .limit(1000);
            if (error) throw new Error(error.message);
            return (data ?? []) as RawMarketDataRow[];
        }));
        const rows = batchResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        const failures = batchResults.filter((result) => result.status === "rejected");
        if (failures.length === batchResults.length && failures.length) throw new Error("All chart data batches failed");
        const failedTickers = batchResults.flatMap((result, index) => result.status === "rejected" ? tickerBatches[index] : []);
        const series = groupAdjustedChartRows(rows, allowedTickers, period);
        return NextResponse.json(
            { series, period, requested: allowedTickers, failedTickers, partialFailures: failures.length },
            { headers: { "Cache-Control": "private, max-age=60" } },
        );
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load chart data" }, { status: 500 });
    }
}
