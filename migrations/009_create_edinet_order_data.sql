-- ============================================================
-- 009_create_edinet_order_data.sql
-- EDINET受注系データ テーブル作成
--
-- !! 実行前に Supabase SQL Editor で内容を確認すること !!
-- !! 一度実行するとロールバックは DROP TABLE が必要になる !!
--
-- 設計詳細: docs/edinet-order-backlog-db-design.md 参照
-- ドラフト経緯: migrations/draft_009_create_edinet_order_data.sql 参照
-- ============================================================

-- ============================================================
-- [前提] PostgreSQL バージョン: 14.4 確認済み（2026-06-15）
--
-- 確認方法: /rest/v1/ の OpenAPIレスポンス info.version で「14.4」を確認。
-- → NULLS NOT DISTINCT (PG15+) は使用不可。
--
-- 対応策: generated column + COALESCE で UNIQUE 制約を実現 (PG12+ 対応)
--   segment_name_key = COALESCE(segment_name, '__ALL__')
--   segment_name は引き続き NULL を許可 (NULL = 連結全体)
-- ============================================================


-- ============================================================
-- A. テーブル作成
-- ============================================================

CREATE TABLE edinet_order_data (

    -- ----------------------------------------------------------
    -- PK
    -- ----------------------------------------------------------
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ----------------------------------------------------------
    -- 銘柄識別
    -- ----------------------------------------------------------
    ticker                  text        NOT NULL,
        -- 4桁銘柄コード。normalizeTicker() 適用後の値を格納。
        -- 例: '1234'

    company_name            text        NULL,
        -- 表示用社名。companies テーブルを JOIN して取得することも可。
        -- 冗長になる場合は NULL のみで運用し、カラム自体を削除してよい。

    -- ----------------------------------------------------------
    -- EDINET書類識別
    -- ----------------------------------------------------------
    doc_id                  text        NULL,
        -- EDINET docID。例: 'S100XXXX'
        -- 有報ではなく独自抽出の場合は NULL。

    -- ----------------------------------------------------------
    -- 期間
    -- ----------------------------------------------------------
    period                  text        NOT NULL,
        -- 決算年度文字列。他テーブルの period 形式に統一すること。
        -- 例: '2024' または '2024/03'（形式は既存テーブルに合わせる）

    fiscal_year             integer     NOT NULL,
        -- 決算年度（整数）。クエリ・ソート用。
        -- 例: 2024

    -- ----------------------------------------------------------
    -- 受注系指標（百万円統一）
    -- DB格納値は変換後の百万円。変換前の元単位は source_unit カラムに記録。
    -- 変換前の元値は raw_* カラムに記録。
    -- ----------------------------------------------------------
    orders_received         numeric     NULL,
        -- 受注高 (百万円)

    order_backlog           numeric     NULL,
        -- 受注残高（期末）(百万円)
        -- 日本基準の各社開示値。IFRS の RPO とは別カラムで管理。

    construction_carryover  numeric     NULL,
        -- 繰越工事高 (百万円)。建設業系企業向け。

    completed_construction  numeric     NULL,
        -- 完成工事高 (百万円)。建設業系企業向け。

    rpo                     numeric     NULL,
        -- RPO: Remaining Performance Obligation (百万円)
        -- IFRS 15 / ASC 606 の未充足履行義務。
        -- order_backlog とは会計基準・概念が異なるため別カラム。

    -- ----------------------------------------------------------
    -- 変換前の元値（source_unit の単位のまま）
    -- DB格納値（orders_received 等）は常に百万円統一。
    -- 元値は千円・円単位の場合に端数が失われるため別カラムで保持する。
    -- ----------------------------------------------------------
    raw_orders_received         numeric     NULL,
        -- 受注高の変換前元値（source_unit の単位）
        -- 例: source_unit='billion_yen' の場合 5340 (億円) が格納される

    raw_order_backlog           numeric     NULL,
        -- 受注残高の変換前元値

    raw_construction_carryover  numeric     NULL,
        -- 繰越工事高の変換前元値

    raw_completed_construction  numeric     NULL,
        -- 完成工事高の変換前元値

    raw_rpo                     numeric     NULL,
        -- RPO の変換前元値

    -- ----------------------------------------------------------
    -- 単位
    -- ----------------------------------------------------------
    source_unit             text        NOT NULL DEFAULT 'million_yen',
        -- 変換前の元の単位を記録する。DB格納値は常に百万円。
        -- raw_* カラムの値の単位でもある。
        -- 変換ルール:
        --   'million_yen'  → そのまま格納（raw = 変換後と同値）
        --   'billion_yen'  → × 100 して格納（端数なし）
        --   'thousand_yen' → ÷ 1,000 で格納（千円以下の端数が失われる）
        --   'yen'          → ÷ 1,000,000 で格納（百万円以下の端数が失われる）
        --   'unknown'      → 単位不明、値は NULL で保存

    CONSTRAINT edinet_order_data_source_unit_check
        CHECK (source_unit IN ('million_yen', 'billion_yen', 'thousand_yen', 'yen', 'unknown')),

    -- ----------------------------------------------------------
    -- セグメント
    -- ----------------------------------------------------------
    segment_name            text        NULL,
        -- NULL    = 連結全体（全社合計）
        -- 非NULL  = セグメント名（有報原文をそのまま格納）
        -- 例: '建設', '設備', 'Civil Engineering'
        -- 正規化は将来対応。初期は原文のまま。

    segment_name_key        text        NOT NULL
        GENERATED ALWAYS AS (COALESCE(segment_name, '__ALL__')) STORED,
        -- UNIQUE 制約用の内部キーカラム（PG12+ 対応）。
        -- segment_name が NULL (連結全体) の場合 = '__ALL__' となる。
        -- アプリコードからは直接使用しない。
        -- Viewer でのクエリは segment_name IS NULL で行う。

    -- ----------------------------------------------------------
    -- データソース・信頼性
    -- ----------------------------------------------------------
    source_type             text        NOT NULL DEFAULT 'edinet_yuho',
        -- データの取得元種別。
        -- 'edinet_yuho'   有価証券報告書（年次）
        -- 'edinet_hanki'  半期報告書
        -- 'manual'        手動入力

    CONSTRAINT edinet_order_data_source_type_check
        CHECK (source_type IN ('edinet_yuho', 'edinet_hanki', 'manual')),

    source_tag              text        NULL,
        -- 有報内の参照箇所タグ（抽出スクリプトが付与）。
        -- 例: 'table_order_backlog', 'text_paragraph_3'

    confidence              text        NOT NULL DEFAULT 'high',
        -- 抽出信頼度。
        -- 'high'   正常抽出・検証済み
        -- 'medium' 抽出成功だが単位不明など要注意
        -- 'low'    抽出失敗または競合

    CONSTRAINT edinet_order_data_confidence_check
        CHECK (confidence IN ('high', 'medium', 'low')),

    null_reason             text        NULL,
        -- 値が NULL または confidence が low の理由。
        -- 「未開示」と「抽出失敗」を区別するために使用。
        -- 推奨値:
        --   'no_table_found'        表が見つからない
        --   'unit_unclear'          単位が不明
        --   'multi_value_conflict'  複数候補があり選択不能
        --   'not_disclosed'         企業が明示的に未開示
        --   'parse_error'           抽出スクリプトのパースエラー

    snippet                 text        NULL,
        -- 抽出元の原文スニペット（最大 2000 文字程度を想定）。
        -- 抽出結果の検証・デバッグ用。本番クエリには使用しない。

    -- ----------------------------------------------------------
    -- タイムスタンプ
    -- ----------------------------------------------------------
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()

);


-- ============================================================
-- B. UNIQUE 制約（PG14 対応版）
-- ============================================================

-- Supabase の PostgreSQL バージョンが 14.4 であるため、
-- NULLS NOT DISTINCT (PG15+) は使用不可。
--
-- 代わりに segment_name_key（generated column）を使って UNIQUE 制約を実現。
-- segment_name_key = COALESCE(segment_name, '__ALL__')
--   segment_name IS NULL  (連結全体) → segment_name_key = '__ALL__'
--   segment_name = '建設'              → segment_name_key = '建設'
--
-- アプリコードでの影響:
--   連結全体の取得: WHERE segment_name IS NULL  (変更なし)
--   セグメント別:   WHERE segment_name = '建設'  (変更なし)
--   segment_name_key をクエリで直接使用する必要はない。

ALTER TABLE edinet_order_data
    ADD CONSTRAINT edinet_order_data_uniq
    UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type);


-- ============================================================
-- C. インデックス
-- ============================================================

-- 銘柄 × 年度でのクエリが最多（Viewer の銘柄ロード時）
CREATE INDEX edinet_order_data_ticker_year_idx
    ON edinet_order_data (ticker, fiscal_year DESC);

-- EDINET docID からの逆引き（検証・再抽出時）
CREATE INDEX edinet_order_data_doc_idx
    ON edinet_order_data (doc_id)
    WHERE doc_id IS NOT NULL;

-- confidence でのフィルタ（low データの棚卸し用）
CREATE INDEX edinet_order_data_confidence_idx
    ON edinet_order_data (confidence)
    WHERE confidence IN ('low', 'medium');


-- ============================================================
-- D. updated_at トリガー
-- ============================================================

-- 既存の update_updated_at() 関数を再利用する。
-- 関数が存在しない環境では以下を先に作成すること:
--
-- CREATE OR REPLACE FUNCTION update_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = now();
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_edinet_order ON edinet_order_data;
CREATE TRIGGER set_updated_at_edinet_order
    BEFORE UPDATE ON edinet_order_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- E. RLS（Row Level Security）— コメントのみ、実行はレビュー後
-- ============================================================

-- 実行する場合は以下をコメントアウト解除すること。
-- RLS パターンは他テーブル（financials, companies 等）と統一。
--
-- ALTER TABLE edinet_order_data ENABLE ROW LEVEL SECURITY;
--
-- -- SELECT: allowed_users のみ
-- DROP POLICY IF EXISTS "Allowed users can select edinet_order_data" ON edinet_order_data;
-- CREATE POLICY "Allowed users can select edinet_order_data"
--     ON edinet_order_data FOR SELECT
--     USING (auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users));
--
-- -- INSERT / UPDATE / DELETE: service_role_key 経由のみ許可
-- -- 抽出スクリプトは service_role_key で接続し、RLS をバイパスして書き込む。


-- ============================================================
-- F. ROLLBACK 用コメント（実行しない）
-- ============================================================

-- 本テーブルを削除する場合（ロールバック手順）:
--
-- DROP TABLE IF EXISTS edinet_order_data;
--
-- ※ 関連するトリガー・インデックス・制約は DROP TABLE で自動削除される。
-- ※ update_updated_at() 関数は他テーブルでも使用しているため削除しない。


-- ============================================================
-- G. 実行後確認クエリ（コメント）
-- ============================================================

-- テーブル作成確認:
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'edinet_order_data';
--
-- カラム確認（26カラム確認）:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'edinet_order_data'
--   ORDER BY ordinal_position;
--
-- 制約確認:
--   SELECT conname, contype, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'edinet_order_data'::regclass;
--
-- インデックス確認:
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'edinet_order_data';
--
-- UNIQUE 制約の動作確認（segment_name_key）:
--   SELECT ticker, period, segment_name, segment_name_key
--   FROM edinet_order_data
--   LIMIT 5;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
