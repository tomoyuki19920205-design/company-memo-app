-- ============================================================
-- 008_companies_table.sql — 会社マスタテーブル
-- J-Quants listed info 由来の全銘柄情報を格納
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
    ticker          text PRIMARY KEY,          -- 4桁コード (normalizeTicker 後)
    company_name    text NOT NULL,             -- 和名 (例: トヨタ自動車)
    english_name    text NULL,                 -- 英名
    market_code     text NULL,                 -- 市場コード
    industry        text NULL,                 -- 業種名 (33業種)
    industry_code   text NULL,                 -- 業種コード
    is_active       boolean NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: allowed_users のみ SELECT 可能
-- INSERT/UPDATE/DELETE は service_role_key 経由の sync スクリプトのみ
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select companies" ON companies;
CREATE POLICY "Allowed users can select companies"
    ON companies FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- ============================================================
-- updated_at 自動更新トリガー (既存 update_updated_at 関数を再利用)
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_companies ON companies;
CREATE TRIGGER set_updated_at_companies
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
