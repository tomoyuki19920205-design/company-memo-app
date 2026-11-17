import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinancialRecord } from "../types/financial";
import { transformFinancialRows, type ViewerFinancialRow } from "./financial-transform";

// Shared by the original Viewer and the calendar's daily batch API.
// Values and source priority remain owned by the existing canonical views.
const columns = "ticker,period,quarter,sales,gross_profit,operating_profit,profit_before_tax,ordinary_profit,net_income,eps,source,updated_at";
async function pages(query: any): Promise<{data: any[]; error: any}> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return { data: rows, error: null };
  }
}
const missingView = (e: any) => e?.code === "PGRST200" || e?.message?.includes("not find");
export async function loadFinancialsBatch(client: SupabaseClient, codes: string[]): Promise<Map<string, FinancialRecord[]>> {
  const result = new Map<string, FinancialRecord[]>();
  const unique = [...new Set(codes)];
  for (let offset = 0; offset < unique.length; offset += 40) {
    const group = unique.slice(offset, offset + 40);
    const [actual, forecast, sga, status] = await Promise.all([
      pages(client.from("api_latest_financials_canonical").select(`${columns},sga`).in("ticker", group)
        .order("ticker").order("period", {ascending:false}).order("quarter", {ascending:false})),
      pages(client.from("api_latest_financials_canonical_forecast")
        .select(`${columns},disclosure_datetime,source_url,accounting_scope,sales_accounting_scope,operating_profit_accounting_scope`)
        .in("ticker", group).order("ticker").order("period", {ascending:false}).order("quarter", {ascending:false})),
      group.includes("1777") ? pages(client.from("canonical_financials").select("period,quarter,value")
        .eq("ticker", "1777").eq("metric", "selling_general_and_administrative_expenses").eq("source", "official_pdf")
        .order("period").order("quarter")) : Promise.resolve({data:[],error:null}),
      pages(client.from("company_2q_forecast_status").select("ticker,period,status,disclosure_datetime,source_url,updated_at")
        .in("ticker", group).order("ticker").order("period")),
    ]);
    if (sga.error) throw new Error(`販管費取得に失敗しました: ${sga.error.message}`);
    if (actual.error && !missingView(actual.error)) throw new Error(`PL取得に失敗しました: ${actual.error.message}`);
    if (forecast.error && !missingView(forecast.error)) throw new Error(`予想PL取得に失敗しました: ${forecast.error.message}`);
    const sgaMap = new Map(sga.data.map(r => [`${r.period}:${r.quarter}`, r.value]));
    const combined = [
      ...actual.data.map(r => ({...r, selling_general_and_administrative_expenses: r.sga ?? (r.ticker === "1777" ? sgaMap.get(`${r.period}:${r.quarter}`) : null) ?? null})),
      ...forecast.data,
      ...status.data.map(r => ({ticker:r.ticker, period:r.period, quarter:"2Q", sales:null, gross_profit:null,
        operating_profit:null, profit_before_tax:null, ordinary_profit:null, net_income:null, eps:null,
        source:"tdnet_forecast", updated_at:r.updated_at, disclosure_datetime:r.disclosure_datetime,
        source_url:r.source_url, forecast_status:r.status})),
    ];
    for (const code of group) result.set(code, actual.error ? [] : transformFinancialRows(combined.filter(r => r.ticker === code) as ViewerFinancialRow[]));
  }
  return result;
}

export interface FinancialProvenance {
  ticker:string; period:string; quarter:string; metric:string; value:number;
  unit:string | null; accounting_scope:string | null; document_type:string | null; source:string;
}
// Metadata is used only to reject unsafe comparisons. It never replaces PL values.
export async function loadFinancialProvenance(client: SupabaseClient, codes: string[], from: string) {
  const rows: FinancialProvenance[] = [];
  for (let offset=0; offset<codes.length; offset+=40) {
    const response = await pages(client.from("canonical_financials")
      .select("ticker,period,quarter,metric,value,unit,accounting_scope,document_type,source")
      .in("ticker", codes.slice(offset,offset+40)).gte("period",from)
      .in("metric",["sales","operating_profit"]).order("id"));
    if (response.error) throw new Error("PL比較条件の取得に失敗しました");
    rows.push(...response.data);
  }
  return rows;
}
