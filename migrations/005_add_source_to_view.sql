-- ============================================================
-- Migration 005: api_latest_financials ビューに source を追加
-- ============================================================
--
-- 経緯:
--   api_latest_financials ビューに source カラムが欠落していた。
--   financials テーブルには source ("jquants"/"tdnet") が存在するが、
--   ビュー定義時に含められなかった。
--   これにより convertToMillions() が円→百万円変換を実行できなかった。
--
-- ビューの役割:
--   - financials テーブルのデータを拡張スキーマで公開
--   - 将来の J-Quants 拡張カラム (revenue, sga, eps, assets等) を
--     NULL 列として予約
--   - correction_flag, extracted_at などの監査列を提供
--   - source 列で出所情報 (jquants/tdnet) を公開
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
    updated_at
FROM financials;

-- RLS は基底テーブル (financials) 側で設定済み。
-- ビューは基底テーブルの RLS を継承する (SECURITY INVOKER)。
