-- ============================================================
-- Migration 007: api_latest_financials ビューに unit / normalized_at を追加
-- ============================================================
--
-- ★ 必須手順: 実行前に現行ビュー定義を取得して確認すること
--
--   SELECT pg_get_viewdef('api_latest_financials'::regclass, true);
--
-- 取得した定義をベースに unit / normalized_at を追加する。
-- 勝手に簡略化しないこと。latest抽出・重複解消・correction反映等の
-- ロジックが含まれている場合はそのまま保持する。
--
-- 以下は現行 005 定義ベースの例。
-- 本番で定義が異なる場合は pg_get_viewdef の結果に合わせて修正すること。
--
-- 実行: Supabase SQL Editor で実行
-- ============================================================

DROP VIEW IF EXISTS api_latest_financials;

CREATE VIEW api_latest_financials AS
SELECT
    ticker,
    period,
    quarter,
    sales,
    NULL::bigint          AS revenue,
    gross_profit,
    NULL::bigint          AS sga,
    operating_profit,
    NULL::bigint          AS ordinary_profit,
    NULL::bigint          AS profit,
    NULL::bigint          AS net_income,
    NULL::numeric         AS eps,
    NULL::bigint          AS assets,
    NULL::bigint          AS equity,
    NULL::bigint          AS operating_cf,
    NULL::bigint          AS investing_cf,
    NULL::bigint          AS financing_cf,
    NULL::timestamptz     AS disclosure_datetime,
    false                 AS correction_flag,
    updated_at            AS extracted_at,
    source,
    unit,                 -- ★ 追加
    normalized_at,        -- ★ 追加
    updated_at
FROM financials;

-- RLS は基底テーブル (financials) 側で設定済み。
-- ビューは基底テーブルの RLS を継承する (SECURITY INVOKER)。
