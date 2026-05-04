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
 * 既存 companies テーブルから ticker_code で name_ja を取得。
 * テーブル未存在・取得失敗時は companyName: null にフォールバック。
 */
export async function loadCompanyInfo(ticker: string): Promise<CompanyInfo> {
    const t = normalizeTicker(ticker);
    if (!t) return { ticker: ticker, companyName: null };

    try {
        const { data, error } = await supabase
            .from("companies")
            .select("name_ja")
            .eq("ticker_code", t)
            .maybeSingle();

        if (error) {
            // テーブル未存在 / RLS エラーなど → null フォールバック
            console.warn("[companies] 取得スキップ:", error.message);
            return { ticker: t, companyName: null };
        }

        return {
            ticker: t,
            companyName: data?.name_ja ?? null,
        };
    } catch {
        // 失敗しても ticker だけ返す
        return { ticker: t, companyName: null };
    }
}

// ============================================================
// 会社マスタ (検索用)
// ============================================================

import type { SearchCandidate } from "@/lib/company-search";

/**
 * companies テーブルから全件取得し SearchCandidate[] として返す。
 * PostgREST の行制限を回避するため、ページング (.range()) で全件取得。
 * ticker_code 昇順、重複排除済み。
 * テーブル未存在・エラー時は空配列。
 */
export async function loadCompanyMaster(): Promise<SearchCandidate[]> {
    const PAGE_SIZE = 1000;
    const allRows: { ticker_code: string; name_ja: string | null; name_en: string | null }[] = [];

    try {
        let from = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from("companies")
                .select("ticker_code, name_ja, name_en")
                .order("ticker_code", { ascending: true })
                .range(from, from + PAGE_SIZE - 1);

            if (error) {
                console.warn("[companies master] 取得スキップ:", error.message);
                break;
            }

            if (!data || data.length === 0) break;

            allRows.push(...data);
            hasMore = data.length === PAGE_SIZE;
            from += PAGE_SIZE;
        }

        if (allRows.length === 0) return [];

        // ticker_code 単位で重複排除 + SearchCandidate にマッピング
        const seen = new Set<string>();
        const result: SearchCandidate[] = [];
        for (const row of allRows) {
            const t = row.ticker_code;
            if (!t || seen.has(t)) continue;
            seen.add(t);
            result.push({
                ticker: t,
                company_name: row.name_ja ?? "",
                company_name_en: row.name_en ?? null,
            });
        }

        return result;
    } catch (err) {
        console.warn("[companies master] 取得例外:", err);
        return [];
    }
}

// ============================================================
// PL (financials)
// ============================================================

/**
 * 四半期業績データを取得する (過去5年分表示のため十分な件数を取得)
 * DB は全件 unit='million_yen' 統一済みのため、値をそのまま返す。
 */
export async function loadFinancials(ticker: string): Promise<FinancialRecord[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("api_latest_financials")
            .select("ticker,period,quarter,sales,gross_profit,operating_profit,source,updated_at")
            .eq("ticker", t)
            .order("period", { ascending: false })
            .order("quarter", { ascending: false })
            .limit(100);

        if (error) {
            if (error.code === "PGRST200" || error.message?.includes("not find")) {
                console.warn("api_latest_financials view が未作成です");
                return [];
            }
            throw new Error(`PL取得に失敗しました: ${error.message}`);
        }

        if (!data || data.length === 0) return [];

        // 全データ million_yen 統一済み — DB値をそのまま返す
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records: FinancialRecord[] = data.map((row: any) => ({
            ticker: row.ticker,
            period: row.period,
            quarter: row.quarter,
            sales: row.sales,
            gross_profit: row.gross_profit,
            operating_profit: row.operating_profit,
            ordinary_profit: null,
            net_income: null,
            eps: null,
            source: row.source ?? "",
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
import type { SegmentCellOverride } from "@/types/segment-override";
import { normalizePeriod, normalizeQuarter } from "@/lib/normalize";
import { buildOverrideKey } from "@/lib/segment-normalize";

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

// ============================================================
// Segment Override — Overlay Resolution
// ============================================================

/**
 * period 文字列 (YYYY-MM-DD) から fiscal_year (integer) を抽出する。
 * 例: "2025-03-31" → 2025
 */
export function extractFiscalYear(period: string): number {
    const match = period.match(/^(\d{4})/);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * segments 配列からユニークな fiscal_year のリストを取得する。
 */
export function extractFiscalYears(segments: SegmentRecord[]): number[] {
    const years = new Set<number>();
    for (const seg of segments) {
        const fy = extractFiscalYear(seg.period);
        if (fy > 0) years.add(fy);
    }
    return Array.from(years);
}

/**
 * base セグメントデータに override を overlay して resolved data を返す。
 *
 * - override は normalized segment_name + fiscal_year + quarter + metric で照合
 * - resolved_value = manual_override ?? base_value
 * - source は manual override がある場合 'manual' に設定
 */
export function resolveSegmentsWithOverrides(
    baseSegments: SegmentRecord[],
    overrides: SegmentCellOverride[],
): SegmentRecord[] {
    if (overrides.length === 0) return baseSegments;

    // Build override lookup: key → SegmentCellOverride
    const overrideMap = new Map<string, SegmentCellOverride>();
    for (const ov of overrides) {
        if (ov.is_deleted) continue;

        const salesKey = buildOverrideKey(
            ov.fiscal_year,
            ov.quarter,
            ov.segment_name,
            "sales",
        );
        const profitKey = buildOverrideKey(
            ov.fiscal_year,
            ov.quarter,
            ov.segment_name,
            "operating_profit",
        );

        if (ov.metric === "sales") {
            overrideMap.set(salesKey, ov);
        } else if (ov.metric === "operating_profit") {
            overrideMap.set(profitKey, ov);
        }
    }

    return baseSegments.map((seg) => {
        const fy = extractFiscalYear(seg.period);
        const q = seg.quarter;

        const salesKey = buildOverrideKey(fy, q, seg.segment_name, "sales");
        const profitKey = buildOverrideKey(fy, q, seg.segment_name, "operating_profit");

        const salesOverride = overrideMap.get(salesKey);
        const profitOverride = overrideMap.get(profitKey);

        const hasSalesOverride = salesOverride && salesOverride.value !== null;
        const hasProfitOverride = profitOverride && profitOverride.value !== null;

        if (!hasSalesOverride && !hasProfitOverride) return seg;

        return {
            ...seg,
            segment_sales: hasSalesOverride ? salesOverride.value : seg.segment_sales,
            segment_profit: hasProfitOverride ? profitOverride.value : seg.segment_profit,
            source: hasSalesOverride || hasProfitOverride ? "manual" : seg.source,
            // Per-metric source tracking for badge display
            _salesSource: hasSalesOverride ? "manual" : (seg.source || "base"),
            _profitSource: hasProfitOverride ? "manual" : (seg.source || "base"),
        } as SegmentRecord;
    });
}

// ============================================================
// 1Q/3Q スタブ行生成 — 欠損クォーターの空行を補完
// ============================================================

import { normalizeSegmentDisplayKey } from "@/lib/segment-normalize";

/**
 * 既存の FY/2Q データから、存在しない 1Q/3Q の空行を生成する。
 *
 * ロジック:
 * - period ごとに既存の quarter を集計
 * - 1Q が無い period には、その period のセグメント名一覧で 1Q 空行を生成
 * - 3Q が無い period には、同様に 3Q 空行を生成
 * - スタブ行の sales / profit は null、source は undefined
 * - 表示統合キーでユニーク判定し、同一セグメントの重複スタブを排除
 */
export function generateMissingQuarterStubs(
    baseSegments: SegmentRecord[],
): SegmentRecord[] {
    if (baseSegments.length === 0) return [];

    // period ごとに { quarters: Set, segmentNames: string[] } を集計
    const periodMap = new Map<
        string,
        {
            ticker: string;
            quarters: Set<string>;
            segmentNames: string[];     // 代表名 (display_key でユニーク)
            seenDisplayKeys: Set<string>;
        }
    >();

    for (const seg of baseSegments) {
        if (!periodMap.has(seg.period)) {
            periodMap.set(seg.period, {
                ticker: seg.ticker,
                quarters: new Set<string>(),
                segmentNames: [],
                seenDisplayKeys: new Set<string>(),
            });
        }
        const entry = periodMap.get(seg.period)!;
        entry.quarters.add(seg.quarter);

        // セグメント名をユニークに収集 (FY or 2Q のセグメント名を使用)
        // display_key でユニーク判定して重複排除
        if (
            (seg.quarter === "FY" || seg.quarter === "2Q")
        ) {
            const dk = normalizeSegmentDisplayKey(seg.segment_name) || seg.segment_name;
            if (!entry.seenDisplayKeys.has(dk)) {
                entry.seenDisplayKeys.add(dk);
                entry.segmentNames.push(seg.segment_name);
            }
        }
    }

    const stubs: SegmentRecord[] = [];
    const missingQuarters = ["1Q", "3Q"];

    for (const [period, entry] of periodMap) {
        // segmentNames が空なら (1Q/3Q のみのケース) スキップ
        if (entry.segmentNames.length === 0) continue;

        for (const q of missingQuarters) {
            if (entry.quarters.has(q)) continue; // 既にデータあり

            for (const name of entry.segmentNames) {
                stubs.push({
                    ticker: entry.ticker,
                    period,
                    quarter: q,
                    segment_name: name,
                    segment_sales: null,
                    segment_profit: null,
                    source: undefined,
                });
            }
        }
    }

    return stubs;
}

// ============================================================
// Order KPI — 受注系KPI (order_kpis テーブル / ビュー)
// ============================================================

import type { OrderKpiItem } from "@/types/order-kpi";

/**
 * 受注系KPIデータを取得する。
 * 優先: order_kpis_best ビュー → order_kpis テーブル直接
 * テーブル/ビューが存在しない場合は空配列を返す。
 */
export async function loadOrderKpis(ticker: string): Promise<OrderKpiItem[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    // NOTE: order_kpis_best ビューは DISTINCT ON (canonical_kpi_name) で
    // 同一KPIの過去期データを潰すため、ここでは使用しない。
    // テーブル直接クエリ + (canonical_kpi_name, fiscal_year, quarter) dedup を使用。

    // Fallback: query order_kpis table directly
    try {
        const { data, error } = await supabase
            .from("order_kpis")
            .select(
                "id,ticker,canonical_kpi_name,normalized_value,unit_normalized," +
                "review_status,confidence_score,filing_date,fiscal_year,quarter,period_label,source_system," +
                "source_type,raw_label,source_page,source_locator,extraction_method," +
                "reviewed_at,reviewed_by,review_note,comparison_json"
            )
            .eq("ticker", t)
            .order("canonical_kpi_name")
            .order("confidence_score", { ascending: false })
            .limit(200);

        if (error) {
            console.warn("[order_kpis] スキップ (テーブル未作成の可能性):", error.message);
            return [];
        }

        if (!data || data.length === 0) return [];

        // Deduplicate: keep highest confidence per (canonical_kpi_name, fiscal_year, quarter)
        const bestMap = new Map<string, OrderKpiItem>();
        for (const row of data as unknown as OrderKpiItem[]) {
            const dedupKey = `${row.canonical_kpi_name}|${row.fiscal_year ?? ""}|${row.quarter ?? ""}`;
            const existing = bestMap.get(dedupKey);
            if (!existing || (row.confidence_score ?? 0) > (existing.confidence_score ?? 0)) {
                bestMap.set(dedupKey, row);
            }
        }

        return Array.from(bestMap.values());
    } catch (err) {
        console.warn("[order_kpis] 取得例外 (空配列で継続):", err);
        return [];
    }
}

// ============================================================
// Order KPI — review_status 更新
// ============================================================

type ReviewAction = "auto_accepted" | "rejected";

/**
 * order_kpis の review_status を更新する。
 * needs_review / ambiguous → auto_accepted / rejected のみ許可。
 * reviewed_at / reviewed_by / review_note を同時記録。
 */
export async function updateOrderKpiReviewStatus(
    id: number,
    nextStatus: ReviewAction,
    reviewerEmail?: string,
    reviewNote?: string,
): Promise<{ success: boolean; error?: string }> {
    if (nextStatus !== "auto_accepted" && nextStatus !== "rejected") {
        return { success: false, error: `Invalid nextStatus: ${nextStatus}` };
    }

    try {
        // まず現在のレコードを確認
        const { data: current, error: fetchErr } = await supabase
            .from("order_kpis")
            .select("id,review_status")
            .eq("id", id)
            .maybeSingle();

        if (fetchErr || !current) {
            console.warn(`[order_kpi review] id=${id} not found`);
            return { success: false, error: `Record id=${id} not found` };
        }

        const oldStatus = current.review_status;

        // auto_accepted / rejected は no-op
        if (oldStatus === "auto_accepted" || oldStatus === "rejected") {
            console.log(`[order_kpi review] id=${id} already ${oldStatus}, no-op`);
            return { success: true };
        }

        // 更新実行 (監査フィールド付き)
        const updatePayload: Record<string, unknown> = {
            review_status: nextStatus,
            reviewed_at: new Date().toISOString(),
        };
        if (reviewerEmail) updatePayload.reviewed_by = reviewerEmail;
        if (reviewNote) updatePayload.review_note = reviewNote;

        const { error: updateErr } = await supabase
            .from("order_kpis")
            .update(updatePayload)
            .eq("id", id);

        if (updateErr) {
            console.error(`[order_kpi review] update failed:`, updateErr.message);
            return { success: false, error: updateErr.message };
        }

        console.log(`[order_kpi review] id=${id} ${oldStatus} → ${nextStatus} by=${reviewerEmail ?? 'unknown'}`);
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[order_kpi review] exception:`, msg);
        return { success: false, error: msg };
    }
}

// ============================================================
// Order KPI — 却下レコード取得
// ============================================================

/**
 * 指定tickerの却下済み受注KPIを取得する。
 */
export async function loadRejectedOrderKpis(ticker: string): Promise<OrderKpiItem[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("order_kpis")
            .select(
                "id,ticker,canonical_kpi_name,normalized_value,unit_normalized," +
                "review_status,confidence_score,filing_date,source_system," +
                "source_type,raw_label,source_page,source_locator,extraction_method," +
                "reviewed_at,reviewed_by,review_note"
            )
            .eq("ticker", t)
            .eq("review_status", "rejected")
            .order("canonical_kpi_name");

        if (error) {
            console.warn("[order_kpis rejected] query error:", error.message);
            return [];
        }

        return (data as unknown as OrderKpiItem[]) ?? [];
    } catch (err) {
        console.warn("[order_kpis rejected] exception:", err);
        return [];
    }
}

// ============================================================
// Order KPI — 却下レコード復活 (rejected → needs_review)
// ============================================================

/**
 * 却下済みレコードを needs_review に戻す。
 */
export async function restoreOrderKpi(
    id: number,
    reviewerEmail?: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: current, error: fetchErr } = await supabase
            .from("order_kpis")
            .select("id,review_status")
            .eq("id", id)
            .maybeSingle();

        if (fetchErr || !current) {
            return { success: false, error: `Record id=${id} not found` };
        }

        if (current.review_status !== "rejected") {
            console.log(`[order_kpi restore] id=${id} is ${current.review_status}, not rejected`);
            return { success: true };
        }

        const { error: updateErr } = await supabase
            .from("order_kpis")
            .update({
                review_status: "needs_review",
                reviewed_at: new Date().toISOString(),
                reviewed_by: reviewerEmail ?? null,
                review_note: "却下から復活",
            })
            .eq("id", id);

        if (updateErr) {
            return { success: false, error: updateErr.message };
        }

        console.log(`[order_kpi restore] id=${id} rejected → needs_review by=${reviewerEmail ?? 'unknown'}`);
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
    }
}

// ============================================================
// Order KPI — 値の手修正
// ============================================================

/**
 * order_kpis の normalized_value を手動で修正する。
 * review_status を "manual_corrected" に変更し、監査情報を記録。
 */
export async function updateOrderKpiValue(
    id: number,
    newValue: number,
    reviewerEmail?: string,
    reviewNote?: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: current, error: fetchErr } = await supabase
            .from("order_kpis")
            .select("id,normalized_value,review_status")
            .eq("id", id)
            .maybeSingle();

        if (fetchErr || !current) {
            return { success: false, error: `Record id=${id} not found` };
        }

        const oldValue = current.normalized_value;
        const oldStatus = current.review_status;

        const updatePayload: Record<string, unknown> = {
            normalized_value: newValue,
            review_status: "manual_corrected",
            reviewed_at: new Date().toISOString(),
        };
        if (reviewerEmail) updatePayload.reviewed_by = reviewerEmail;
        updatePayload.review_note = reviewNote
            ? reviewNote
            : `手修正: ${oldValue} → ${newValue}`;

        const { error: updateErr } = await supabase
            .from("order_kpis")
            .update(updatePayload)
            .eq("id", id);

        if (updateErr) {
            console.error(`[order_kpi edit] update failed:`, updateErr.message);
            return { success: false, error: updateErr.message };
        }

        console.log(`[order_kpi edit] id=${id} value ${oldValue} → ${newValue}, status ${oldStatus} → manual_corrected`);
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[order_kpi edit] exception:`, msg);
        return { success: false, error: msg };
    }
}

// ============================================================
// Market Data — 株価 (テーブル未存在時は null/空配列)
// ============================================================

import type {
    MarketDataRecord,
    PerShareRecord,
    ValuationMetrics,
} from "@/types/market-data";

/**
 * 指定銘柄の最新株価を取得する。
 * テーブル未存在 → null を返す。
 */
export async function loadLatestMarketData(
    ticker: string,
): Promise<MarketDataRecord | null> {
    const t = normalizeTicker(ticker);
    if (!t) return null;

    try {
        const { data, error } = await supabase
            .from("market_data")
            .select(
                "ticker,date,open,high,low,close,volume,turnover,adj_close,market_cap",
            )
            .eq("ticker", t)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn(
                "[market_data] スキップ (テーブル未作成の可能性):",
                error.message,
            );
            return null;
        }

        if (!data) return null;

        return {
            ticker: data.ticker,
            date: data.date,
            open: data.open !== null ? Number(data.open) : null,
            high: data.high !== null ? Number(data.high) : null,
            low: data.low !== null ? Number(data.low) : null,
            close: data.close !== null ? Number(data.close) : null,
            volume: data.volume !== null ? Number(data.volume) : null,
            turnover: data.turnover !== null ? Number(data.turnover) : null,
            adj_close: data.adj_close !== null ? Number(data.adj_close) : null,
            market_cap:
                data.market_cap !== null ? Number(data.market_cap) : null,
        } as MarketDataRecord;
    } catch (err) {
        console.warn("[market_data] 取得例外:", err);
        return null;
    }
}

// ============================================================
// Per Share Data — 1株指標
// ============================================================

/**
 * 指定銘柄の1株指標を取得する (FY 行を優先表示)。
 * テーブル未存在時は空配列。
 */
export async function loadPerShareData(
    ticker: string,
): Promise<PerShareRecord[]> {
    const t = normalizeTicker(ticker);
    if (!t) return [];

    try {
        const { data, error } = await supabase
            .from("per_share_data")
            .select("*")
            .eq("ticker", t)
            .order("period", { ascending: false })
            .order("quarter", { ascending: false })
            .limit(50);

        if (error) {
            console.warn(
                "[per_share_data] スキップ (テーブル未作成の可能性):",
                error.message,
            );
            return [];
        }

        if (!data || data.length === 0) return [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.map((row: any) => ({
            ticker: row.ticker,
            period: row.period,
            quarter: row.quarter,
            disclosed_date: row.disclosed_date,
            eps: row.eps !== null ? Number(row.eps) : null,
            diluted_eps:
                row.diluted_eps !== null ? Number(row.diluted_eps) : null,
            bps: row.bps !== null ? Number(row.bps) : null,
            dividend_q1:
                row.dividend_q1 !== null ? Number(row.dividend_q1) : null,
            dividend_q2:
                row.dividend_q2 !== null ? Number(row.dividend_q2) : null,
            dividend_q3:
                row.dividend_q3 !== null ? Number(row.dividend_q3) : null,
            dividend_fy_end:
                row.dividend_fy_end !== null
                    ? Number(row.dividend_fy_end)
                    : null,
            dividend_annual:
                row.dividend_annual !== null
                    ? Number(row.dividend_annual)
                    : null,
            payout_ratio:
                row.payout_ratio !== null ? Number(row.payout_ratio) : null,
            forecast_eps:
                row.forecast_eps !== null ? Number(row.forecast_eps) : null,
            forecast_dividend_annual:
                row.forecast_dividend_annual !== null
                    ? Number(row.forecast_dividend_annual)
                    : null,
            forecast_payout_ratio:
                row.forecast_payout_ratio !== null
                    ? Number(row.forecast_payout_ratio)
                    : null,
            shares_outstanding:
                row.shares_outstanding !== null
                    ? Number(row.shares_outstanding)
                    : null,
            treasury_stock:
                row.treasury_stock !== null
                    ? Number(row.treasury_stock)
                    : null,
            avg_shares:
                row.avg_shares !== null ? Number(row.avg_shares) : null,
            total_assets:
                row.total_assets !== null ? Number(row.total_assets) : null,
            equity: row.equity !== null ? Number(row.equity) : null,
            equity_ratio:
                row.equity_ratio !== null ? Number(row.equity_ratio) : null,
        })) as PerShareRecord[];
    } catch (err) {
        console.warn("[per_share_data] 取得例外:", err);
        return [];
    }
}

// ============================================================
// Valuation Metrics — API側で都度計算
// 予想PER: market_data.close ÷ per_share_data.forecast_eps
// 実績EPSへのフォールバックは行わない（表示意味の統一）
// ============================================================

/**
 * バリュエーション指標を計算する。
 *
 * ルール:
 * - PER: 予想EPSのみ使用。forecast_eps <= 0 or null なら PER = null（"—" 表示）。
 *         実績EPSへのフォールバックは行わない。
 * - PBR: 最新実績BPS。bps <= 0 なら null。
 * - 配当利回り: 予想配当優先、なければ実績配当。price <= 0 なら null。
 * - 時価総額: market_data の値を使用 (既に算出済み)。
 *   fallback: close * (shares_outstanding - treasury_stock)
 */
export function calculateValuation(
    market: MarketDataRecord | null,
    perShareRows: PerShareRecord[],
): ValuationMetrics {
    const empty: ValuationMetrics = {
        stock_price: null,
        market_cap: null,
        per: null,
        pbr: null,
        div_yield: null,
        price_date: null,
        eps_used: null,
        eps_basis: null,
        bps_used: null,
        dividend_used: null,
        dividend_basis: null,
    };

    if (!market || market.close === null) return empty;

    const price = market.close;
    const priceDate = market.date;

    // 最新の FY 行、または最新行から per_share 指標を選択
    // FY行がなければ最新行で代替
    const latestFY = perShareRows.find((r) => r.quarter === "FY");
    const latest = perShareRows.length > 0 ? perShareRows[0] : null;
    const primary = latestFY || latest;

    if (!primary) {
        return {
            ...empty,
            stock_price: price,
            market_cap: market.market_cap,
            price_date: priceDate,
        };
    }

    // EPS: 予想EPSのみ使用（実績EPSへのフォールバック禁止）
    let epsUsed: number | null = null;
    let epsBasis: "forecast" | null = null;
    if (primary.forecast_eps !== null && primary.forecast_eps > 0) {
        epsUsed = primary.forecast_eps;
        epsBasis = "forecast";
    }
    // forecast_eps が null/0以下の場合 → PER = null → UI は "—" 表示

    // BPS: 最新実績
    const bpsUsed = primary.bps;

    // 配当: 予想 → 実績
    let dividendUsed: number | null = null;
    let dividendBasis: "forecast" | "actual" | null = null;
    if (
        primary.forecast_dividend_annual !== null &&
        primary.forecast_dividend_annual > 0
    ) {
        dividendUsed = primary.forecast_dividend_annual;
        dividendBasis = "forecast";
    } else if (
        primary.dividend_annual !== null &&
        primary.dividend_annual > 0
    ) {
        dividendUsed = primary.dividend_annual;
        dividendBasis = "actual";
    }

    // PER
    const per =
        epsUsed !== null && epsUsed > 0
            ? Math.round((price / epsUsed) * 100) / 100
            : null;

    // PBR
    const pbr =
        bpsUsed !== null && bpsUsed > 0
            ? Math.round((price / bpsUsed) * 100) / 100
            : null;

    // 配当利回り
    const divYield =
        price > 0 && dividendUsed !== null && dividendUsed > 0
            ? Math.round((dividendUsed / price) * 100 * 100) / 100
            : null;

    // 時価総額 fallback
    let marketCap = market.market_cap;
    if (
        marketCap === null &&
        price > 0 &&
        primary.shares_outstanding !== null
    ) {
        const treasuryStock = primary.treasury_stock ?? 0;
        marketCap = price * (primary.shares_outstanding - treasuryStock);
    }

    return {
        stock_price: price,
        market_cap: marketCap,
        per,
        pbr,
        div_yield: divYield,
        price_date: priceDate,
        eps_used: epsUsed,
        eps_basis: epsBasis,
        bps_used: bpsUsed,
        dividend_used: dividendUsed,
        dividend_basis: dividendBasis,
    };
}

