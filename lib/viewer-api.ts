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
            .from("api_latest_financials")
            .select("ticker,period,quarter,sales,gross_profit,operating_profit,updated_at")
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

        // 単位変換: jquants ソースは円単位 → ÷1,000,000 で百万円に変換
        //           tdnet ソースは既に百万円単位 → そのまま
        const toMillions = (v: number | null): number | null =>
            v !== null ? Math.round(v / 1_000_000) : null;

        const records: FinancialRecord[] = data.map((row) => {
            // source カラムが存在しない場合は row から取得を試み、なければ自動判定
            const rowSource = (row as Record<string, unknown>).source as string | undefined;
            // source 明示: jquants は円単位、それ以外は百万円単位
            // source なし: 売上が 1億超 (100,000,000) なら円単位と推定
            const isYen = rowSource
                ? rowSource === "jquants"
                : (row.sales !== null && Math.abs(row.sales) >= 100_000_000);
            const convert = (v: number | null) => isYen ? toMillions(v) : v;
            return {
                ticker: row.ticker,
                period: row.period,
                quarter: row.quarter,
                sales: convert(row.sales),
                gross_profit: convert(row.gross_profit),
                operating_profit: convert(row.operating_profit),
                ordinary_profit: null,
                net_income: null,
                eps: null,
                source: rowSource || (isYen ? "jquants" : ""),
                updated_at: row.updated_at || "",
            };
        });

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

/**
 * 既存の FY/2Q データから、存在しない 1Q/3Q の空行を生成する。
 *
 * ロジック:
 * - period ごとに既存の quarter を集計
 * - 1Q が無い period には、その period のセグメント名一覧で 1Q 空行を生成
 * - 3Q が無い period には、同様に 3Q 空行を生成
 * - スタブ行の sales / profit は null、source は undefined
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
            segmentNames: string[];
        }
    >();

    for (const seg of baseSegments) {
        if (!periodMap.has(seg.period)) {
            periodMap.set(seg.period, {
                ticker: seg.ticker,
                quarters: new Set<string>(),
                segmentNames: [],
            });
        }
        const entry = periodMap.get(seg.period)!;
        entry.quarters.add(seg.quarter);

        // セグメント名をユニークに収集 (FY or 2Q のセグメント名を使用)
        if (
            (seg.quarter === "FY" || seg.quarter === "2Q") &&
            !entry.segmentNames.includes(seg.segment_name)
        ) {
            entry.segmentNames.push(seg.segment_name);
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

