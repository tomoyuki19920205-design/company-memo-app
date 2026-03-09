import { supabase } from "./supabase";
import { normalizeTicker } from "./memo-api";

// ============================================================
// 型
// ============================================================
export type PasteGridData = string[][];

export interface PasteMemoRecord {
    id?: string;
    ticker: string;
    view_type: string;
    memo_grid_json: PasteGridData;
    updated_by?: string | null;
    updated_at: string;
    created_at?: string;
}

// ============================================================
// 定数
// ============================================================
const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 4;
const DEFAULT_VIEW_TYPE = "pl_memo_a";

// ============================================================
// ヘルパー
// ============================================================

/** 空グリッドを生成 */
export function createEmptyPasteGrid(
    rows: number = DEFAULT_ROWS,
    cols: number = DEFAULT_COLS
): PasteGridData {
    return Array.from({ length: rows }, () => Array(cols).fill(""));
}

/** grid_json を rows x cols にリサイズ */
function resizePasteGrid(
    data: PasteGridData,
    rows: number = DEFAULT_ROWS,
    cols: number = DEFAULT_COLS
): PasteGridData {
    const result: PasteGridData = [];
    for (let r = 0; r < rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < cols; c++) {
            const val = data[r]?.[c];
            row.push(val !== null && val !== undefined ? String(val) : "");
        }
        result.push(row);
    }
    return result;
}

// ============================================================
// API — MEMO A 取得
// ============================================================

/**
 * ticker の MEMO A を取得する。無ければ null。
 * テーブル未存在時もエラーにせず null を返す。
 */
export async function loadPasteMemo(
    ticker: string
): Promise<PasteMemoRecord | null> {
    const t = normalizeTicker(ticker);
    if (!t) return null;

    try {
        const { data, error } = await supabase
            .from("company_paste_memos")
            .select("*")
            .eq("ticker", t)
            .eq("view_type", DEFAULT_VIEW_TYPE)
            .maybeSingle();

        if (error) {
            if (
                error.code === "PGRST200" ||
                error.message?.includes("not find")
            ) {
                console.warn(
                    "[company_paste_memos] テーブル未作成 — 空グリッドを返します"
                );
                return null;
            }
            console.error("loadPasteMemo error:", error);
            throw new Error(`MEMO A の読み込みに失敗しました: ${error.message}`);
        }

        if (!data) return null;

        return {
            ...data,
            memo_grid_json: resizePasteGrid(data.memo_grid_json || []),
        };
    } catch (err) {
        console.error("loadPasteMemo exception:", err);
        return null;
    }
}

// ============================================================
// API — MEMO A 保存 (UPSERT)
// ============================================================

/**
 * MEMO A を UPSERT で保存する。
 * ticker + view_type の unique 制約を使用。
 */
export async function savePasteMemo(
    ticker: string,
    gridJson: PasteGridData,
    userId?: string
): Promise<PasteMemoRecord> {
    const t = normalizeTicker(ticker);
    if (!t) throw new Error("ticker が空です");

    const normalized = resizePasteGrid(gridJson);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
        ticker: t,
        view_type: DEFAULT_VIEW_TYPE,
        memo_grid_json: normalized,
    };

    if (userId) {
        payload.updated_by = userId;
    }

    console.log("savePasteMemo payload:", JSON.stringify(payload));

    const { data, error } = await supabase
        .from("company_paste_memos")
        .upsert(payload, { onConflict: "ticker,view_type" })
        .select()
        .single();

    if (error) {
        console.error("savePasteMemo error:", error);
        throw new Error(`MEMO A の保存に失敗しました: ${error.message}`);
    }

    return data;
}
