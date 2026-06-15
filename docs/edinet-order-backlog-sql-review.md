# EDINET受注系データ SQLレビュー

> **レビュー対象**: `migrations/draft_009_create_edinet_order_data.sql`
> **設計参照**: `docs/edinet-order-backlog-db-design.md`
> **ステータス**: レビュー完了（未実行）

---

## レビュー結果サマリー

| # | 確認項目 | 判定 | 対応要否 |
|---|---|---|---|
| 1 | NULLS NOT DISTINCT の PG バージョン対応 | ✅ **解消済み** | PG14.4 確認済み。generated column（segment_name_key）で代替完了 |
| 2 | segment_name NULL の扱い | ✅ OK | — |
| 3 | source_type を UNIQUE に含める設計 | ✅ OK（注意点あり） | — |
| 4 | confidence / null_reason の CHECK 制約 | ✅ OK（改善案あり） | オプション |
| 5 | unit_raw と unit_normalized の分離要否 | ✅ **解消済み** | `source_unit` にリネーム完了（draft_009 反映済み） |
| 6 | 百万円統一保存で元単位・元値を残せているか | ✅ **解消済み** | `raw_*` 5カラムを draft_009 に統合済み（migration 010 不要） |
| 7 | RPO と order_backlog の混同防止 | ✅ OK | — |
| 8 | updated_at トリガーの既存関数依存 | ✅ OK（注意点あり） | — |
| 9 | インデックスの過剰・不足 | ✅ おおむね適切（微修正案あり） | オプション |
| 10 | ロールバック手順の十分性 | ✅ OK（補足あり） | — |

---

## 1. NULLS NOT DISTINCT の PostgreSQL バージョン対応

**判定: ✅ 解消済み（PG14.4 確認済み・generated column 対応完了）**

### 確認結果

| 項目 | 内容 |
|---|---|
| PostgreSQL バージョン | **14.4** |
| 確認方法 | `/rest/v1/` OpenAPI レスポンスの `info.version` フィールド |
| NULLS NOT DISTINCT | **使用不可**（PG15+ のみ） |

### 適用した代替案: generated column

```sql
-- segment_name_key = COALESCE(segment_name, '__ALL__')
-- → segment_name IS NULL (連結全体) → '__ALL__' として一意化
-- → segment_name = '建設'          → '建設' として一意化

-- CREATE TABLE 内に追加済み（PG12+ 対応）
segment_name_key  text  NOT NULL
    GENERATED ALWAYS AS (COALESCE(segment_name, '__ALL__')) STORED,

-- UNIQUE 制約（segment_name_key を使用）
ALTER TABLE edinet_order_data
    ADD CONSTRAINT edinet_order_data_uniq
    UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type);
```

**アプリコードへの影響なし**: クエリは引き続き `segment_name IS NULL` / `segment_name = '建設'` で実行できる。
`segment_name_key` をアプリ側で直接使用する必要はない。

---

## 2. segment_name NULL の扱い

**判定: ✅ OK**

| `segment_name` | 意味 |
|---|---|
| `NULL` | 連結全体（全社合計） |
| `'建設'` など | セグメント別 |

意図は明確で正しい。UNIQUE 制約が `NULLS NOT DISTINCT` で正しく機能する（PG15+ 前提）。

**注意**: 抽出スクリプトが連結全体行を必ず 1 行挿入することを保証する実装が必要。

---

## 3. source_type を UNIQUE に含める設計

**判定: ✅ OK（注意点あり）**

同一期間・同一セグメントで `edinet_yuho`（有報）と `edinet_hanki`（半期）を別行で共存させる設計。正しい。

**注意**: 再抽出時は UNIQUE 制約でブロックされるため、抽出スクリプトは必ず upsert で書き込むこと。

```sql
INSERT INTO edinet_order_data (...) VALUES (...)
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq
DO UPDATE SET
    orders_received = EXCLUDED.orders_received,
    order_backlog   = EXCLUDED.order_backlog,
    confidence      = EXCLUDED.confidence,
    updated_at      = now();
```

---

## 4. confidence / null_reason の CHECK 制約

**判定: ✅ OK（改善案あり）**

`confidence` の 3 値（high/medium/low）は適切。  
`null_reason` には CHECK 制約なし（自由テキスト）→ スペルミス・表記揺れが起きやすい。

**改善案（オプション）**:

```sql
CONSTRAINT edinet_order_data_null_reason_check
    CHECK (null_reason IS NULL OR null_reason IN (
        'no_table_found',
        'unit_unclear',
        'multi_value_conflict',
        'not_disclosed',
        'parse_error'
    )),
```

> 初期運用では自由テキストのまま、値が固まったら段階的に追加する方針も可。

---

## 5. unit_raw と unit_normalized の分離要否

**判定: ✅ 解消済み（draft_009 に反映済み）**

`unit` カラムを `source_unit` にリネーム済み。  
名称が「変換前の元単位」であることを明示しており、曖昧さは解消された。

```sql
-- 変更済み
source_unit  text  NOT NULL  DEFAULT 'million_yen'
    CONSTRAINT edinet_order_data_source_unit_check
        CHECK (source_unit IN ('million_yen', 'billion_yen', 'thousand_yen', 'yen', 'unknown')),
```

`raw_*` カラムの単位参照先でもある（`raw_orders_received` の単位 = `source_unit`）。

---

## 6. 百万円統一保存で元単位・元値を残せているか

**判定: ✅ 解消済み（draft_009 に raw_* 5カラム統合済み）**

`raw_orders_received` / `raw_order_backlog` / `raw_construction_carryover` /  
`raw_completed_construction` / `raw_rpo` の 5カラムを draft_009 に直接追加済み。  
migration 010 で後追い追加する必要はなくなった。

**解消後のデータ保存例（千円単位の場合）:**

```
有報の記載: 「完成工事高 98,765,432千円」

格納値:
  completed_construction     = 98765    (百万円変換後)
  raw_completed_construction = 98765432 (千円のまま)
  source_unit                = 'thousand_yen'

→ 変換ロジックの検証・再計算が可能
```

---

## 7. RPO と order_backlog の混同防止

**判定: ✅ OK**

```sql
order_backlog  numeric NULL,  -- 日本基準の各社開示値
rpo            numeric NULL,  -- IFRS 15 / ASC 606 の未充足履行義務
```

別カラムで設計されており混同は起きない。インラインコメントも明確。  
両方を持つ企業で両カラムに値を入れることも可能。問題なし。

---

## 8. updated_at トリガーの既存関数依存

**判定: ✅ OK（注意点あり）**

`update_updated_at()` は `supabase_schema.sql` で定義済みの既存関数。  
他テーブルと同一パターンで一貫性がある。

**注意**: ローカル開発 DB や migration 単体実行時は関数が存在しないことがある。  
migration 冒頭に存在確認ガードの追加を推奨:

```sql
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        CREATE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $f$
        BEGIN NEW.updated_at = now(); RETURN NEW; END;
        $f$ LANGUAGE plpgsql;
    END IF;
END $$;
```

---

## 9. インデックスの過剰・不足

**判定: ✅ おおむね適切（微修正案あり）**

| インデックス | 用途 | 評価 |
|---|---|---|
| `(ticker, fiscal_year DESC)` | Viewer 銘柄ロード（最多） | ✅ 必須 |
| `doc_id` WHERE NOT NULL | EDINET逆引き | ✅ 適切 |
| `confidence` WHERE IN ('low','medium') | データ棚卸し | △ 初期は省略可 |

**微修正案（オプション）**: テーブルが大規模化した場合に追加検討

```sql
-- covering index 化（連結全体だけ取るクエリの最適化）
CREATE INDEX edinet_order_data_ticker_year_seg_idx
    ON edinet_order_data (ticker, fiscal_year DESC, segment_name);
```

---

## 10. ロールバック手順の十分性

**判定: ✅ OK（補足あり）**

現状の `DROP TABLE IF EXISTS edinet_order_data;` で、トリガー・インデックス・制約が連動削除される。  
`update_updated_at()` 関数を削除しない判断も正しい。

**補足: 完全ロールバック手順（コメントへの追記推奨）**

```sql
-- 完全ロールバック手順:
-- 1. データバックアップ（実行前に取得）
--    pg_dump -t edinet_order_data <dbname> > backup_edinet_order_data.sql
-- 2. DROP TABLE IF EXISTS edinet_order_data;
-- 3. 確認: SELECT tablename FROM pg_tables WHERE tablename='edinet_order_data';
--    → 0 rows が期待値
-- ※ RLS ポリシーも DROP TABLE で自動削除される
```

---

## 修正推奨事項まとめ

### 必須対応（実行前に解決すること）

| 優先度 | 項目 | 対応内容 |
|---|---|---|
| **高** | PostgreSQL バージョン確認 | `SELECT version()` で PG15+ を確認。PG14 以下なら UNIQUE 構文を変更 |
| ~~**中**~~ | ~~`unit` カラム名が不明瞭~~ | ✅ `source_unit` にリネーム済み |
| ~~**低**~~ | ~~元値の数値保存~~ | ✅ `raw_*` 5カラムを draft_009 に統合済み |

### オプション対応（初期運用後に検討）

| 優先度 | 項目 | 対応内容 |
|---|---|---|
| **低** | `null_reason` の CHECK 制約 | 推奨値が固まったら追加 |
| **低** | covering index の追加 | データ量が増えたら検討 |
| **低** | トリガー関数の存在確認ガード | migration 冒頭に `DO $$ ... $$` を追加 |
| ~~**低**~~ | ~~元値保存 (raw_value_* 追加)~~ | ✅ draft_009 に統合済み |
| ~~**低**~~ | ~~`source_unit` リネーム~~ | ✅ draft_009 に反映済み |

---

## 正式化への手順（実行禁止は継続中）

1. Supabase で `SELECT version()` を実行して PG バージョン確認
2. ~~`unit` → `source_unit` のリネーム~~ ✅ 完了済み
3. ~~raw_* カラムの統合~~ ✅ 完了済み
4. 未決事項（`period` 形式 / `company_name` 要否）を決定
5. レビュー承認後、`migrations/009_edinet_order_data.sql` として正式ファイル作成
6. Supabase SQL Editor で実行
