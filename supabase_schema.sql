-- ============================================================
-- Company Viewer — 本番向け DB スキーマ & RLS
-- Supabase SQL Editor で実行
-- IF EXISTS / IF NOT EXISTS で何度実行しても安全
-- ============================================================

-- 1. extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 2. allowed_users テーブル (3人制限用)
-- ============================================================
CREATE TABLE IF NOT EXISTS allowed_users (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text        NOT NULL UNIQUE,
    display_name text       NULL,
    user_id     uuid        NULL,  -- 将来 auth.uid() ベース移行用
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. company_memo_grids テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS company_memo_grids (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker      text        NOT NULL,
    period      text        NOT NULL,
    quarter     text        NOT NULL,
    grid_json   jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(ticker, period, quarter)
);

-- ============================================================
-- 4. RLS — company_memo_grids
-- ============================================================
ALTER TABLE company_memo_grids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON company_memo_grids;
DROP POLICY IF EXISTS "Allowed users can select memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Allowed users can insert memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Allowed users can update memos" ON company_memo_grids;

CREATE POLICY "Allowed users can select memos"
    ON company_memo_grids FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

CREATE POLICY "Allowed users can insert memos"
    ON company_memo_grids FOR INSERT
    WITH CHECK (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

CREATE POLICY "Allowed users can update memos"
    ON company_memo_grids FOR UPDATE
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- ============================================================
-- 5. RLS — financials
-- ============================================================
ALTER TABLE financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON financials;
DROP POLICY IF EXISTS "Allowed users can select financials" ON financials;

CREATE POLICY "Allowed users can select financials"
    ON financials FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- ============================================================
-- 6. RLS — allowed_users 自体
-- ============================================================
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read" ON allowed_users;

-- ============================================================
-- 7. updated_at 自動更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON company_memo_grids;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON company_memo_grids
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. company_paste_memos テーブル (MEMO A 用)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_paste_memos (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker          text        NOT NULL,
    view_type       text        NOT NULL DEFAULT 'pl_memo_a',
    memo_grid_json  jsonb       NOT NULL DEFAULT '[]'::jsonb,
    updated_by      uuid        NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticker, view_type)
);

-- ============================================================
-- 9. RLS — company_paste_memos
-- ============================================================
ALTER TABLE company_paste_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Allowed users can insert paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Allowed users can update paste memos" ON company_paste_memos;

CREATE POLICY "Allowed users can select paste memos"
    ON company_paste_memos FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

CREATE POLICY "Allowed users can insert paste memos"
    ON company_paste_memos FOR INSERT
    WITH CHECK (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

CREATE POLICY "Allowed users can update paste memos"
    ON company_paste_memos FOR UPDATE
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- ============================================================
-- 10. updated_at トリガー — company_paste_memos
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_paste_memos ON company_paste_memos;
CREATE TRIGGER set_updated_at_paste_memos
    BEFORE UPDATE ON company_paste_memos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 11. segment_financials テーブル (セグメント業績用)
-- ============================================================
CREATE TABLE IF NOT EXISTS segment_financials (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker           text        NOT NULL,
    period           text        NOT NULL,
    quarter          text        NOT NULL,
    segment_name     text        NOT NULL,
    segment_sales    numeric     NULL,
    segment_profit   numeric     NULL,
    raw_profit_label text        NULL,
    data_source      text        DEFAULT 'tdnet',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticker, period, quarter, segment_name)
);

-- ============================================================
-- 12. RLS — segment_financials
-- ============================================================
ALTER TABLE segment_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select segments" ON segment_financials;

CREATE POLICY "Allowed users can select segments"
    ON segment_financials FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- ============================================================
-- END — ここまで実行したら次は allowed_users にメール登録
-- ============================================================
