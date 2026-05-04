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

// ============================================================
// 表示統合キー — 英日混在・スペース差・語尾差を吸収
// ============================================================

/**
 * segment_name を表示統合用キーに正規化する。
 *
 * 同一セグメントが英語名・日本語名・スペース差で別列にならないよう、
 * 比較・グルーピング専用キーを生成する。
 * DB の segment_name は変更しない。
 */
export function normalizeSegmentDisplayKey(name: string | null | undefined): string {
    if (!name) return "";

    // 1. NFKC 正規化
    let s = name.normalize("NFKC");

    // 2. 小文字化
    s = s.toLowerCase();

    // 3. 全角スペース・空白・タブ・改行を削除
    s = s.replace(/[\s\u3000\t\r\n]+/g, "");

    // 4. & 表記を統一 (全角・+ → &)
    // NFKC により ＋→+ ＆→& は step1 で変換済みだが fallback も保持
    s = s.replace(/＆/g, "&");
    s = s.replace(/[+＋]/g, "&");

    // 5. "and" → "&" (スペース除去後も残る "and" に対応)
    s = s.replace(/and/g, "&");

    // 5.5. 連続する & を1個に圧縮 (&& → &)
    s = s.replace(/&{2,}/g, "&");

    // 6. 不要語を除去（英語・日本語共通）
    const stopWords = [
        // 日本語
        "事業活動", "サービス", "センター", "システム", "フィールド",
        "分野", "事業", "セグメント", "セクター",
        // 英語
        "sector", "business", "division",
        "services", "service",
    ];
    for (const w of stopWords) {
        s = s.split(w).join("");
    }

    // 7. 表記揺れを統一語に置換
    // モビリティ系
    s = s.replace(/automotive|automobile|自動車|車載|モビリティ|mobility/g, "mobility");
    // テレマティクス
    s = s.replace(/telematics|テレマティクス/g, "telematics");
    // エンタテインメント
    s = s.replace(/entertainment|エンタテインメント|エンターテインメント/g, "entertainment");
    // ソリューション
    s = s.replace(/solutions|solution|ソリューションズ|ソリューション/g, "solutions");
    // セーフティ
    s = s.replace(/safety|セーフティ|安全/g, "safety");
    // セキュリティ
    s = s.replace(/security|セキュリティ/g, "security");
    // その他
    s = s.replace(/^other$|その他/g, "other");

    // 8. "mobility&telematics" 形式への統一 (and が残ったケース)
    s = s.replace(/mobility&telematics/g, "mobility&telematics"); // no-op 保証
    s = s.replace(/([a-z\u3040-\u30ff\u4e00-\u9fff])&([a-z\u3040-\u30ff\u4e00-\u9fff])/g, "$1&$2");

    // 9. 残った空白除去
    s = s.replace(/\s+/g, "");

    return s;
}

const _JP_RE = /[\u3040-\u30ff\u4e00-\u9fff\uff01-\uffee]/;

/**
 * 同じ display_key グループ内の segment_name 群から表示名を選ぶ。
 * 優先: 日本語含む → 長い → 先頭
 */
export function pickSegmentDisplayName(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    const jpNames = names.filter((n) => _JP_RE.test(n));
    const pool = jpNames.length > 0 ? jpNames : names;
    return pool.reduce((best, cur) => (cur.length >= best.length ? cur : best), pool[0]);
}
