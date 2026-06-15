# EDINET受注系データ raw_value 追加レビュー

> **目的**: draft_009 の元値保存設計の最終レビュー
> **対象**: `migrations/draft_009_create_edinet_order_data.sql`
> **ステータス**: レビューのみ（実装禁止・DB変更禁止）

---

## 1. edinet_order_data 全カラム一覧（draft_009 現状）

| # | カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|---|
| 1 | `id` | uuid | NOT NULL | gen_random_uuid() | PK |
| 2 | `ticker` | text | NOT NULL | — | 4桁銘柄コード |
| 3 | `company_name` | text | NULL | NULL | 表示用社名（未決事項: JOIN で代替可） |
| 4 | `doc_id` | text | NULL | NULL | EDINET docID |
| 5 | `period` | text | NOT NULL | — | 決算年度文字列（形式未決） |
| 6 | `fiscal_year` | integer | NOT NULL | — | 決算年度整数 |
| 7 | `orders_received` | numeric | NULL | NULL | 受注高（百万円変換後） |
| 8 | `order_backlog` | numeric | NULL | NULL | 受注残高（百万円変換後） |
| 9 | `construction_carryover` | numeric | NULL | NULL | 繰越工事高（百万円変換後） |
| 10 | `completed_construction` | numeric | NULL | NULL | 完成工事高（百万円変換後） |
| 11 | `rpo` | numeric | NULL | NULL | RPO（百万円変換後） |
| 12 | `unit` | text | NOT NULL | 'million_yen' | 変換前の元単位（※リネーム案: source_unit） |
| 13 | `segment_name` | text | NULL | NULL | NULL=連結全体 / 非NULL=セグメント名 |
| 14 | `source_type` | text | NOT NULL | 'edinet_yuho' | データソース種別 |
| 15 | `source_tag` | text | NULL | NULL | 有報内の参照箇所タグ |
| 16 | `confidence` | text | NOT NULL | 'high' | 抽出信頼度 (high/medium/low) |
| 17 | `null_reason` | text | NULL | NULL | NULL値・low confidenceの理由 |
| 18 | `snippet` | text | NULL | NULL | 抽出元の原文スニペット |
| 19 | `created_at` | timestamptz | NOT NULL | now() | 作成日時 |
| 20 | `updated_at` | timestamptz | NOT NULL | now() | 更新日時 |

**合計: 20カラム**

---

## 2. 百万円変換後の保存例

### 例A: 億円単位の場合

```
EDINET有報の記載:
  「受注残高 5,340億円」

抽出スクリプトの処理:
  元値   = 5340
  元単位 = '億円' → source_unit = 'billion_yen'
  変換後 = 5340 × 100 = 534,000 (百万円)

DB格納:
  order_backlog = 534000   ← 変換後の値
  source_unit   = 'billion_yen'  ← 変換前の単位のみ記録
  raw_order_backlog = ??? ← 現状: カラムなし（元値 5340 が消える）
  snippet       = '受注残高 5,340億円'  ← 原文文字列のみ残る
```

### 例B: 百万円単位の場合

```
EDINET有報の記載:
  「受注高 123,456百万円」

処理:
  元値   = 123456
  元単位 = '百万円' → source_unit = 'million_yen'
  変換後 = 123456 (そのまま)

DB格納:
  orders_received   = 123456  ← 変換後 = 元値と同じ
  source_unit       = 'million_yen'
  raw_orders_received = ??? ← この場合は元値 = 変換後と同じなので損失なし
  snippet           = '受注高 123,456百万円'
```

### 例C: 千円単位の場合

```
EDINET有報の記載:
  「完成工事高 98,765,432千円」

処理:
  元値   = 98765432
  元単位 = '千円' → source_unit = 'thousand_yen'
  変換後 = 98765432 ÷ 1000 = 98765.432 → 四捨五入で 98765 (百万円)

DB格納:
  completed_construction = 98765
  source_unit            = 'thousand_yen'
  raw_completed_construction = ??? ← 元値 98765432 が消える（端数も失われる）
  snippet = '完成工事高 98,765,432千円'
```

---

## 3. 元値が失われるケース

### ケース一覧

| ケース | 元単位 | 元値の損失 | 影響 |
|---|---|---|---|
| 億円 → 百万円 | billion_yen | **あり**（× 100 の逆算可能） | 軽微（端数なし） |
| 千円 → 百万円 | thousand_yen | **あり**（÷ 1000 で端数切捨て） | **中**（端数 999千円まで消える） |
| 円 → 百万円 | yen | **あり**（÷ 1,000,000 で大きな端数切捨て） | **大**（数十万円単位の誤差） |
| 百万円 → 百万円 | million_yen | なし（変換不要） | なし |
| 単位不明 | unknown | 値を NULL で保存 | 値そのものが失われる |

### 逆算可能性の評価

```
億円 → 百万円 (× 100):
  逆算: 格納値 ÷ 100 = 元値（整数）→ 完全復元可能

千円 → 百万円 (÷ 1000):
  逆算: 格納値 × 1000 = 近似値（下位 3 桁の情報が失われる）
  例: 格納値 98765 → 逆算 98,765,000 千円 ≠ 元値 98,765,432 千円
  差: 432 千円（約43万円）が消える

円 → 百万円 (÷ 1,000,000):
  逆算: 格納値 × 1,000,000 = 近似値（下位 6 桁が失われる）
  例: 格納値 98765 → 逆算 98,765,000,000 円 ≠ 元値 98,765,432,100 円
  差: 432,100 円（約43万円）が消える
```

### 損失の深刻度

```
百万円単位: 問題なし ✅
億円単位:   端数なし・逆算容易 → 実用上問題なし ✅
千円単位:   端数あり・逆算で千円以下が失われる → 中リスク ⚠️
円単位:     端数あり・逆算で百万円以下が失われる → 高リスク ⚠️（ただし稀）
```

---

## 4〜8. raw_* カラム追加のメリット・デメリット

### 対象カラム（追加候補）

| 追加カラム | 対応する変換後カラム |
|---|---|
| `raw_orders_received` | `orders_received` |
| `raw_order_backlog` | `order_backlog` |
| `raw_construction_carryover` | `construction_carryover` |
| `raw_completed_construction` | `completed_construction` |
| `raw_rpo` | `rpo` |

### メリット

| メリット | 詳細 |
|---|---|
| **変換ロジックの検証が可能** | `raw_value × 変換係数 = 変換後の値` を後から確認できる |
| **端数の損失なし** | 千円・円単位の場合でも元の精度を保持できる |
| **再計算が可能** | 変換ロジックのバグ修正後に `UPDATE ... SET orders_received = raw_orders_received * factor` で再適用できる |
| **監査・デバッグ** | 抽出スクリプトの問題を数値レベルで追跡できる |
| **snippet との突合** | `snippet` の文字列と `raw_value` の数値を突き合わせて一致確認できる |

### デメリット

| デメリット | 詳細 |
|---|---|
| **カラム数の増加** | 5カラム追加で 20 → 25カラムに増加 |
| **抽出スクリプトの実装コスト増** | 変換前の元値を別途取得・格納するロジックが必要 |
| **NULL ルールが複雑化** | 変換後が NULL の場合、元値も NULL か。confidence='low' の場合は？ |
| **単位ミックス** | `raw_*` カラムの単位が `source_unit` に依存するため、カラム単体では単位が不明（コメントで明示が必要） |
| **実用頻度が低い** | 百万円単位の企業が多い場合、`raw_value = 変換後の値` となり意味がない行が多くなる |

### 採用判断

| 条件 | 推奨 |
|---|---|
| 千円・円単位の企業が多い場合 | **追加を推奨** |
| 百万円・億円単位が大半の場合 | **snippet のみで初期運用、後で追加** |
| 変換ロジックが複雑で検証が必要な場合 | **追加を推奨** |
| 初期プロトタイプ・小規模運用 | **不要（snippet で代替）** |

---

## 9. source_unit の定義案

前回レビューで指摘した `unit` カラムのリネーム案（`source_unit`）の詳細定義。

### 定義

```sql
source_unit  text  NOT NULL  DEFAULT 'million_yen',
    -- 変換前の元の単位。
    -- DB 格納値（orders_received 等）は常に百万円統一。
    -- 本カラムは「抽出スクリプトが読み取った元の単位」を記録する。
    CONSTRAINT edinet_order_data_source_unit_check
        CHECK (source_unit IN (
            'million_yen',   -- 百万円（変換不要）
            'billion_yen',   -- 億円（× 100 して格納）
            'thousand_yen',  -- 千円（÷ 1,000 して格納）
            'yen',           -- 円（÷ 1,000,000 して格納）
            'unknown'        -- 単位不明（値は NULL で格納）
        )),
```

### 変換係数対応表

| source_unit | DB格納値への変換 | 逆算係数 | 端数リスク |
|---|---|---|---|
| `million_yen` | そのまま | × 1 | なし |
| `billion_yen` | × 100 | ÷ 100 | なし（整数） |
| `thousand_yen` | ÷ 1,000（切捨て） | × 1,000 | **あり（千円以下）** |
| `yen` | ÷ 1,000,000（切捨て） | × 1,000,000 | **あり（百万円以下）** |
| `unknown` | NULL で格納 | N/A | 値なし |

### 旧 `unit` との対応

```sql
-- ドラフトの unit カラムをそのまま source_unit にリネームするだけ
-- 値の定義・CHECK 制約は変更なし
-- 変更: unit → source_unit (名前のみ)
```

---

## 10. migration 010 で追加する場合の SQL 案

> **これは未実行のドラフト案です。実装禁止。**

### ファイル名案

`migrations/draft_010_add_raw_values_to_edinet_order_data.sql`

### SQL 案

```sql
-- ============================================================
-- draft_010_add_raw_values_to_edinet_order_data.sql
-- edinet_order_data テーブルに変換前元値カラムを追加
--
-- !! DRAFT ONLY — 実行禁止 !!
-- !! draft_009 が正式適用された後に検討すること !!
--
-- 目的:
--   百万円変換後の値に加えて、抽出スクリプトが読み取った
--   変換前の元の数値を保存する。
--   変換ロジックの検証・デバッグ・再計算に使用。
-- ============================================================

-- ============================================================
-- A. 元値カラムの追加
-- ============================================================

ALTER TABLE edinet_order_data
    ADD COLUMN IF NOT EXISTS raw_orders_received        numeric NULL,
        -- 受注高の変換前元値（source_unit の単位）
        -- 例: source_unit='billion_yen' の場合、5340 が格納される

    ADD COLUMN IF NOT EXISTS raw_order_backlog          numeric NULL,
        -- 受注残高の変換前元値

    ADD COLUMN IF NOT EXISTS raw_construction_carryover numeric NULL,
        -- 繰越工事高の変換前元値

    ADD COLUMN IF NOT EXISTS raw_completed_construction numeric NULL,
        -- 完成工事高の変換前元値

    ADD COLUMN IF NOT EXISTS raw_rpo                    numeric NULL;
        -- RPO の変換前元値

-- ============================================================
-- B. コメント（実行する場合は COMMENT ON で補足）
-- ============================================================

-- COMMENT ON COLUMN edinet_order_data.raw_orders_received IS
--     '受注高の変換前元値。単位は source_unit カラムを参照。
--      DB格納の orders_received（百万円）= raw_orders_received × 変換係数。';

-- COMMENT ON COLUMN edinet_order_data.raw_order_backlog IS
--     '受注残高の変換前元値。単位は source_unit カラムを参照。';

-- COMMENT ON COLUMN edinet_order_data.raw_construction_carryover IS
--     '繰越工事高の変換前元値。単位は source_unit カラムを参照。';

-- COMMENT ON COLUMN edinet_order_data.raw_completed_construction IS
--     '完成工事高の変換前元値。単位は source_unit カラムを参照。';

-- COMMENT ON COLUMN edinet_order_data.raw_rpo IS
--     'RPO の変換前元値。単位は source_unit カラムを参照。';

-- ============================================================
-- C. 変換検証クエリ（実行後の確認用、コメント）
-- ============================================================

-- 変換誤差の確認（千円・円単位のデータを対象）:
--
-- SELECT
--     ticker, period, source_unit,
--     raw_orders_received,
--     orders_received,
--     CASE source_unit
--         WHEN 'billion_yen'  THEN raw_orders_received * 100
--         WHEN 'thousand_yen' THEN ROUND(raw_orders_received / 1000)
--         WHEN 'yen'          THEN ROUND(raw_orders_received / 1000000)
--         ELSE raw_orders_received
--     END AS recalculated,
--     orders_received - CASE source_unit
--         WHEN 'billion_yen'  THEN raw_orders_received * 100
--         WHEN 'thousand_yen' THEN ROUND(raw_orders_received / 1000)
--         WHEN 'yen'          THEN ROUND(raw_orders_received / 1000000)
--         ELSE raw_orders_received
--     END AS diff_million_yen
-- FROM edinet_order_data
-- WHERE raw_orders_received IS NOT NULL
--   AND source_unit IN ('thousand_yen', 'yen', 'billion_yen');

-- ============================================================
-- D. ROLLBACK 用（コメント）
-- ============================================================

-- ALTER TABLE edinet_order_data
--     DROP COLUMN IF EXISTS raw_orders_received,
--     DROP COLUMN IF EXISTS raw_order_backlog,
--     DROP COLUMN IF EXISTS raw_construction_carryover,
--     DROP COLUMN IF EXISTS raw_completed_construction,
--     DROP COLUMN IF EXISTS raw_rpo;

-- ============================================================
-- END OF DRAFT — !! 実行禁止 !!
-- 009 適用後・設計確定後に正式化すること
-- ============================================================
```

---

## 設計決定サマリー（draft_009 + 010 を含む）

### draft_009 に対する推奨変更（実行前に対応）

| 変更 | 内容 | 優先度 |
|---|---|---|
| `unit` → `source_unit` にリネーム | カラム名の明確化 | 中 |
| PG バージョン確認 | `SELECT version()` で確認 | 高（必須） |

### draft_010 の採用判断

| 条件 | 判断 |
|---|---|
| 千円・円単位の企業が対象に含まれる | → **010 を採用して raw_value を保存** |
| 百万円・億円のみが対象 | → **010 は不要（snippet で代替）** |
| プロトタイプ・初期実験段階 | → **009 のみで運用開始し、後で 010 を判断** |

### 最終的なカラム構成（010 適用後）

| グループ | カラム数 | カラム |
|---|---|---|
| 識別 | 5 | id, ticker, company_name, doc_id, fiscal_year / period |
| 変換後の値（百万円） | 5 | orders_received, order_backlog, construction_carryover, completed_construction, rpo |
| 変換前の元値 | 5 | raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo |
| 単位・ソース | 4 | source_unit, segment_name, source_type, source_tag |
| 信頼性 | 3 | confidence, null_reason, snippet |
| タイムスタンプ | 2 | created_at, updated_at |
| **合計** | **25** | |
