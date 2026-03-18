/**
 * company-search.ts — 企業検索ロジック（クライアント側フィルタ + スコアリング）
 */

// ============================================================
// 型定義
// ============================================================

export interface SearchCandidate {
    ticker: string;
    company_name: string;
    company_name_en?: string | null;
    /** 検索用に正規化済みの企業名（キャッシュ） */
    _normalized_name?: string;
    _normalized_name_en?: string;
}

// ============================================================
// 正規化
// ============================================================

/**
 * 検索テキストを正規化する。
 * - trim / lowercase
 * - 全角英数字→半角
 * - 全角スペース→半角 / 連続スペース圧縮
 * - 「株式会社」「(株)」除去
 * - 長音・ハイフン・中点の揺れ吸収
 */
export function normalizeSearchText(text: string | null | undefined): string {
    if (!text) return "";
    let s = text.trim().toLowerCase();

    // 全角英数字→半角
    s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    );

    // 全角スペース→半角
    s = s.replace(/\u3000/g, " ");
    // 連続スペース圧縮
    s = s.replace(/\s+/g, " ");

    // 「株式会社」「(株)」「（株）」除去
    s = s.replace(/株式会社/g, "");
    s = s.replace(/[（(]株[）)]/g, "");

    // 長音・ハイフン・中点の揺れを統一 → "-"
    s = s.replace(/[ー－―‐–—・]/g, "-");

    return s.trim();
}

// ============================================================
// スコアリング
// ============================================================

/** スコア定数（高い方が優先） */
const SCORE_TICKER_EXACT = 1000;
const SCORE_TICKER_PREFIX = 800;
const SCORE_NAME_PREFIX = 600;
const SCORE_NAME_CONTAINS = 400;
const SCORE_NAME_EN_PREFIX = 300;
const SCORE_NAME_EN_CONTAINS = 200;

/**
 * 候補に対して正規化済みクエリのスコアを算出する。
 * 0 = マッチしない。高い値ほど優先。
 *
 * @param nq 正規化済みクエリ (normalizeSearchText 適用済み)
 */
export function scoreCandidate(
    nq: string,
    candidate: SearchCandidate,
): number {
    if (!nq) return 0;

    const isDigitsOnly = /^\d+$/.test(nq);

    // ticker マッチ
    const ticker = candidate.ticker.toLowerCase();
    if (ticker === nq) return SCORE_TICKER_EXACT;
    if (ticker.startsWith(nq)) return SCORE_TICKER_PREFIX;

    // 数字のみ1文字入力は ticker 候補のみ
    if (isDigitsOnly && nq.length === 1) return 0;

    // 企業名検索は2文字以上
    if (nq.length < 2) return 0;

    // 日本語名マッチ
    const nameNorm =
        candidate._normalized_name ??
        normalizeSearchText(candidate.company_name);
    if (nameNorm.startsWith(nq)) return SCORE_NAME_PREFIX;
    if (nameNorm.includes(nq)) return SCORE_NAME_CONTAINS;

    // 英語名マッチ
    const nameEn =
        candidate._normalized_name_en ??
        normalizeSearchText(candidate.company_name_en);
    if (nameEn) {
        if (nameEn.startsWith(nq)) return SCORE_NAME_EN_PREFIX;
        if (nameEn.includes(nq)) return SCORE_NAME_EN_CONTAINS;
    }

    return 0;
}

// ============================================================
// 検索
// ============================================================

/**
 * 候補リストをスコアリング+ソートしてフィルタする。
 * @param query      検索クエリ (生テキスト)
 * @param candidates マスタ全件 (preNormalizeCandidates 済み推奨)
 * @param maxResults 最大返却件数（default 10）
 */
export function searchCompanies(
    query: string,
    candidates: SearchCandidate[],
    maxResults = 10,
): SearchCandidate[] {
    const nq = normalizeSearchText(query);
    if (!nq) return [];

    // スコアリング
    const scored: { candidate: SearchCandidate; score: number }[] = [];
    for (const c of candidates) {
        const score = scoreCandidate(nq, c);
        if (score > 0) scored.push({ candidate: c, score });
    }

    // スコア降順 → ticker昇順（安定ソート）
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.candidate.ticker.localeCompare(b.candidate.ticker);
    });

    return scored.slice(0, maxResults).map((s) => s.candidate);
}

/**
 * マスタデータの正規化名をプリキャッシュする。
 * loadCompanyMaster() 後に1回呼ぶことで searchCompanies の高速化を図る。
 */
export function preNormalizeCandidates(
    candidates: SearchCandidate[],
): SearchCandidate[] {
    return candidates.map((c) => ({
        ...c,
        _normalized_name: normalizeSearchText(c.company_name),
        _normalized_name_en: normalizeSearchText(c.company_name_en),
    }));
}
