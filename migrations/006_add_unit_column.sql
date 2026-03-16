-- ============================================================
-- Migration 006: financials テーブルに unit / normalized_at を追加
-- ============================================================
--
-- 目的:
--   各行の金額単位を明示的に記録し、正規化処理の追跡を可能にする。
--
-- unit の値:
--   'yen'         - 円単位（J-Quants 由来、未正規化）
--   'million_yen' - 百万円単位（TDnet 由来 or 正規化済み）
--
-- normalized_at:
--   実際に正規化処理（円→百万円変換）を行った時刻のみ記録。
--   初期設定やもともと百万円のデータでは NULL。
--
-- 実行: Supabase SQL Editor で実行
-- ============================================================

-- カラム追加
ALTER TABLE financials
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'million_yen',
  ADD COLUMN IF NOT EXISTS normalized_at TIMESTAMPTZ;

-- 既存行の unit を source から推定して初期設定
-- normalized_at は「実際に正規化処理を行った時刻」のみ。初期設定では NULL。
UPDATE financials SET unit = 'yen',         normalized_at = NULL WHERE source = 'jquants';
UPDATE financials SET unit = 'million_yen', normalized_at = NULL WHERE source = 'tdnet';
UPDATE financials SET unit = 'million_yen', normalized_at = NULL WHERE source IS NULL OR source = '';
