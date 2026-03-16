/**
 * segment_cell_overrides の CRUD API
 *
 * - loadSegmentOverrides(ticker, fiscalYears) — 表示対象年度のみ取得
 * - saveSegmentOverride(...) — UPSERT (論理削除行の復活も対応)
 * - deleteSegmentOverride(...) — 論理削除 (is_deleted=true)
 */

import { supabase } from "./supabase";
import type {
    SegmentCellOverride,
    SegmentOverrideSaveRequest,
} from "@/types/segment-override";

// ============================================================
// Load — fiscal_year スコープ取得
// ============================================================

/**
 * 指定 ticker × fiscal_years の override レコードを取得する。
 * is_deleted=false のみ返す。
 */
export async function loadSegmentOverrides(
    ticker: string,
    fiscalYears: number[],
): Promise<SegmentCellOverride[]> {
    if (!ticker || fiscalYears.length === 0) return [];

    try {
        const { data, error } = await supabase
            .from("segment_cell_overrides")
            .select("*")
            .eq("ticker", ticker)
            .in("fiscal_year", fiscalYears)
            .eq("is_deleted", false);

        if (error) {
            console.warn(
                "[segment_cell_overrides] スキップ (テーブル未作成の可能性):",
                error.message,
            );
            return [];
        }

        return (data as SegmentCellOverride[]) || [];
    } catch (err) {
        console.warn("[segment_cell_overrides] 取得例外 (空配列で継続):", err);
        return [];
    }
}

// ============================================================
// Save — UPSERT
// ============================================================

/**
 * 1 セル分の override を保存する。
 *
 * - 既存レコード (is_deleted=false) があれば UPDATE
 * - 論理削除済みレコードがあれば復活 (is_deleted=false に戻す)
 * - なければ INSERT
 *
 * created_by / updated_by は呼び出し側から渡す。
 */
export async function saveSegmentOverride(
    req: SegmentOverrideSaveRequest,
    userEmail: string,
): Promise<SegmentCellOverride | null> {
    const {
        ticker,
        fiscal_year,
        quarter,
        segment_name,
        metric,
        value,
        base_source,
        note,
    } = req;

    // バリデーション
    if (!["1Q", "3Q"].includes(quarter)) {
        throw new Error(`Invalid quarter: ${quarter}. Only 1Q/3Q allowed.`);
    }
    if (!["sales", "operating_profit"].includes(metric)) {
        throw new Error(
            `Invalid metric: ${metric}. Only sales/operating_profit allowed.`,
        );
    }

    try {
        // まず既存レコードを取得 (論理削除済み含む)
        const { data: existing } = await supabase
            .from("segment_cell_overrides")
            .select("id, is_deleted")
            .eq("ticker", ticker)
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .eq("segment_name", segment_name)
            .eq("metric", metric)
            .limit(1)
            .maybeSingle();

        if (existing) {
            // UPDATE (論理削除の復活も含む)
            const { data, error } = await supabase
                .from("segment_cell_overrides")
                .update({
                    value,
                    base_source: base_source ?? null,
                    note: note ?? null,
                    updated_by: userEmail,
                    is_deleted: false,
                })
                .eq("id", existing.id)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Override update failed: ${error.message}`);
            }
            return data as SegmentCellOverride;
        } else {
            // INSERT
            const { data, error } = await supabase
                .from("segment_cell_overrides")
                .insert({
                    ticker,
                    fiscal_year,
                    quarter,
                    segment_name,
                    metric,
                    value,
                    base_source: base_source ?? null,
                    input_scope: "missing_fill",
                    note: note ?? null,
                    created_by: userEmail,
                    updated_by: userEmail,
                })
                .select("*")
                .single();

            if (error) {
                throw new Error(`Override insert failed: ${error.message}`);
            }
            return data as SegmentCellOverride;
        }
    } catch (err) {
        console.error("[segment_cell_overrides] save error:", err);
        throw err;
    }
}

// ============================================================
// Delete — 論理削除
// ============================================================

/**
 * override を論理削除する (is_deleted=true)。
 */
export async function deleteSegmentOverride(
    ticker: string,
    fiscalYear: number,
    quarter: string,
    segmentName: string,
    metric: string,
    userEmail: string,
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from("segment_cell_overrides")
            .update({
                is_deleted: true,
                updated_by: userEmail,
            })
            .eq("ticker", ticker)
            .eq("fiscal_year", fiscalYear)
            .eq("quarter", quarter)
            .eq("segment_name", segmentName)
            .eq("metric", metric)
            .eq("is_deleted", false);

        if (error) {
            console.error("[segment_cell_overrides] delete error:", error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error("[segment_cell_overrides] delete exception:", err);
        return false;
    }
}
