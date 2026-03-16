// ============================================================
// 単位変換 — source ごとの百万円変換
// ============================================================

/**
 * ソース別の単位体系:
 *   - "jquants"  : J-Quants API → 値は **円** 単位 → ÷1,000,000
 *   - "tdnet"    : TDnet 抽出    → 値は **百万円** 単位 → そのまま
 *   - その他/空  : 百万円と仮定 → そのまま
 *
 * TODO: 将来的には source 推定ではなく、DB/API に明示的な
 *       `unit` カラム ("yen" | "million_yen") を追加して
 *       ソースに関係なく正確な変換を保証すること。
 */
type FinancialSource = string | null | undefined;

const YEN_SOURCES = new Set(["jquants"]);

/**
 * 値を百万円単位に正規化する。
 * @param value  生の数値 (null なら null を返す)
 * @param source データソース ("jquants" | "tdnet" | ...)
 * @returns 百万円単位の数値、または null
 */
export function convertToMillions(
    value: number | null,
    source: FinancialSource,
): number | null {
    if (value === null || value === undefined) return null;
    if (YEN_SOURCES.has(source ?? "")) {
        return Math.round(value / 1_000_000);
    }
    return value;
}

// ============================================================
// 表示フォーマッタ
// ============================================================

/**
 * 数値を百万円単位で桁区切り表示にフォーマットする。
 * 呼び出し前に convertToMillions() で百万円変換済みであること。
 * null/undefined は "–" を返す。
 */
export function formatMillions(val: number | null | undefined): string {
    if (val === null || val === undefined) return "–";
    return Math.round(val).toLocaleString("ja-JP");
}

/**
 * 数値を桁区切り表示にフォーマットする (元値そのまま)
 * null/undefined は "–" を返す
 */
export function formatNumber(val: number | null | undefined): string {
    if (val === null || val === undefined) return "–";
    return val.toLocaleString("ja-JP");
}

/**
 * 数値を % 表示にフォーマットする
 * null/undefined は "–" を返す
 */
export function formatPercent(val: number | null | undefined): string {
    if (val === null || val === undefined) return "–";
    return `${val.toFixed(1)}%`;
}

/**
 * 日付文字列を「YYYY/MM/DD」形式に変換する
 * null/undefined/空文字は "–" を返す
 */
export function formatDate(val: string | null | undefined): string {
    if (!val) return "–";
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return val;
        return d.toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    } catch {
        return val;
    }
}

/**
 * 値が null/undefined/空文字なら "–" を返す
 */
export function displayValue(val: string | number | null | undefined): string {
    if (val === null || val === undefined || val === "") return "–";
    return String(val);
}
