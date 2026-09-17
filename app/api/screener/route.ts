import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    attachAndFilterCanonicalPbr,
    attachCanonicalPbr,
    canonicalPbrForScreenerRow,
    parsePbrRange,
    sortRowsByPbr,
    type CorporateActionSourceRow,
    type PbrSourceRow,
} from "@/lib/screener-pbr";
import { BASE_COLUMNS, BOOLEAN_FILTERS, METRIC_KEYS, SNAPSHOT_METRIC_KEYS, type ScreenerRow } from "@/lib/screener";
import { collectAllPages } from "@/lib/screener-options";

const PBR_SOURCE_BATCH_SIZE = 200;
const PBR_SOURCE_CONCURRENCY = 20;
const PBR_CACHE_TTL_MS = 5 * 60 * 1000;

type PbrCacheEntry = { sourceKey: string; pbr: number | null; expiresAt: number };
const pbrCache = new Map<string, PbrCacheEntry>();

function finite(value: string | null): number | null {
    if (value === null || value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function csv(value: string | null): string[] {
    return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function chunks<T>(values: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
        values.slice(index * size, (index + 1) * size),
    );
}

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const params = request.nextUrl.searchParams;
    if (params.get("mode") === "options") {
        let optionRows: Array<Record<string, unknown>>;
        try {
            optionRows = await collectAllPages<Record<string, unknown>>(async (from, to) => {
                const { data, error } = await supabase
                    .from("screener_metrics_current")
                    .select("market_code,market_name,sector17_code,sector17_name,sector33_code,sector33_name")
                    .range(from, to);
                if (error) throw new Error(error.message);
                return (data ?? []) as Array<Record<string, unknown>>;
            });
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load options" }, { status: 500 });
        }
        const unique = (code: string, name: string) => Array.from(new Map(optionRows.filter((row) => row[code]).map((row) => [String(row[code]), { code: String(row[code]), name: String(row[name] ?? row[code]) }])).values()).sort((a, b) => a.code.localeCompare(b.code));
        return NextResponse.json({ markets: unique("market_code", "market_name"), sectors17: unique("sector17_code", "sector17_name"), sectors33: unique("sector33_code", "sector33_name") });
    }
    const requested = csv(params.get("columns")).filter((key) => METRIC_KEYS.has(key));
    const selected = Array.from(new Set([...BASE_COLUMNS, ...requested.filter((key) => key !== "pbr")]));
    const page = Math.max(1, Math.trunc(finite(params.get("page")) ?? 1));
    const pageSize = Math.min(100, Math.max(10, Math.trunc(finite(params.get("page_size")) ?? 50)));
    const sort = METRIC_KEYS.has(params.get("sort") ?? "") ? params.get("sort")! : "market_cap";
    const ascending = params.get("direction") === "asc";
    const pbrRange = parsePbrRange(params);

    // Preserve the established database-paginated path when PBR is not requested.
    // PBR is absent from the nightly snapshot, so only the opt-in branch below
    // loads canonical Viewer inputs for every matching ticker.
    const needsPbr = pbrRange.active || requested.includes("pbr") || sort === "pbr";
    if (!needsPbr) {
        let query = supabase.from("screener_metrics_current").select(selected.join(","), { count: "exact" });
        for (const key of SNAPSHOT_METRIC_KEYS) {
            const minimum = finite(params.get(`${key}_min`));
            const maximum = finite(params.get(`${key}_max`));
            if (minimum !== null) query = query.gte(key, minimum);
            if (maximum !== null) query = query.lte(key, maximum);
        }
        for (const [parameter, column] of [["markets", "market_code"], ["sectors17", "sector17_code"], ["sectors33", "sector33_code"]] as const) {
            const values = csv(params.get(parameter));
            if (values.length) query = query.in(column, values);
        }
        for (const key of BOOLEAN_FILTERS) if (params.get(key) === "true") query = query.eq(key, true);
        if (params.get("exclude_stale") === "true") query = query.eq("price_status", "current");
        const from = (page - 1) * pageSize;
        const { data, error, count } = await query.order(sort, { ascending, nullsFirst: false }).range(from, from + pageSize - 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ rows: data ?? [], count: count ?? 0, page, pageSize });
    }

    try {
        const dbSort = sort === "pbr" ? "market_cap" : sort;
        const candidateRows = await collectAllPages<ScreenerRow>(async (from, to) => {
            let query = supabase.from("screener_metrics_current").select(selected.join(","));
            for (const key of SNAPSHOT_METRIC_KEYS) {
                const minimum = finite(params.get(`${key}_min`));
                const maximum = finite(params.get(`${key}_max`));
                if (minimum !== null) query = query.gte(key, minimum);
                if (maximum !== null) query = query.lte(key, maximum);
            }
            for (const [parameter, column] of [["markets", "market_code"], ["sectors17", "sector17_code"], ["sectors33", "sector33_code"]] as const) {
                const values = csv(params.get(parameter));
                if (values.length) query = query.in(column, values);
            }
            for (const key of BOOLEAN_FILTERS) if (params.get(key) === "true") query = query.eq(key, true);
            if (params.get("exclude_stale") === "true") query = query.eq("price_status", "current");
            const { data, error } = await query
                .order(dbSort, { ascending: sort === "pbr" ? true : ascending, nullsFirst: false })
                .order("ticker", { ascending: true })
                .range(from, to);
            if (error) throw new Error(error.message);
            return (data ?? []) as unknown as ScreenerRow[];
        });

        const now = Date.now();
        const pbrByTicker = new Map<string, number | null>();
        const missingRows: ScreenerRow[] = [];
        for (const row of candidateRows) {
            const ticker = String(row.ticker);
            const sourceKey = `${row.price_as_of ?? ""}|${row.latest_valid_price ?? ""}`;
            const cached = pbrCache.get(ticker);
            if (cached && cached.sourceKey === sourceKey && cached.expiresAt > now) {
                pbrByTicker.set(ticker, cached.pbr);
            } else {
                missingRows.push(row);
            }
        }

        if (missingRows.length) {
            const missingTickers = Array.from(new Set(missingRows.map((row) => String(row.ticker))));
            const tickerBatches = chunks(missingTickers, PBR_SOURCE_BATCH_SIZE);
            const perShareRows: PbrSourceRow[] = [];
            for (let offset = 0; offset < tickerBatches.length; offset += PBR_SOURCE_CONCURRENCY) {
                const batchResults = await Promise.all(tickerBatches.slice(offset, offset + PBR_SOURCE_CONCURRENCY).map((tickerBatch) =>
                    collectAllPages<PbrSourceRow>(async (from, to) => {
                        const { data, error } = await supabase
                            .from("per_share_data")
                            .select("ticker,period,quarter,disclosed_date,bps")
                            .in("ticker", tickerBatch)
                            .gt("bps", 0)
                            .order("ticker", { ascending: true })
                            .order("disclosed_date", { ascending: false, nullsFirst: false })
                            .order("period", { ascending: false })
                            .order("quarter", { ascending: false })
                            .range(from, to);
                        if (error) throw new Error(error.message);
                        return (data ?? []) as PbrSourceRow[];
                    }),
                ));
                perShareRows.push(...batchResults.flat());
            }
            const corporateActions = await collectAllPages<CorporateActionSourceRow>(async (from, to) => {
                const { data, error } = await supabase
                    .from("market_data")
                    .select("ticker,date,adj_factor")
                    .not("adj_factor", "is", null)
                    .neq("adj_factor", 1)
                    .range(from, to);
                if (error) throw new Error(error.message);
                return (data ?? []) as CorporateActionSourceRow[];
            });
            const perShareByTicker = new Map<string, PbrSourceRow[]>();
            for (const row of perShareRows) perShareByTicker.set(row.ticker, [...(perShareByTicker.get(row.ticker) ?? []), row]);
            const actionsByTicker = new Map<string, CorporateActionSourceRow[]>();
            for (const row of corporateActions) actionsByTicker.set(row.ticker, [...(actionsByTicker.get(row.ticker) ?? []), row]);

            for (const row of missingRows) {
                const ticker = String(row.ticker);
                const pbr = canonicalPbrForScreenerRow(
                    row,
                    perShareByTicker.get(ticker) ?? [],
                    actionsByTicker.get(ticker) ?? [],
                );
                pbrByTicker.set(ticker, pbr);
                pbrCache.set(ticker, {
                    sourceKey: `${row.price_as_of ?? ""}|${row.latest_valid_price ?? ""}`,
                    pbr,
                    expiresAt: now + PBR_CACHE_TTL_MS,
                });
            }
        }

        let rows = pbrRange.active
            ? attachAndFilterCanonicalPbr(candidateRows, pbrByTicker, pbrRange)
            : attachCanonicalPbr(candidateRows, pbrByTicker);
        if (sort === "pbr") rows = sortRowsByPbr(rows, ascending);
        const count = rows.length;
        const from = (page - 1) * pageSize;
        return NextResponse.json({ rows: rows.slice(from, from + pageSize), count, page, pageSize });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to calculate PBR" }, { status: 500 });
    }
}
