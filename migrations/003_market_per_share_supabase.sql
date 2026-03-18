-- ============================================================
-- 003_market_per_share_supabase.sql
-- Supabase (PostgreSQL) 版: market_data + per_share_data + RLS
-- Supabase SQL Editor で実行
-- ============================================================

-- =========================
-- 1) market_data — 日次株価
-- =========================
CREATE TABLE IF NOT EXISTS market_data (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker         TEXT        NOT NULL,
  date           DATE        NOT NULL,
  open           NUMERIC,
  high           NUMERIC,
  low            NUMERIC,
  close          NUMERIC,
  volume         BIGINT,
  turnover       NUMERIC,
  adj_factor     NUMERIC,
  adj_close      NUMERIC,
  adj_volume     BIGINT,
  market_cap     NUMERIC,
  source         TEXT        NOT NULL DEFAULT 'jquants',
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS ix_market_data_ticker
ON market_data(ticker);

CREATE INDEX IF NOT EXISTS ix_market_data_date
ON market_data(date DESC);

-- RLS
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select market_data" ON market_data;
CREATE POLICY "Allowed users can select market_data"
    ON market_data FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- =========================
-- 2) per_share_data — 1株当たり指標
-- =========================
CREATE TABLE IF NOT EXISTS per_share_data (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker                   TEXT NOT NULL,
  period                   TEXT NOT NULL,
  quarter                  TEXT NOT NULL,
  disclosed_date           TEXT,
  -- 実績
  eps                      NUMERIC,
  diluted_eps              NUMERIC,
  bps                      NUMERIC,
  dividend_q1              NUMERIC,
  dividend_q2              NUMERIC,
  dividend_q3              NUMERIC,
  dividend_fy_end          NUMERIC,
  dividend_annual          NUMERIC,
  payout_ratio             NUMERIC,
  -- 予想
  forecast_eps             NUMERIC,
  forecast_dividend_annual NUMERIC,
  forecast_payout_ratio    NUMERIC,
  -- 株式数
  shares_outstanding       BIGINT,
  treasury_stock           BIGINT,
  avg_shares               BIGINT,
  -- BS指標
  total_assets             BIGINT,
  equity                   BIGINT,
  equity_ratio             NUMERIC,
  -- メタ
  source                   TEXT NOT NULL DEFAULT 'jquants',
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ticker, period, quarter)
);

CREATE INDEX IF NOT EXISTS ix_per_share_data_ticker
ON per_share_data(ticker);

CREATE INDEX IF NOT EXISTS ix_per_share_data_period
ON per_share_data(ticker, period DESC);

-- RLS
ALTER TABLE per_share_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allowed users can select per_share_data" ON per_share_data;
CREATE POLICY "Allowed users can select per_share_data"
    ON per_share_data FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- ============================================================
-- END
-- ============================================================
