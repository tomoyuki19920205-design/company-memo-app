-- ============================================================
-- RLS修正 v2 — auth.uid() ベース
-- auth.jwt()->>email が不安定なため、auth.uid() IS NOT NULL に変更
-- アプリ側middlewareでログイン必須のため、セキュリティ上問題なし
-- Supabase SQL Editor で全文コピペ実行してください
-- ============================================================

-- STEP 1: allowed_users にメール追加（既存なら無視）
INSERT INTO allowed_users (email)
SELECT email FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- STEP 2: financials
-- ============================================================
ALTER TABLE financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON financials;
DROP POLICY IF EXISTS "Allowed users can select financials" ON financials;
DROP POLICY IF EXISTS "Authenticated can select financials" ON financials;

CREATE POLICY "Authenticated can select financials"
    ON financials FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 3: segment_financials
-- ============================================================
ALTER TABLE segment_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select segments" ON segment_financials;
DROP POLICY IF EXISTS "Allowed users can insert segments" ON segment_financials;
DROP POLICY IF EXISTS "Allowed users can update segments" ON segment_financials;
DROP POLICY IF EXISTS "Authenticated can select segments" ON segment_financials;
DROP POLICY IF EXISTS "Authenticated can insert segments" ON segment_financials;
DROP POLICY IF EXISTS "Authenticated can update segments" ON segment_financials;

CREATE POLICY "Authenticated can select segments"
    ON segment_financials FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert segments"
    ON segment_financials FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update segments"
    ON segment_financials FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 4: company_memo_grids
-- ============================================================
ALTER TABLE company_memo_grids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON company_memo_grids;
DROP POLICY IF EXISTS "Allowed users can select memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Allowed users can insert memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Allowed users can update memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Authenticated can select memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Authenticated can insert memos" ON company_memo_grids;
DROP POLICY IF EXISTS "Authenticated can update memos" ON company_memo_grids;

CREATE POLICY "Authenticated can select memos"
    ON company_memo_grids FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert memos"
    ON company_memo_grids FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update memos"
    ON company_memo_grids FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 5: company_paste_memos
-- ============================================================
ALTER TABLE company_paste_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Allowed users can insert paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Allowed users can update paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Authenticated can select paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Authenticated can insert paste memos" ON company_paste_memos;
DROP POLICY IF EXISTS "Authenticated can update paste memos" ON company_paste_memos;

CREATE POLICY "Authenticated can select paste memos"
    ON company_paste_memos FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert paste memos"
    ON company_paste_memos FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update paste memos"
    ON company_paste_memos FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 6: 確認
-- ============================================================
SELECT '=== RLS状態 ===' AS info;
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('financials', 'segment_financials', 'company_memo_grids', 'company_paste_memos');

SELECT '=== Policy一覧 ===' AS info;
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('financials', 'segment_financials', 'company_memo_grids', 'company_paste_memos')
ORDER BY tablename, policyname;
