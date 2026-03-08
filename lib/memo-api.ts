import { supabase } from "./supabase";

// ============================================================
// 定数
// ============================================================
const GRID_ROWS = 20;
const GRID_COLS = 2;
const DEFAULT_MEMO_TYPE = "default";

// ============================================================
// 型
// ============================================================
export type GridData = string[][];

export interface MemoRecord {
    id?: string;
    ticker: string;
    memo_type: string;
    grid_json: GridData;
    updated_at: string;
    created_at?: string;
}

export interface GridMemoRecord {
    id?: string;
    ticker: string;
    period: string;
    quarter: string;
    grid_json: GridData;
    updated_at: string;
    created_at?: string;
    updated_by?: string;
    created_by?: string;
}

// ============================================================
// ヘルパー
// ============================================================

/** ticker 正規化: trim + 大文字化 */
export function normalizeTicker(raw: string): string {
    return raw.trim().toUpperCase();
}

/** 空グリッドを生成 */
export function createEmptyGrid(
    rows: number = GRID_ROWS,
    cols: number = GRID_COLS
): GridData {
    return Array.from({ length: rows }, () => Array(cols).fill(""));
}

/** grid_json を rows x cols にリサイズ（小さければ空で埋め、大きければ切り詰め） */
function resizeGrid(
    data: GridData,
    rows: number = GRID_ROWS,
    cols: number = GRID_COLS
): GridData {
    const result: GridData = [];
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
// API — 旧メモ (後方互換)
// ============================================================

/** メモを読み込む。無ければ null */
export async function loadMemo(
    ticker: string
): Promise<MemoRecord | null> {
    const t = normalizeTicker(ticker);
    if (!t) return null;

    const { data, error } = await supabase
        .from("company_memos")
        .select("*")
        .eq("ticker", t)
        .eq("memo_type", DEFAULT_MEMO_TYPE)
        .maybeSingle();

    if (error) {
        if (error.code === "PGRST200" || error.message?.includes("not find the table")) {
            console.warn("company_memos テーブルが未作成です。");
            return null;
        }
        console.error("loadMemo error:", error);
        throw new Error(`メモの読み込みに失敗しました: ${error.message}`);
    }

    if (!data) return null;

    return {
        ...data,
        grid_json: resizeGrid(data.grid_json || []),
    };
}

/** メモを保存 (upsert) */
export async function saveMemo(
    ticker: string,
    gridJson: GridData
): Promise<MemoRecord> {
    const t = normalizeTicker(ticker);
    if (!t) throw new Error("ticker が空です");

    const { data, error } = await supabase
        .from("company_memos")
        .upsert(
            {
                ticker: t,
                memo_type: DEFAULT_MEMO_TYPE,
                grid_json: gridJson,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "ticker,memo_type" }
        )
        .select()
        .single();

    if (error) {
        console.error("saveMemo error:", error);
        throw new Error(`メモの保存に失敗しました: ${error.message}`);
    }

    return data;
}

// ============================================================
// API — 新メモ (ticker + period + quarter 単位)
// ============================================================

/** period/quarter 単位メモを読み込む。無ければ null */
export async function loadGridMemo(
    ticker: string,
    period: string,
    quarter: string
): Promise<GridMemoRecord | null> {
    const t = normalizeTicker(ticker);
    if (!t || !period || !quarter) return null;

    try {
        const { data, error } = await supabase
            .from("company_memo_grids")
            .select("*")
            .eq("ticker", t)
            .eq("period", period)
            .eq("quarter", quarter)
            .maybeSingle();

        if (error) {
            if (error.code === "PGRST200" || error.message?.includes("not find")) {
                console.warn("company_memo_grids テーブルが未作成です。空グリッドを返します。");
                return null;
            }
            console.error("loadGridMemo error:", error);
            throw new Error(`メモの読み込みに失敗しました: ${error.message}`);
        }

        if (!data) return null;

        return {
            ...data,
            grid_json: resizeGrid(data.grid_json || []),
        };
    } catch (err) {
        console.error("loadGridMemo exception:", err);
        return null;
    }
}

/** period/quarter 単位メモを保存 (UPSERT) */
export async function saveGridMemo(
    ticker: string,
    period: string,
    quarter: string,
    gridJson: GridData,
    userId?: string
): Promise<GridMemoRecord> {
    const t = normalizeTicker(ticker);
    if (!t) throw new Error("ticker が空です");
    if (!period || !quarter) throw new Error("period / quarter が空です");

    // grid_json を正規化 (20行×2列)
    const normalized = resizeGrid(gridJson);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
        ticker: t,
        period,
        quarter,
        grid_json: normalized,
    };

    console.log("saveGridMemo payload:", JSON.stringify(payload));

    const { data, error } = await supabase
        .from("company_memo_grids")
        .upsert(payload, { onConflict: "ticker,period,quarter" })
        .select()
        .single();

    if (error) {
        console.error("saveGridMemo error:", error);
        throw new Error(`メモの保存に失敗しました: ${error.message}`);
    }

    return data;
}

/** 会社名を取得 (失敗しても null を返す) */
export async function fetchCompanyName(
    ticker: string
): Promise<string | null> {
    const t = normalizeTicker(ticker);
    if (!t) return null;

    try {
        const { data } = await supabase
            .from("financials")
            .select("ticker")
            .eq("ticker", t)
            .limit(1)
            .maybeSingle();

        if (data) return null;
        return null;
    } catch {
        return null;
    }
}

// ============================================================
// 一括メモ取得 (PL一覧表示用、N+1回避)
// ============================================================

/** ticker のメモを全件取得し、"period|quarter" → GridMemoRecord の Map で返す */
export async function loadAllGridMemos(
    ticker: string
): Promise<Map<string, GridMemoRecord>> {
    const t = normalizeTicker(ticker);
    const result = new Map<string, GridMemoRecord>();
    if (!t) return result;

    try {
        const { data, error } = await supabase
            .from("company_memo_grids")
            .select("*")
            .eq("ticker", t);

        if (error) {
            // テーブル未作成は想定内
            console.warn("[company_memo_grids] 一括取得スキップ:", error.message);
            return result;
        }

        if (data) {
            for (const row of data) {
                const key = `${row.period}|${row.quarter}`;
                result.set(key, {
                    ...row,
                    grid_json: resizeGrid(row.grid_json || []),
                });
            }
        }
    } catch (err) {
        console.warn("[company_memo_grids] 一括取得例外:", err);
    }

    return result;
}
