/**
 * 数値を百万円単位で桁区切り表示にフォーマットする
 * loadFinancials() で円→百万円の変換済み、
 * セグメントデータも百万円単位で格納されているため、追加の除算は不要。
 * null/undefined は "–" を返す
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
