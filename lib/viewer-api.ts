import { supabase } from "./supabase";
import { normalizeTicker } from "./memo-api";
import type { FinancialRecord } from "@/types/financial";
import type { ForecastRevision } from "@/types/forecast";
import type { MonthlyRecord } from "@/types/monthly";
import type { KpiRecord } from "@/types/kpi";

// ============================================================
// Quarter ソート順 (1Q → 2Q → 3Q → FY の順を保証)
// ============================================================
const QUARTER_ORDER: Record<string, number> = {
    "1Q": 0,
    "2Q": 1,
    "3Q": 2,
    "4Q": 3,
    "FY": 4,
};

function sortFinancials(rows: FinancialRecord[]): FinancialRecord[] {
    return [...rows].sort((a, b) => {
        // period DESC
        const periodCmp = (b.period || "").localeCompare(a.period || "");
        if (periodCmp !== 0) return periodCmp;
        // quarter: FY → 3Q → 2Q → 1Q (大きい順)
        const qa = QUARTER_ORDER[a.quarter] ?? 9;
        const qb = QUARTER_ORDER[b.quarter] ?? 9;
        return qb - qa;
    });
}

// ============================================================
// 会社情報
// ============================================================
export interface CompanyInfo {
    ticker: string;
    companyName: string | null;
}

/**
 * 会社情報を取得する。
 * 失敗しても例外を投げず、ticker のみの CompanyInfo を返す。
 */
export async function loadCompanyInfo(ticker: string): Promise<CompanyInfo> {
    const t = normalizeTicker(ticker);
    if (!t) return { ticker: ticker, companyName: null };

    try {
        // financials テーブルから1行取得して存在確認
        // 将来 companies テーブルが追加されたらそこから会社名を取得
        const { data } = await supabase
            .from("financials")
            .select("ticker")
            .eq("ticker", t)
            .limit(1)
            .maybeSingle();

        return {
            ticker: t,
            companyName: data ? null : null, // 現状は会社名カラムが無いので null
        };
    } catch {
        // 失敗しても ticker だけ返す
        return { ticker: t, companyName: null };
    }
}

// ============================================================
// PL (financials)
// ============================================================

/**
 * 四半期業績データを取得する (過去5年分表示のため十分な件数を取得)
 */
export async function loadFinancials(ticker: string): Promise<FinancialRecord[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("financials")
            .select("ticker,period,quarter,sales,gross_profit,operating_profit,source,updated_at")
            .eq("ticker", t)
            .order("period", { ascending: false })
            .order("quarter", { ascending: false })
            .limit(100);

        if (error) {
            if (error.code === "PGRST200" || error.message?.includes("not find")) {
                console.warn("financials テーブルが未作成です");
                return [];
            }
            throw new Error(`PL取得に失敗しました: ${error.message}`);
        }

        if (!data || data.length === 0) return [];

        // 型変換 + 明示的ソート (quarter 順を保証)
        const records: FinancialRecord[] = data.map((row) => ({
            ticker: row.ticker,
            period: row.period,
            quarter: row.quarter,
            sales: row.sales,
            gross_profit: row.gross_profit,
            operating_profit: row.operating_profit,
            ordinary_profit: null,
            net_income: null,
            eps: null,
            source: row.source || "",
            updated_at: row.updated_at || "",
        }));

        // 明示的にソート: period DESC → quarter DESC (FY → 3Q → 2Q → 1Q)
        return sortFinancials(records);
    } catch (err) {
        console.error("loadFinancials error:", err);
        throw err;
    }
}

// ============================================================
// Forecast Revision — スタブ (テーブル未存在時は空配列)
// ============================================================

/**
 * 業績予想修正データを取得する。
 * テーブルが存在しない場合（404 / schema cache not found）は空配列を返す。
 * 未作成テーブルのエラーでアプリ全体を止めない。
 */
export async function loadForecastRevision(ticker: string): Promise<ForecastRevision[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("forecast_revision")
            .select("*")
            .eq("ticker", t)
            .order("pubdate", { ascending: false })
            .limit(10);

        if (error) {
            // テーブル未存在 (404 / PGRST / schema cache) は想定内 → 空配列
            console.warn("[forecast_revision] スキップ (テーブル未作成の可能性):", error.message);
            return [];
        }

        return (data as ForecastRevision[]) || [];
    } catch (err) {
        // ネットワークエラー・404・その他すべて握りつぶし
        console.warn("[forecast_revision] 取得例外 (空配列で継続):", err);
        return [];
    }
}

// ============================================================
// Monthly Data — スタブ (テーブル未存在時は空配列)
// ============================================================

/**
 * 月次データを取得する。
 * テーブルが存在しない場合（404 / schema cache not found）は空配列を返す。
 */
export async function loadMonthlyData(ticker: string): Promise<MonthlyRecord[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("monthly_data")
            .select("*")
            .eq("ticker", t)
            .order("pubdate", { ascending: false })
            .limit(20);

        if (error) {
            console.warn("[monthly_data] スキップ (テーブル未作成の可能性):", error.message);
            return [];
        }

        return (data as MonthlyRecord[]) || [];
    } catch (err) {
        console.warn("[monthly_data] 取得例外 (空配列で継続):", err);
        return [];
    }
}

// ============================================================
// KPI Data — スタブ (テーブル未存在時は空配列)
// ============================================================

/**
 * KPI データを取得する。
 * テーブルが存在しない場合（404 / schema cache not found）は空配列を返す。
 */
export async function loadKpiData(ticker: string): Promise<KpiRecord[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("kpi_data")
            .select("*")
            .eq("ticker", t)
            .order("pubdate", { ascending: false })
            .limit(30);

        if (error) {
            console.warn("[kpi_data] スキップ (テーブル未作成の可能性):", error.message);
            return [];
        }

        return (data as KpiRecord[]) || [];
    } catch (err) {
        console.warn("[kpi_data] 取得例外 (空配列で継続):", err);
        return [];
    }
}

// ============================================================
// Segment Financials — セグメント業績
// ============================================================

import type { SegmentRecord } from "@/types/segment";
import { normalizePeriod, normalizeQuarter } from "@/lib/normalize";

/**
 * セグメント業績データを取得する。
 * テーブルが存在しない場合は空配列を返す。
 * period / quarter は正規化してPL行とのjoinを保証する。
 */
export async function loadSegmentData(ticker: string): Promise<SegmentRecord[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("segment_canonical")
            .select("ticker,period,quarter,segment_name,sales,profit")
            .eq("ticker", t)
            .order("period", { ascending: false })
            .order("quarter", { ascending: false })
            .limit(500);

        if (error) {
            console.warn("[segment_canonical] スキップ (テーブル未作成の可能性):", error.message);
            return [];
        }

        if (!data || data.length === 0) return [];

        // period / quarter を正規化、カラム名を内部型に合わせて返す
        return data.map((row) => ({
            ticker: row.ticker,
            period: normalizePeriod(row.period),
            quarter: normalizeQuarter(row.quarter),
            segment_name: row.segment_name,
            segment_sales: row.sales !== null ? Number(row.sales) : null,
            segment_profit: row.profit !== null ? Number(row.profit) : null,
        }));
    } catch (err) {
        console.warn("[segment_canonical] 取得例外 (空配列で継続):", err);
        return [];
    }
}

