# 009_create_edinet_order_data.sql — 実行前最終レビュー

> **対象ファイル**: [`migrations/009_create_edinet_order_data.sql`](file:///C:/Users/takuy/OneDrive/company-memo-app/migrations/009_create_edinet_order_data.sql)  
> **レビュー実施日**: 2026-06-15  
> **PostgreSQL バージョン**: 14.4（Supabase 確認済み）

---

## 総合判定

| 判定 | 内容 |
|---|---|
| **実行可否** | ✅ **実行可** |
| **必須修正** | なし |
| **推奨確認** | 2点（実行前に Supabase SQL Editor で手動確認を推奨） |

---

## 確認項目詳細

### 1. 全文レビュー

**判定: ✅ OK**

| セクション | 内容 | 問題 |
|---|---|---|
| A. CREATE TABLE | 26カラム定義 | なし |
| B. UNIQUE 制約 | `segment_name_key` 使用（PG14対応） | なし |
| C. インデックス | 3本（ticker_year / doc / confidence） | なし |
| D. updated_at トリガー | 既存関数 `update_updated_at()` 再利用 | ※要確認（後述） |
| E. RLS | **コメントアウトのみ**（実行されない） | なし |
| F. ROLLBACK | `DROP TABLE IF EXISTS` コメント | なし |
| G. 実行後確認クエリ | 4種のコメント付き SELECT | なし |

---

### 2. PostgreSQL 14.4 で構文エラーにならないか

**判定: ✅ OK**

以下の構文を使用しており、すべて PG14 で有効：

| 構文 | 最低 PG バージョン | 判定 |
|---|---|---|
| `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | PG13 | ✅ |
| `GENERATED ALWAYS AS (...) STORED` | PG12 | ✅ |
| `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (...)` | 全バージョン | ✅ |
| `CREATE INDEX ... WHERE ...` （部分インデックス） | 全バージョン | ✅ |
| `CREATE TRIGGER ... EXECUTE FUNCTION ...` | PG11 | ✅ |
| `CHECK (col IN (...))` | 全バージョン | ✅ |

> [!NOTE]
> `NULLS NOT DISTINCT`（PG15+）は本 migration には含まれていない。PG14.4 で安全に実行可能。

---

### 3. generated column の構文が PG14 対応か

**判定: ✅ OK**

```sql
segment_name_key  text  NOT NULL
    GENERATED ALWAYS AS (COALESCE(segment_name, '__ALL__')) STORED,
```

- `GENERATED ALWAYS AS (...) STORED` は **PG12 で追加**。PG14.4 で問題なし。
- `COALESCE` は標準 SQL 関数。制限なし。
- `STORED` 指定（永続化）であるため、UNIQUE 制約の対象として使用可能。
- `VIRTUAL`（PG では未対応）との混同なし。

> [!IMPORTANT]
> PG の generated column に対して直接 INSERT/UPDATE はできない（`ALWAYS` 指定のため）。  
> 抽出スクリプトは `segment_name` のみを INSERT すれば `segment_name_key` は自動生成される。

---

### 4. CHECK 制約が妥当か

**判定: ✅ OK**

| 制約名 | カラム | 許容値 | 評価 |
|---|---|---|---|
| `edinet_order_data_source_unit_check` | `source_unit` | `million_yen`, `billion_yen`, `thousand_yen`, `yen`, `unknown` | ✅ 網羅的 |
| `edinet_order_data_source_type_check` | `source_type` | `edinet_yuho`, `edinet_hanki`, `manual` | ✅ 適切 |
| `edinet_order_data_confidence_check` | `confidence` | `high`, `medium`, `low` | ✅ 適切 |

`null_reason` には CHECK 制約なし（推奨値はコメントのみ）。  
→ 初期運用では自由文字列を許容する設計。問題なし。

---

### 5. UNIQUE 制約が意図通りか

**判定: ✅ OK**

```sql
UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type)
```

| ケース | `segment_name` | `segment_name_key` | 重複防止 |
|---|---|---|---|
| 連結全体 × 同一期 × 同一ソース | `NULL` | `'__ALL__'` | ✅ 一意 |
| セグメント '建設' × 同一期 × 同一ソース | `'建設'` | `'建設'` | ✅ 一意 |
| 連結 + セグメント '建設' 共存 | NULL / `'建設'` | `'__ALL__'` / `'建設'` | ✅ 共存可 |
| 異なるソース型（yuho / hanki）同一期 | いずれも | — | ✅ 共存可（`source_type` が異なる） |

> [!NOTE]
> `segment_name_key` は generated column のため、INSERT 時に `segment_name` のみを指定すれば自動生成される。アプリコードの変更不要。

---

### 6. updated_at トリガーが既存関数に依存して問題ないか

**判定: ⚠️ 要実行前確認（低リスク）**

```sql
EXECUTE FUNCTION update_updated_at();
```

本 migration は `update_updated_at()` 関数が **既に存在する前提** で動作する。

**確認方法（Supabase SQL Editor で実行前に確認）**：

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'update_updated_at';
```

- **結果が 1行** → 関数あり。migration をそのまま実行可。
- **結果が 0行** → 関数なし。migration 内のコメントに記載の `CREATE OR REPLACE FUNCTION` を先に実行すること。

> [!IMPORTANT]
> 既存テーブル（`financials` 等）のトリガーで使用中のため、通常は関数が存在する。  
> ただし、スキーマ再構築後や新規環境では存在しない可能性があるため確認を推奨。

---

### 7. 既存関数が存在しない場合の失敗リスク

**判定: ✅ 軽微（対処コメント済み）**

関数が存在しない場合、`CREATE TRIGGER` 実行時にエラーになる。  
テーブル自体は作成済みの状態でトリガーのみ失敗する。

**対処**: migration ファイル内にフォールバック用コメントが記載済み：

```sql
-- CREATE OR REPLACE FUNCTION update_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = now();
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
```

→ 関数が存在しない場合はこのコメントを解除して先に実行する。

---

### 8. RLS 設定が含まれているか

**判定: ✅ OK（意図通り）**

RLS 設定は **すべてコメントアウト** されており、今回の migration 実行では RLS は有効化されない。

```sql
-- ALTER TABLE edinet_order_data ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Allowed users can select edinet_order_data" ON edinet_order_data;
-- CREATE POLICY ...
```

> [!NOTE]
> RLS 未設定の状態では、Supabase の `service_role_key` 経由のアクセスは全行参照可能。  
> `anon_key` 経由のアクセスも制限されない点に注意。  
> **Viewer 公開前に必ず RLS を有効化すること。**

---

### 9. rollback 手順が十分か

**判定: ✅ OK**

```sql
-- DROP TABLE IF EXISTS edinet_order_data;
```

- `DROP TABLE IF EXISTS` により、テーブルが存在しない場合もエラーにならない。
- トリガー・インデックス・CHECK制約は `DROP TABLE` で連動削除される。
- `update_updated_at()` 関数は他テーブルで共用のため削除対象外（コメントに明記済み）。
- UNIQUE 制約（`edinet_order_data_uniq`）も `DROP TABLE` で自動削除される。

---

### 10. 実行後確認 SQL が十分か

**判定: ✅ OK**

| 確認項目 | クエリ | 評価 |
|---|---|---|
| テーブル存在確認 | `pg_tables` 検索 | ✅ |
| 全カラム確認（26カラム） | `information_schema.columns` | ✅ |
| 制約確認 | `pg_constraint` | ✅ |
| インデックス確認 | `pg_indexes` | ✅ |
| generated column 動作確認 | `SELECT ticker, segment_name, segment_name_key LIMIT 5` | ✅ |

---

## 実行前チェックリスト

> [!IMPORTANT]
> 以下を Supabase SQL Editor で事前確認してから 009 を実行すること。

- [ ] `SELECT version();` → `14.x` を確認
- [ ] `update_updated_at()` 関数の存在確認（項目 #6 の SELECT）
- [ ] `edinet_order_data` テーブルが存在しないことを確認:  
  ```sql
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'edinet_order_data';
  -- 0 rows であること
  ```

---

## 実行時の注意点

| 注意点 | 内容 |
|---|---|
| RLS は有効化されない | Viewer 公開前に別途 RLS を設定すること（E セクションのコメントを解除） |
| `period` 形式 | 既存テーブルの `period` 形式（`'2024'` か `'2024/03'`）に統一して INSERT すること |
| `segment_name_key` は INSERT 対象外 | `segment_name` のみを指定すること（generated column のため自動生成） |
| 関数の先行確認 | `update_updated_at()` の存在を実行前に確認（項目 #6） |

---

## 未決事項（migration 実行とは独立）

| # | 項目 | 対応方針 |
|---|---|---|
| 1 | `period` 形式 | 既存テーブルの形式を確認して統一 |
| 2 | `company_name` の要否 | `companies` テーブルとの JOIN 運用が確定したら削除可 |
| 3 | RLS の有効化タイミング | Viewer 公開前に E セクションを実行 |
| 4 | セグメント名の正規化 | 初期は有報原文のまま。将来 `edinet_segment_master` テーブルで対応 |
