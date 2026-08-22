import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { BASE_COLUMNS, BOOLEAN_FILTERS, METRIC_KEYS } from "@/lib/screener";
import { collectAllPages } from "@/lib/screener-options";

function finite(value: string | null): number | null {
    if (value === null || value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function csv(value: string | null): string[] {
    return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
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
    const selected = Array.from(new Set([...BASE_COLUMNS, ...requested]));
    const page = Math.max(1, Math.trunc(finite(params.get("page")) ?? 1));
    const pageSize = Math.min(100, Math.max(10, Math.trunc(finite(params.get("page_size")) ?? 50)));
    const sort = METRIC_KEYS.has(params.get("sort") ?? "") ? params.get("sort")! : "market_cap";
    const ascending = params.get("direction") === "asc";
    let query = supabase.from("screener_metrics_current").select(selected.join(","), { count: "exact" });
    for (const key of METRIC_KEYS) {
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
