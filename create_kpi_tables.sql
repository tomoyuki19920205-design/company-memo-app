-- ============================================================
-- KPIテーブル追加 — Supabase SQL Editor で実行
-- ============================================================

-- 1. KPI列定義テーブル
CREATE TABLE IF NOT EXISTS company_kpi_definitions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker      text        NOT NULL,
    kpi_slot    integer     NOT NULL CHECK (kpi_slot BETWEEN 1 AND 3),
    kpi_name    text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticker, kpi_slot)
);

-- 2. KPI値テーブル
CREATE TABLE IF NOT EXISTS company_kpi_values (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker      text        NOT NULL,
    period      text        NOT NULL,
    quarter     text        NOT NULL,
    kpi_slot    integer     NOT NULL CHECK (kpi_slot BETWEEN 1 AND 3),
    kpi_value   text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticker, period, quarter, kpi_slot)
);

-- 3. updated_at 自動更新トリガー
DROP TRIGGER IF EXISTS set_updated_at_kpi_defs ON company_kpi_definitions;
CREATE TRIGGER set_updated_at_kpi_defs
    BEFORE UPDATE ON company_kpi_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_kpi_vals ON company_kpi_values;
CREATE TRIGGER set_updated_at_kpi_vals
    BEFORE UPDATE ON company_kpi_values
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. RLS
ALTER TABLE company_kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_kpi_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can select kpi_defs" ON company_kpi_definitions;
DROP POLICY IF EXISTS "Authenticated can insert kpi_defs" ON company_kpi_definitions;
DROP POLICY IF EXISTS "Authenticated can update kpi_defs" ON company_kpi_definitions;

CREATE POLICY "Authenticated can select kpi_defs"
    ON company_kpi_definitions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert kpi_defs"
    ON company_kpi_definitions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update kpi_defs"
    ON company_kpi_definitions FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can select kpi_vals" ON company_kpi_values;
DROP POLICY IF EXISTS "Authenticated can insert kpi_vals" ON company_kpi_values;
DROP POLICY IF EXISTS "Authenticated can update kpi_vals" ON company_kpi_values;

CREATE POLICY "Authenticated can select kpi_vals"
    ON company_kpi_values FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert kpi_vals"
    ON company_kpi_values FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update kpi_vals"
    ON company_kpi_values FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 5. 確認
SELECT '=== KPIテーブル作成完了 ===' AS info;
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('company_kpi_definitions', 'company_kpi_values');
