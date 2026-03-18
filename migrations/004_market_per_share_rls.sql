-- ============================================================
-- market_data / per_share_data — RLS ポリシー
-- ============================================================
--
-- 方針:
--   市場データ（株価・1株指標）は公開データだが、
--   Supabase API 直叩きによる匿名アクセスを防ぐため
--   TO authenticated で認証済みユーザーのみに SELECT を許可する。
--   INSERT/UPDATE/DELETE は service_role_key 経由の sync スクリプトのみ。
--
-- セキュリティレイヤー:
--   1. RLS: TO authenticated — anon ロールを遮断
--   2. middleware.ts: auth.getUser() ガード — 未ログインを /login へリダイレクト
--   3. page.tsx: !user チェック — ログイン無しではデータ読み込み不可
--
-- ============================================================

-- market_data
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_data_anon_select ON market_data;
DROP POLICY IF EXISTS market_data_authenticated_select ON market_data;

CREATE POLICY market_data_authenticated_select
    ON market_data
    FOR SELECT
    TO authenticated
    USING (true);

-- per_share_data
ALTER TABLE per_share_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS per_share_data_anon_select ON per_share_data;
DROP POLICY IF EXISTS per_share_data_authenticated_select ON per_share_data;

CREATE POLICY per_share_data_authenticated_select
    ON per_share_data
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- INSERT/UPDATE/DELETE ポリシーは不要。
-- sync スクリプトは SUPABASE_SERVICE_ROLE_KEY で接続し
-- RLS をバイパスして書き込む。
-- ============================================================
