# EDINET受注系データ DB保存設計

> **ステータス**: 設計案（未実装）  
> **対象**: `company-memo-app` / Supabase  
> **次のマイグレーション番号**: `009`

---

## 1. 検討結論サマリー

| 項目 | 結論 |
|---|---|
| 保存先 | **新規テーブル `edinet_order_data`** |
| 既存テーブルへの混入 | **しない**（`canonical_financials` / `financials` とは分離） |
| RPO の扱い | order_backlog と**別カラム**で保持 |
| 単位 | DB保存値は**百万円統一**（変換後）、元単位は `source_unit`・変換前の元値は `raw_*` カラムに記録 |
| セグメント別 | **同テーブルで `segment_name` NULL = 連結全体**として対応 |
| NULL / low confidence | `confidence` カラム + `null_reason` カラムで保持 |
| unique制約 | `(ticker, period, fiscal_year, segment_name_key, source_type)` — generated columnによるPG14対応版 |

---

## 2. なぜ `canonical_financials` / `financials` に混ぜないか

```
financials / canonical_financials
  ├── 構造: (ticker, period, quarter, metric_name, value)
  ├── データ源: TDnet / J-Quants（構造化済み）
  ├── 単位: 百万円 or 円（migration 006 で管理）
  └── 想定: P/L・B/S・C/F など標準財務指標

edinet_order_data（新規）
  ├── 構造: 受注高・受注残高・RPO などが複数カラムで横持ち
  ├── データ源: EDINET有報（テキスト抽出・AI解析）
  ├── 信頼性: 低い場合がある（confidence で管理）
  └── 想定: 建設・設備・製造などの受注系業種専用
```

**混入しない理由：**
1. **スキーマが異なる** — 縦持ち(metric_name/value)と横持ち(orders_received, order_backlog…)は共存が難しい
2. **信頼性が異なる** — EDINET抽出は誤抽出リスクがあり、`confidence` で管理が必要
3. **ソースが異なる** — TDnet/J-Quants は構造化API、EDINET有報はテキスト解析
4. **クエリが異なる** — 受注系データは専用ビューで加工が前提

---

## 3. テーブル設計

### 3-1. `edinet_order_data`

```sql
CREATE TABLE IF NOT EXISTS edinet_order_data (
    -- PK
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 銘柄識別
    ticker                  text        NOT NULL,   -- 4桁コード (normalizeTicker 後)
    company_name            text        NULL,       -- 表示用（companies テーブルの補完用途）

    -- EDINET書類識別
    doc_id                  text        NULL,       -- EDINET docID (例: S100XXXX)

    -- 期間
    period                  text        NOT NULL,   -- 例: '2024' (決算年度文字列)
    fiscal_year             integer     NOT NULL,   -- 例: 2024 (整数、クエリ用)

    -- 受注系指標（百万円統一）
    orders_received         numeric     NULL,       -- 受注高（百万円変換後）
    order_backlog           numeric     NULL,       -- 受注残高（期末、百万円変換後）
    construction_carryover  numeric     NULL,       -- 繰越工事高（建設業系、百万円変換後）
    completed_construction  numeric     NULL,       -- 完成工事高（建設業系、百万円変換後）
    rpo                     numeric     NULL,       -- RPO（Remaining Performance Obligation、百万円変換後）
                                                    -- ※ order_backlog と概念が異なるため別カラム
                                                    -- 参照: ASC 606 / IFRS 15 の未充足履行義務

    -- 変換前の元値（source_unit の単位のまま）
    -- 千円・円単位の場合に百万円変換で端数が失われるため別カラムで保持する。
    raw_orders_received         numeric NULL,       -- 受注高の変換前元値
    raw_order_backlog           numeric NULL,       -- 受注残高の変換前元値
    raw_construction_carryover  numeric NULL,       -- 繰越工事高の変換前元値
    raw_completed_construction  numeric NULL,       -- 完成工事高の変換前元値
    raw_rpo                     numeric NULL,       -- RPO の変換前元値

    -- 単位
    source_unit             text        NOT NULL DEFAULT 'million_yen',
                                                    -- 変換前の元の単位を記録。DB格納値は常に百万円。
                                                    -- raw_* カラムの値の単位でもある。
                                                    -- 値: 'million_yen' | 'billion_yen' | 'thousand_yen' | 'yen' | 'unknown'

    -- セグメント
    segment_name            text        NULL,       -- NULL = 連結全体, 非NULL = セグメント名
    segment_name_key        text        NOT NULL    -- UNIQUE制約用内部キー（generated column, PG12+）
        GENERATED ALWAYS AS (COALESCE(segment_name, '__ALL__')) STORED,
        --   segment_name IS NULL → '__ALL__'、セグメント別 → セグメント名

    -- データソース・信頼性
    source_type             text        NOT NULL DEFAULT 'edinet_yuho',
                                                    -- 'edinet_yuho' | 'edinet_hanki' | 'manual'
    source_tag              text        NULL,       -- 有報内の参照箇所タグ (例: 'table_order_backlog')
    confidence              text        NOT NULL DEFAULT 'high'
                            CHECK (confidence IN ('high', 'medium', 'low')),
                                                    -- 'high' | 'medium' | 'low'
    null_reason             text        NULL,       -- confidence='low' or 値NULL の理由メモ
                                                    -- 例: 'no_table_found' | 'unit_unclear' | 'multi_value_conflict' | 'not_disclosed'
    snippet                 text        NULL,       -- 抽出元の原文スニペット（検証用）

    -- タイムスタンプ
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
```

### 3-2. UNIQUE 制約（PG14 対応版）

> **PostgreSQL バージョン確認済み**: 本プロジェクトの Supabase は **PG 14.4**。  
> `NULLS NOT DISTINCT`（PG15+）は使用不可のため、generated column で代替する。

```sql
-- PG14 対応: segment_name_key (generated column) で UNIQUE 制約を実現
-- segment_name_key = COALESCE(segment_name, '__ALL__')
--   segment_name IS NULL (連結全体) → '__ALL__' として一意化
--   segment_name = '建設'          → '建設' として一意化

ALTER TABLE edinet_order_data
    ADD CONSTRAINT edinet_order_data_uniq
    UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type);

-- アプリコードでのクエリは引き続き segment_name を利用（segment_name_key は不要）:
--   連結全体: WHERE segment_name IS NULL
--   セグメント別: WHERE segment_name = '建設'
```

### 3-3. インデックス

```sql
-- クエリ頻度の高いアクセスパターン
CREATE INDEX IF NOT EXISTS edinet_order_data_ticker_idx
    ON edinet_order_data (ticker, fiscal_year DESC);

CREATE INDEX IF NOT EXISTS edinet_order_data_doc_idx
    ON edinet_order_data (doc_id)
    WHERE doc_id IS NOT NULL;
```

### 3-4. updated_at トリガー

```sql
DROP TRIGGER IF EXISTS set_updated_at_edinet_order ON edinet_order_data;
CREATE TRIGGER set_updated_at_edinet_order
    BEFORE UPDATE ON edinet_order_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();  -- 既存関数を再利用
```

---

## 4. RPO を order_backlog と分ける理由

| 指標 | 定義 | 会計基準 | 適用業種 |
|---|---|---|---|
| `order_backlog` | 期末時点の受注残高（受注高 − 売上計上済み） | 日本基準（各社定義） | 建設・製造が多い |
| `rpo` | 残存履行義務（未充足の契約上の義務） | IFRS 15 / ASC 606 | SaaS・製造・建設広く適用 |

**なぜ別カラムか：**
- 建設業は `order_backlog`（工事残高）、SaaS は `rpo`（ARRベース）で別概念
- 両方を持つ企業が存在する（例：総合設備メーカー）
- 混在させると分析クエリが複雑化する
- `rpo` は IFRS 15 / ASC 606 採用企業の開示義務であり、`order_backlog` とは会計処理上別扱い

---

## 5. 単位変換方針

```
EDINET有報から抽出した値（元の単位が多様）
  ↓ 抽出スクリプトでの変換
百万円統一（million_yen）
  ↓
DB保存
  source_unit カラム = 変換前の元の単位
  raw_* カラム      = 変換前の元の数値（source_unit 単位のまま）
  値カラム          = 変換後の百万円
```

**変換ルール：**

| 元単位 | 変換処理 | source_unit 値 | 端数損失 |
|---|---|---|---|
| 百万円 | そのまま | `million_yen` | なし |
| 億円 | × 100 | `billion_yen` | なし（整数） |
| 千円 | ÷ 1,000（切捨て） | `thousand_yen` | **あり**（千円以下）|
| 円 | ÷ 1,000,000（切捨て） | `yen` | **あり**（百万円以下）|
| 不明 | NULL で保存 | `unknown` | — |

> **raw_* カラムが端数損失を補完する**: `source_unit='thousand_yen'` の場合、  
> `raw_orders_received = 98765432`（千円）、`orders_received = 98765`（百万円）として両方保持。

---

## 6. セグメント別データの保存方針

| 行 | `segment_name` | 意味 |
|---|---|---|
| 連結全体 | `NULL` | 全社合計の受注高・残高 |
| 建設セグメント | `'建設'` | セグメント別受注データ |
| 設備セグメント | `'設備'` | セグメント別受注データ |

**方針：**
- 連結全体を必ず 1行保存する（`segment_name = NULL`）
- セグメント別は有報に記載がある場合に追加
- セグメント名は有報の原文をそのまま使用（正規化は将来対応）
- 同一 `(ticker, period, source_type)` で複数セグメントが共存できる

---

## 7. NULL / low confidence の保存方針

| 状況 | `confidence` | 値の保存 | `null_reason` |
|---|---|---|---|
| 抽出成功・検証済み | `'high'` | 保存 | NULL |
| 抽出成功・単位不明 | `'medium'` | 保存（要注意） | `'unit_unclear'` |
| 表が見つからない | `'low'` | NULL | `'no_table_found'` |
| 複数候補があり選択不能 | `'low'` | NULL | `'multi_value_conflict'` |
| 開示なし（明示的） | `'high'` | NULL | `'not_disclosed'` |

> **「開示なし」と「抽出失敗」を区別するために `null_reason` は必須**。  
> Viewer 側で「未開示」と「抽出エラー」を別表示するために使用。

---

## 8. カラム一覧（最終版）

**合計: 26カラム**（draft_009: raw_* 5本・source_unit・segment_name_key 統合済み）

| # | カラム | 型 | NOT NULL | デフォルト | 説明 |
|---|---|---|---|---|---|
| 1 | `id` | uuid | ✅ | gen_random_uuid() | PK |
| 2 | `ticker` | text | ✅ | — | 銘柄コード（4桁） |
| 3 | `company_name` | text | — | NULL | 表示用社名（companies JOIN で代替可） |
| 4 | `doc_id` | text | — | NULL | EDINET docID |
| 5 | `period` | text | ✅ | — | 決算年度文字列（例: '2024'） |
| 6 | `fiscal_year` | integer | ✅ | — | 決算年度整数（例: 2024） |
| 7 | `orders_received` | numeric | — | NULL | 受注高（百万円変換後） |
| 8 | `order_backlog` | numeric | — | NULL | 受注残高（百万円変換後） |
| 9 | `construction_carryover` | numeric | — | NULL | 繰越工事高（百万円変換後） |
| 10 | `completed_construction` | numeric | — | NULL | 完成工事高（百万円変換後） |
| 11 | `rpo` | numeric | — | NULL | RPO（百万円変換後） |
| 12 | `raw_orders_received` | numeric | — | NULL | **受注高の変換前元値**（source_unit 単位） |
| 13 | `raw_order_backlog` | numeric | — | NULL | **受注残高の変換前元値** |
| 14 | `raw_construction_carryover` | numeric | — | NULL | **繰越工事高の変換前元値** |
| 15 | `raw_completed_construction` | numeric | — | NULL | **完成工事高の変換前元値** |
| 16 | `raw_rpo` | numeric | — | NULL | **RPO の変換前元値** |
| 17 | `source_unit` | text | ✅ | `'million_yen'` | 変換前の元単位（raw_* の単位でもある） |
| 18 | `segment_name` | text | — | NULL | NULL=連結全体、非NULL=セグメント名 |
| 19 | `segment_name_key` | text | ✅ | generated | **UNIQUE制約用**：`COALESCE(segment_name, '__ALL__')` |
| 20 | `source_type` | text | ✅ | `'edinet_yuho'` | データソース種別 |
| 21 | `source_tag` | text | — | NULL | 有報内の参照箇所タグ |
| 22 | `confidence` | text | ✅ | `'high'` | 抽出信頼度（high/medium/low） |
| 23 | `null_reason` | text | — | NULL | NULL値・low confidenceの理由 |
| 24 | `snippet` | text | — | NULL | 抽出元の原文スニペット（検証用） |
| 25 | `created_at` | timestamptz | ✅ | now() | 作成日時 |
| 26 | `updated_at` | timestamptz | ✅ | now() | 更新日時 |

---

## 9. Migration ファイル案

**ドラフトファイル**: [`migrations/draft_009_create_edinet_order_data.sql`](file:///C:/Users/takuy/OneDrive/company-memo-app/migrations/draft_009_create_edinet_order_data.sql)  
**正式ファイル**: `migrations/009_edinet_order_data.sql`（レビュー承認後に作成）

> `draft_009` には raw_* 5カラム・source_unit が統合済み（25カラム版）。  
> 後追いの migration 010 は不要。

```sql
CREATE TABLE IF NOT EXISTS edinet_order_data (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker                      text        NOT NULL,
    company_name                text        NULL,
    doc_id                      text        NULL,
    period                      text        NOT NULL,
    fiscal_year                 integer     NOT NULL,
    -- 変換後（百万円統一）
    orders_received             numeric     NULL,
    order_backlog               numeric     NULL,
    construction_carryover      numeric     NULL,
    completed_construction      numeric     NULL,
    rpo                         numeric     NULL,
    -- 変換前の元値（source_unit 単位）
    raw_orders_received         numeric     NULL,
    raw_order_backlog           numeric     NULL,
    raw_construction_carryover  numeric     NULL,
    raw_completed_construction  numeric     NULL,
    raw_rpo                     numeric     NULL,
    source_unit                 text        NOT NULL DEFAULT 'million_yen'
                                CHECK (source_unit IN ('million_yen','billion_yen','thousand_yen','yen','unknown')),
    segment_name                text        NULL,
    source_type                 text        NOT NULL DEFAULT 'edinet_yuho'
                                CHECK (source_type IN ('edinet_yuho','edinet_hanki','manual')),
    source_tag                  text        NULL,
    confidence                  text        NOT NULL DEFAULT 'high'
                                CHECK (confidence IN ('high', 'medium', 'low')),
    null_reason                 text        NULL,
    snippet                     text        NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE edinet_order_data
    ADD CONSTRAINT edinet_order_data_uniq
    UNIQUE NULLS NOT DISTINCT (ticker, period, fiscal_year, segment_name, source_type);

CREATE INDEX IF NOT EXISTS edinet_order_data_ticker_idx
    ON edinet_order_data (ticker, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS edinet_order_data_doc_idx
    ON edinet_order_data (doc_id) WHERE doc_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_edinet_order ON edinet_order_data;
CREATE TRIGGER set_updated_at_edinet_order
    BEFORE UPDATE ON edinet_order_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE edinet_order_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allowed users can select edinet_order_data"
    ON edinet_order_data FOR SELECT
    USING (auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users));
```

---

## 10. 未決事項

| # | 項目 | 選択肢 | 推奨 |
|---|---|---|---|
| 1 | PostgreSQL バージョン確認 | `NULLS NOT DISTINCT` の使用可否 | Supabase Dashboard の `SELECT version()` で確認 |
| 2 | PG14 以下の代替 UNIQUE | `COALESCE(segment_name, '__ALL__')` + generated column | PG14 以下ならこちらで再設計 |
| 3 | `period` の形式 | `'2024'` か `'2024/03'` か | 他テーブル（financials等）の `period` 形式に統一する |
| 4 | セグメント名の正規化 | 有報原文そのまま or マスタ管理 | 初期は原文のまま。将来 `edinet_segment_master` テーブルで正規化 |
| 5 | `company_name` の冗長性 | `companies` テーブルを JOIN で引く | JOIN が理想（不要なら削除可） |
| 6 | 抽出スクリプトの連携方式 | Python → Supabase REST API (service_role) | 実装フェーズで別途設計 |
| 7 | 外部キー制約 | `ticker` に `REFERENCES companies(ticker)` | 初期は無し（companies が未整備の場合に備えて） |

---

## 11. 既存テーブル一覧との整合性確認

| テーブル | 本設計との関係 |
|---|---|
| `financials` | **触らない**。P/L・B/S・C/F 系のみ |
| `segment_financials` | **触らない**。セグメント業績のみ |
| `company_memo_grids` | **触らない** |
| `company_paste_memos` | **触らない** |
| `company_kpi_definitions` / `company_kpi_values` | **触らない** |
| `companies` | `ticker` の参照元として活用（外部キー制約は未決） |
| `allowed_users` | RLS の参照元として**再利用** |
