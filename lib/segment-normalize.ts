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
    // 物流・ロジスティクス
    s = s.replace(/logistics|物流|ロジスティクス/g, "logistics");
    // 不動産
    s = s.replace(/realestate|不動産/g, "realestate");

    // 7b. 汎用日英語彙変換 — 意味が強く同義な語のみ
    // 採用・リクルーティング
    s = s.replace(/recruiting|recruitment|リクルーティング|採用/g, "recruiting");
    // 人材・HR
    s = s.replace(/humanresources|staffing|人材|ヒューマンリソース/g, "humanresources");
    // ※ "hr" は単独一致のみ (hour等との衝突を避ける)
    if (s === "hr") s = "humanresources";
    // 小売
    s = s.replace(/retail|小売/g, "retail");
    // 卸売
    s = s.replace(/wholesale|卸売/g, "wholesale");
    // 金融・ファイナンス
    s = s.replace(/financial|finance|金融|ファイナンス/g, "finance");
    // 建設
    s = s.replace(/construction|建設/g, "construction");
    // 製造
    s = s.replace(/manufacturing|製造/g, "manufacturing");
    // システム
    s = s.replace(/systems|system|システム/g, "system");
    // ソフトウェア
    s = s.replace(/software|ソフトウェア/g, "software");
    // DX・デジタルトランスフォーメーション
    s = s.replace(/digitaltransformation|デジタルトランスフォーメーション/g, "dx");
    // クラウド
    s = s.replace(/cloud|クラウド/g, "cloud");
    // メディア
    s = s.replace(/media|メディア/g, "media");
    // 広告
    s = s.replace(/advertising|advertisement|広告/g, "advertising");
    // ※ "ad" は単独一致のみ
    if (s === "ad") s = "advertising";
    // 教育
    s = s.replace(/education|教育/g, "education");
    // 医療・ヘルスケア
    s = s.replace(/healthcare|medical|医療|ヘルスケア/g, "healthcare");
    // 介護
    s = s.replace(/nursingcare|介護/g, "nursingcare");
    // 飲食・フードサービス
    s = s.replace(/foodservice|restaurant|飲食|フードサービス/g, "foodservice");
    // エネルギー
    s = s.replace(/energy|エネルギー/g, "energy");
    // 環境
    s = s.replace(/environmental|environment|環境/g, "environment");

    // 8. "mobility&telematics" 形式への統一 (and が残ったケース)
    s = s.replace(/mobility&telematics/g, "mobility&telematics"); // no-op 保証
    s = s.replace(/([a-z\u3040-\u30ff\u4e00-\u9fff])&([a-z\u3040-\u30ff\u4e00-\u9fff])/g, "$1&$2");

    // 9. 残った空白除去
    s = s.replace(/\s+/g, "");

    return s;
}

/**
 * TDNET英語セグメント名を、EDINET日本語候補テキストへ変換する。
 * FinancialsTable で日本語アンカーへの吸着に使用する。
 * 変換できない場合は "" を返す（呼び出し側でフォールバック）。
 *
 * 変換例:
 *   "HR Platform Business"              → "hrプラットフォーム"
 *   "Local Information Service Business"→ "地域情報サービス"
 *   "Recruiting Business"               → "リクルーティング"
 *   "Human Resource Business"           → "人材サービス"
 *   "Overseas Business"                 → "海外"
 */
export function normalizeSegmentAliasKey(name: string): string {
    if (!name) return "";
    // 全角→半角 + 小文字化 + trim
    const s = name.normalize("NFKC").toLowerCase().trim();

    // フレーズ照合（具体的・長いものを先に）
    const PHRASE_MAP: [RegExp, string][] = [
        [/hr\s*platform/,                  "hrプラットフォーム"],
        [/local\s*information\s*service/,  "地域情報サービス"],
        [/information\s*publishing/,       "情報出版"],
        [/human\s*resources?\b/,           "人材サービス"],
        [/\brecruit(?:ing|ment)?\b/,       "リクルーティング"],
        [/\boverseas\b/,                   "海外"],
        [/real\s*estate/,                  "不動産"],
        [/\blogistics\b/,                  "物流"],
        [/\bfinancial\b/,                  "金融"],
        [/\bretail\b/,                     "小売"],
        [/\bwholesale\b/,                  "卸売"],
        [/\bconstruction\b/,               "建設"],
        [/\bmanufacturing\b/,              "製造"],
        [/\beducation\b/,                  "教育"],
        [/\bhealthcare\b/,                 "医療"],
        [/\bmedical\b/,                    "医療"],
        [/\bmedia\b/,                      "メディア"],
        [/\benergy\b/,                     "エネルギー"],
        [/\benvironment/,                  "環境"],
        [/\bpublishing\b/,                 "出版"],
        [/\badvertis/,                     "広告"],
    ];

    for (const [pattern, candidate] of PHRASE_MAP) {
        if (pattern.test(s)) return candidate;
    }
    return "";
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
