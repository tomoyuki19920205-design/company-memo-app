import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!from || !to || !DATE.test(from) || !DATE.test(to) || from > to ||
      Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "期間を確認してください" }, { status: 400 });
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: newest, error: newestError } = await supabase.from("margin_daily")
    .select("date,updated_at").order("date", { ascending: false }).limit(1);
  if (newestError) return NextResponse.json({ error: newestError.message }, { status: 500 });

  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("margin_daily")
      .select("date,published_date,fetched_at,updated_at,row_count,long_value_yen,short_value_yen,sector_long_yen,outside_long_yen,outside_count,unknown_long_yen,unknown_count,topix_close,nikkei_close")
      .gte("date", from).lte("date", to)
      .order("date", { ascending: false }).range(offset, offset + 499);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const closesByDate: Record<string, Record<string, string | number>> = {};
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("margin_index_daily")
      .select("date,code,close").gte("date", from).lte("date", to)
      .order("date", { ascending: false }).order("code", { ascending: true })
      .range(offset, offset + 499);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const item of data ?? []) {
      (closesByDate[item.date] ??= {})[item.code] = item.close;
    }
    if (!data || data.length < 500) break;
  }
  for (const row of rows) row.sector_index_close = closesByDate[row.date as string] ?? {};
  return NextResponse.json({ rows, latest: newest?.[0] ?? null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
