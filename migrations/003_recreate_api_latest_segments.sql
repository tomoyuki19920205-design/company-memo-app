-- ============================================================
-- Migration 003: Recreate api_latest_segments with source priority
-- ============================================================
-- 実行方法: Supabase SQL Editor にペーストして Run
--
-- 変更内容:
-- 1. canonical_segments (EAV) → wide pivot は維持
-- 2. ROW_NUMBER() で source_priority に基づく勝者選択を追加
-- 3. 空 ticker / 空 period 行を除外
-- 4. source / source_priority カラムを返却に追加
-- ============================================================

CREATE OR REPLACE VIEW api_latest_segments AS
WITH
-- Step 1: 空データ除外 + source priority で勝者選択 (metric 単位)
ranked AS (
  SELECT
    cs.*,
    ROW_NUMBER() OVER (
      PARTITION BY cs.ticker, cs.period, cs.quarter, cs.segment_key, cs.metric
      ORDER BY
        cs.source_priority ASC,          -- xbrl(1) > tdnet(3) > excel_legacy(5)
        cs.recency_key DESC,             -- 新しい開示を優先
        cs.updated_at DESC NULLS LAST,   -- 同一 recency なら更新日時
        cs.id DESC                       -- 最終 tie-break
    ) AS rn
  FROM canonical_segments cs
  WHERE cs.ticker IS NOT NULL
    AND cs.ticker <> ''
    AND cs.period IS NOT NULL
    AND cs.period <> ''
),
winners AS (
  SELECT * FROM ranked WHERE rn = 1
),
-- Step 2: EAV → wide ピボット
pivoted AS (
  SELECT
    ticker,
    period,
    quarter,
    segment_name,
    segment_key,
    MAX(CASE WHEN metric = 'sales'            THEN value END) AS sales,
    MAX(CASE WHEN metric = 'revenue'          THEN value END) AS revenue,
    MAX(CASE WHEN metric = 'profit'           THEN value END) AS profit,
    MAX(CASE WHEN metric = 'operating_profit' THEN value END) AS operating_profit,
    MAX(CASE WHEN metric = 'segment_profit'   THEN value END) AS segment_profit,
    MAX(CASE WHEN metric = 'assets'           THEN value END) AS assets,
    -- 勝者の source 情報 (表示補助用)
    MIN(source)           AS source,
    MIN(source_priority)  AS source_priority
  FROM winners
  GROUP BY ticker, period, quarter, segment_name, segment_key
)
SELECT * FROM pivoted;

-- ============================================================
-- 適用後の検証クエリ (以下を個別に実行して確認)
-- ============================================================

-- V1. 空 ticker 行が除外されていること
-- SELECT COUNT(*) AS empty_ticker_rows
-- FROM api_latest_segments
-- WHERE ticker IS NULL OR ticker = '';
-- → 0 であること

-- V2. 重複なし確認
-- SELECT ticker, period, quarter, segment_name, COUNT(*) AS cnt
-- FROM api_latest_segments
-- GROUP BY ticker, period, quarter, segment_name
-- HAVING COUNT(*) > 1;
-- → 0件であること

-- V3. source / source_priority の実値分布
-- SELECT source, source_priority, COUNT(*) AS cnt
-- FROM api_latest_segments
-- GROUP BY source, source_priority
-- ORDER BY source_priority;
-- → source と priority の対応が正しいこと

-- V4. 総行数確認
-- SELECT COUNT(*) AS total_rows FROM api_latest_segments;

-- V5. サンプルデータ確認
-- SELECT ticker, period, quarter, segment_name, sales, profit, source, source_priority
-- FROM api_latest_segments
-- WHERE ticker = '1736'
-- ORDER BY period DESC, quarter DESC, segment_name
-- LIMIT 20;
