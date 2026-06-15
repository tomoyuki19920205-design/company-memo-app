# EDINET受注系データ SQLレビュー

> **レビュー対象**: `migrations/draft_009_create_edinet_order_data.sql`
> **設計参照**: `docs/edinet-order-backlog-db-design.md`
> **ステータス**: レビュー完了（未実行）

---

## レビュー結果サマリー

| # | 確認項目 | 判定 | 対応要否 |
|---|---|---|---|
| 1 | NULLS NOT DISTINCT の PG バージョン対応 | ⚠️ 要確認 | 実行前に `SELECT version()` 必須 |
| 2 | segment_name NULL の扱い | ✅ OK | — |
| 3 | source_type を UNIQUE に含める設計 | ✅ OK（注意点あり） | — |
| 4 | confidence / null_reason の CHECK 制約 | ✅ OK（改善案あり） | オプション |
| 5 | unit_raw と unit_normalized の分離要否 | ⚠️ 要検討 | カラム名リネーム推奨 |
| 6 | 百万円統一保存で元単位・元値を残せているか | ❌ 要修正 | 元値カラム追加を推奨 |
| 7 | RPO と order_backlog の混同防止 | ✅ OK | — |
| 8 | updated_at トリガーの既存関数依存 | ✅ OK（注意点あり） | — |
| 9 | インデックスの過剰・不足 | ✅ おおむね適切（微修正案あり） | オプション |
| 10 | ロールバック手順の十分性 | ✅ OK（補足あり） | — |

---

## 1. NULLS NOT DISTINCT の PostgreSQL バージョン対応

**判定: ⚠️ 要確認**

`NULLS NOT DISTINCT` は **PostgreSQL 15.0 以上**で追加された構文。

### 確認方法

```sql
SELECT version();
-- 例: PostgreSQL 15.3 on x86_64-pc-linux-gnu ...
```

### Supabase の現状

- Supabase は 2023年後半から PG 15 を標準提供
- 古いプロジェクト（2023年以前作成）は PG 14 の場合がある
- **プロジェクト作成時期によって異なるため、必ず確認すること**

### PG14 以下の場合の代替案（推奨: 案B）

```sql
-- 案A: sentinel 値 '__ALL__' で NULL を代替（segment_name を NOT NULL にする）
ALTER TABLE edinet_order_data ALTER COLUMN segment_name SET NOT NULL;
ALTER TABLE edinet_order_data ALTER COLUMN segment_name SET DEFAULT '__ALL__';
-- → アプリ側で '__ALL__' 判定が必要になり煩雑

-- 案B: generated column で COALESCE を使う（PG 12+ 対応）
ALTER TABLE edinet_order_data
    ADD COLUMN segment_name_key text
    GENERATED ALWAYS AS (COALESCE(segment_name, '__ALL__')) STORED;
ALTER TABLE edinet_order_data
    ADD CONSTRAINT edinet_order_data_uniq
    UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type);
-- → 案Bが透過的で推奨
```

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

**判定: ⚠️ 要検討（リネーム推奨）**

現状の `unit` カラムは「変換前の元単位」を記録しているが、名前が `unit` だけでは
「格納値の単位」なのか「変換前の単位」なのかが不明瞭。

**推奨修正: カラム名を `source_unit` にリネーム**

```sql
-- Before
unit  text NOT NULL DEFAULT 'million_yen'

-- After（推奨）
source_unit  text NOT NULL DEFAULT 'million_yen'
    -- 変換前の元単位。DB格納値は常に百万円（million_yen）。
    CHECK (source_unit IN ('million_yen', 'billion_yen', 'thousand_yen', 'yen', 'unknown')),
```

---

## 6. 百万円統一保存で元単位・元値を残せているか

**判定: ❌ 要修正**

`unit` カラムに「変換前の単位」は記録されるが、**変換前の元の数値が記録されない**。

```
抽出値: "5,340億円" → 534,000 百万円 として格納
source_unit = 'billion_yen'
→ 元値 5,340 は消える（snippet に文字列のみ残る）
```

変換ロジックのバグを後から数値で検証できない。

**推奨: `raw_value` カラムを追加（後続 migration で対応可）**

```sql
-- 010_add_raw_values.sql（将来追加）
ALTER TABLE edinet_order_data
    ADD COLUMN raw_orders_received  numeric NULL,  -- 変換前の元値
    ADD COLUMN raw_order_backlog    numeric NULL,
    ADD COLUMN raw_rpo              numeric NULL;
```

**初期対応**: `snippet` に元の文字列を残しつつ、変換ロジックのテストで補完。  
`raw_value` カラムは将来 migration として追加する。

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
| **高** | PostgreSQL バージョン確認 | `SELECT version()` で PG15+ を確認。PG14 以下なら代替 UNIQUE 構文に変更 |
| **中** | `unit` カラム名が不明瞭 | `source_unit` にリネームを推奨 |

### オプション対応（初期運用後に検討）

| 優先度 | 項目 | 対応内容 |
|---|---|---|
| **低** | 元値の数値保存 | `raw_value_*` カラムを後続 migration (010) で追加 |
| **低** | `null_reason` の CHECK 制約 | 推奨値が固まったら追加 |
| **低** | covering index の追加 | データ量が増えたら検討 |
| **低** | トリガー関数の存在確認ガード | migration 冒頭に `DO $$ ... $$` を追加 |

---

## 正式化への手順（実行禁止は継続中）

1. Supabase で `SELECT version()` を実行して PG バージョン確認
2. `unit` → `source_unit` のリネームを決定
3. 未決事項（`period` 形式 / `company_name` 要否）を決定
4. 上記を反映して `draft_009` を更新
5. レビュー承認後、`migrations/009_edinet_order_data.sql` として正式ファイル作成
6. Supabase SQL Editor で実行
