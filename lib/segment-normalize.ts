/**
 * segment_name 正規化ユーティリティ
 *
 * overlay 解決時の照合キーとして使用する。
 * 保存時は元の表示名を保持し、照合は normalized key で行う。
 */

/**
 * segment_name を正規化して照合キーを生成する。
 *
 * - trim
 * - 全角スペース → 半角スペース
 * - 改行・タブ除去
 * - 連続空白 → 単一スペース
 * - 小文字化 (case-insensitive match)
 */
export function normalizeSegmentName(raw: string | null | undefined): string {
    if (!raw) return "";
    let s = String(raw);

    // 全角スペース → 半角
    s = s.replace(/\u3000/g, " ");

    // 改行・タブ → スペース
    s = s.replace(/[\r\n\t]/g, " ");

    // trim
    s = s.trim();

    // 連続スペース → 単一
    s = s.replace(/\s{2,}/g, " ");

    // 小文字化
    s = s.toLowerCase();

    return s;
}

/**
 * overlay 解決用の複合キーを生成する。
 * fiscal_year + quarter + normalized_segment_name + metric
 */
export function buildOverrideKey(
    fiscalYear: number,
    quarter: string,
    segmentName: string,
    metric: string,
): string {
    const norm = normalizeSegmentName(segmentName);
    return `${fiscalYear}|${quarter}|${norm}|${metric}`;
}
