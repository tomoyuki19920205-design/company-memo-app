-- ============================================================
-- draft_009_create_edinet_order_data.sql
-- EDINET受注系データ テーブル作成案
--
-- !! DRAFT ONLY — 実行禁止 !!
-- !! 本番 Supabase には絶対に実行しないこと !!
-- !! 設計レビュー用ファイルです !!
--
-- 設計詳細: docs/edinet-order-backlog-db-design.md 参照
-- 実行前確認: PostgreSQL バージョン / NULLS NOT DISTINCT 対応可否
-- ============================================================

-- ============================================================
-- [前提] PostgreSQL バージョン確認
-- 本 SQL は NULLS NOT DISTINCT (PostgreSQL 15+) を使用する。
-- 実行前に必ず以下で確認すること:
--   SELECT version();
-- PG14 以下の場合は NULLS NOT DISTINCT を削除し、
-- segment_name の代替処理（未決事項 #2 参照）を設計すること。
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
        -- 未決事項 #5 参照。

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
        -- 未決事項 #3: '2024' か '2024/03' か。形式が決まったら更新。

    fiscal_year             integer     NOT NULL,
        -- 決算年度（整数）。クエリ・ソート用。
        -- 例: 2024

    -- ----------------------------------------------------------
    -- 受注系指標（百万円統一）
    -- DB格納値は変換後の百万円。変換前の元単位は unit カラムに記録。
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
    -- 単位
    -- ----------------------------------------------------------
    unit                    text        NOT NULL DEFAULT 'million_yen',
        -- 変換前の元の単位を記録する。DB格納値は常に百万円。
        -- 変換ルール:
        --   'million_yen'  → そのまま格納
        --   'billion_yen'  → × 100 して格納
        --   'thousand_yen' → ÷ 1,000 して格納
        --   'yen'          → ÷ 1,000,000 して格納
        --   'unknown'      → 単位不明、値は NULL で保存

    CONSTRAINT edinet_order_data_unit_check
        CHECK (unit IN ('million_yen', 'billion_yen', 'thousand_yen', 'yen', 'unknown')),

    -- ----------------------------------------------------------
    -- セグメント
    -- ----------------------------------------------------------
    segment_name            text        NULL,
        -- NULL    = 連結全体（全社合計）
        -- 非NULL  = セグメント名（有報原文をそのまま格納）
        -- 例: '建設', '設備', 'Civil Engineering'
        -- 正規化は将来対応。初期は原文のまま。

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
-- B. UNIQUE 制約
-- ============================================================

-- 前提: PostgreSQL 15+ の NULLS NOT DISTINCT が必要。
-- segment_name が NULL の行（連結全体）と非NULL（セグメント別）を
-- 同一テーブルで共存させるために必要。
--
-- PG14 以下の場合の代替案（未決事項 #2）:
--   segment_name を NOT NULL にして連結全体を '__ALL__' などの
--   sentinel 値で表現する。または generated column で対応。

ALTER TABLE edinet_order_data
    ADD CONSTRAINT edinet_order_data_uniq
    UNIQUE NULLS NOT DISTINCT (
        ticker,
        period,
        fiscal_year,
        segment_name,   -- NULL = 連結全体として一意
        source_type
    );


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
-- -- Viewer からの直接書き込みは不要なため、Viewer 側ポリシーは不要。
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
-- カラム確認:
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


-- ============================================================
-- END OF DRAFT — !! 実行禁止 !!
-- 設計レビュー・未決事項解消後に 009_edinet_order_data.sql として正式化
-- ============================================================
