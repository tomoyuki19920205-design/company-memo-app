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
            .from("api_latest_financials")
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

// ============================================================
// 手入力メモ専用行 API (PL/セグメント表下部2行)
// ============================================================

/** テーブル種別 */
export type ManualTableType = "pl_cum" | "pl_q" | "segment_cum" | "segment_q" | "segment_manual";

/** tableType → company_memo_grids の保存キー */
const MANUAL_TABLE_KEYS: Record<ManualTableType, { period: string; quarter: string }> = {
    pl_cum:          { period: "__manual_pl_cum__",          quarter: "MANUAL" },
    pl_q:            { period: "__manual_pl_q__",            quarter: "MANUAL" },
    segment_cum:     { period: "__manual_segment_cum__",     quarter: "MANUAL" },
    segment_q:       { period: "__manual_segment_q__",       quarter: "MANUAL" },
    segment_manual:  { period: "__manual_segment_manual__",  quarter: "MANUAL" },
};

/**
 * 手入力メモ行を保存 (UPSERT)。
 * 列数は自由 — resizeGrid の 20×2 固定を通さない。
 */
export async function saveManualTableMemo(
    ticker: string,
    tableType: ManualTableType,
    gridJson: string[][],
): Promise<void> {
    const t = normalizeTicker(ticker);
    if (!t) throw new Error("ticker が空です");
    const { period, quarter } = MANUAL_TABLE_KEYS[tableType];

    const { error } = await supabase
        .from("company_memo_grids")
        .upsert(
            { ticker: t, period, quarter, grid_json: gridJson },
            { onConflict: "ticker,period,quarter" }
        );

    if (error) {
        console.error("saveManualTableMemo error:", error);
        throw new Error(`手入力メモの保存に失敗しました: ${error.message}`);
    }
}

/**
 * ticker の手入力メモ行を全種別まとめて取得。
 * 存在しないキーは null を返す。
 */
export async function loadManualTableMemos(
    ticker: string,
): Promise<Record<ManualTableType, string[][] | null>> {
    const t = normalizeTicker(ticker);
    const result: Record<ManualTableType, string[][] | null> = {
        pl_cum: null,
        pl_q: null,
        segment_cum: null,
        segment_q: null,
        segment_manual: null,
    };
    if (!t) return result;

    // 特殊 period キーを IN で一括取得
    const periods = Object.values(MANUAL_TABLE_KEYS).map((k) => k.period);
    try {
        const { data, error } = await supabase
            .from("company_memo_grids")
            .select("period, quarter, grid_json")
            .eq("ticker", t)
            .in("period", periods)
            .eq("quarter", "MANUAL");

        if (error) {
            console.warn("[loadManualTableMemos] error:", error.message);
            return result;
        }

        if (data) {
            for (const row of data) {
                // period → tableType を逆引き
                const entry = (Object.entries(MANUAL_TABLE_KEYS) as [ManualTableType, { period: string; quarter: string }][])
                    .find(([, v]) => v.period === row.period && v.quarter === row.quarter);
                if (entry) {
                    result[entry[0]] = row.grid_json as string[][];
                }
            }
        }
    } catch (err) {
        console.warn("[loadManualTableMemos] exception:", err);
    }

    return result;
}
