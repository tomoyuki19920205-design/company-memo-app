-- ============================================================
-- Migration 004: segment_cell_overrides
-- ============================================================
-- 目的: EDINET 1Q/3Q 欠損セルの手入力 overlay
-- canonical_segments は一切触らない
-- ============================================================

CREATE TABLE IF NOT EXISTS segment_cell_overrides (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker        text        NOT NULL,
    fiscal_year   integer     NOT NULL,
    quarter       text        NOT NULL CHECK (quarter IN ('1Q', '3Q')),
    segment_name  text        NOT NULL,
    metric        text        NOT NULL CHECK (metric IN ('sales', 'operating_profit')),
    value         numeric     NULL,
    base_source   text        NULL,
    input_scope   text        NOT NULL DEFAULT 'missing_fill',
    note          text        NULL,
    created_by    text        NULL,
    updated_by    text        NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean     NOT NULL DEFAULT false
);

-- Active レコードの一意制約
CREATE UNIQUE INDEX IF NOT EXISTS uq_segment_cell_overrides_active
ON segment_cell_overrides (ticker, fiscal_year, quarter, segment_name, metric)
WHERE is_deleted = false;

-- パフォーマンス用 index
CREATE INDEX IF NOT EXISTS idx_sco_ticker_fy
ON segment_cell_overrides (ticker, fiscal_year)
WHERE is_deleted = false;

-- ============================================================
-- RLS — auth.uid() IS NOT NULL (既存テーブルと同一パターン)
-- ============================================================
ALTER TABLE segment_cell_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select overrides" ON segment_cell_overrides;
DROP POLICY IF EXISTS "Allowed users can insert overrides" ON segment_cell_overrides;
DROP POLICY IF EXISTS "Allowed users can update overrides" ON segment_cell_overrides;
DROP POLICY IF EXISTS "Authenticated can select overrides" ON segment_cell_overrides;
DROP POLICY IF EXISTS "Authenticated can insert overrides" ON segment_cell_overrides;
DROP POLICY IF EXISTS "Authenticated can update overrides" ON segment_cell_overrides;

CREATE POLICY "Authenticated can select overrides"
    ON segment_cell_overrides FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert overrides"
    ON segment_cell_overrides FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update overrides"
    ON segment_cell_overrides FOR UPDATE
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- updated_at トリガー (既存 update_updated_at() を流用)
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_overrides ON segment_cell_overrides;
CREATE TRIGGER set_updated_at_overrides
    BEFORE UPDATE ON segment_cell_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
