# 009_create_edinet_order_data — 本番DB実行結果

> **実行日時**: 2026-06-15（日本時間 13:51 頃）  
> **実行者**: にゃもーん  
> **実行環境**: Supabase SQL Editor（本番 DB）  
> **対象ファイル**: [`migrations/009_create_edinet_order_data.sql`](file:///C:/Users/takuy/OneDrive/company-memo-app/migrations/009_create_edinet_order_data.sql)

---

## 実行結果サマリー

| 項目 | 結果 |
|---|---|
| 実行ステータス | ✅ 成功 |
| テーブル作成 | ✅ `edinet_order_data` 作成済み |
| カラム数 | ✅ 26カラム確認済み |
| CHECK 制約 | ✅ 確認済み |
| UNIQUE 制約 | ✅ 確認済み |
| インデックス | ✅ 3本確認済み |
| RLS | ✅ 有効（ENABLED） |
| RLS policy | ✅ 0件（意図通り） |

---

## 作成テーブル

**テーブル名**: `edinet_order_data`  
**スキーマ**: `public`  
**用途**: EDINET有報から抽出した受注系データの格納

---

## カラム一覧（26カラム）

| # | カラム名 | 型 | NOT NULL | デフォルト | 備考 |
|---|---|---|---|---|---|
| 1 | `id` | uuid | ✅ | gen_random_uuid() | PK |
| 2 | `ticker` | text | ✅ | — | 銘柄コード（4桁） |
| 3 | `company_name` | text | — | NULL | 表示用社名 |
| 4 | `doc_id` | text | — | NULL | EDINET docID |
| 5 | `period` | text | ✅ | — | 決算年度文字列 |
| 6 | `fiscal_year` | integer | ✅ | — | 決算年度整数 |
| 7 | `orders_received` | numeric | — | NULL | 受注高（百万円変換後） |
| 8 | `order_backlog` | numeric | — | NULL | 受注残高（百万円変換後） |
| 9 | `construction_carryover` | numeric | — | NULL | 繰越工事高（百万円変換後） |
| 10 | `completed_construction` | numeric | — | NULL | 完成工事高（百万円変換後） |
| 11 | `rpo` | numeric | — | NULL | RPO（百万円変換後） |
| 12 | `raw_orders_received` | numeric | — | NULL | 受注高の変換前元値 |
| 13 | `raw_order_backlog` | numeric | — | NULL | 受注残高の変換前元値 |
| 14 | `raw_construction_carryover` | numeric | — | NULL | 繰越工事高の変換前元値 |
| 15 | `raw_completed_construction` | numeric | — | NULL | 完成工事高の変換前元値 |
| 16 | `raw_rpo` | numeric | — | NULL | RPOの変換前元値 |
| 17 | `source_unit` | text | ✅ | `'million_yen'` | 変換前の元単位 |
| 18 | `segment_name` | text | — | NULL | NULL=連結全体、非NULL=セグメント名 |
| 19 | `segment_name_key` | text | ✅ | generated | COALESCE(segment_name, '\_\_ALL\_\_') — UNIQUE制約用 |
| 20 | `source_type` | text | ✅ | `'edinet_yuho'` | データソース種別 |
| 21 | `source_tag` | text | — | NULL | 有報内の参照箇所タグ |
| 22 | `confidence` | text | ✅ | `'high'` | 抽出信頼度 |
| 23 | `null_reason` | text | — | NULL | NULL値・low confidenceの理由 |
| 24 | `snippet` | text | — | NULL | 抽出元の原文スニペット |
| 25 | `created_at` | timestamptz | ✅ | now() | 作成日時 |
| 26 | `updated_at` | timestamptz | ✅ | now() | 更新日時（トリガーで自動更新） |

---

## 制約一覧

| 制約名 | 種別 | 対象カラム | 内容 |
|---|---|---|---|
| `edinet_order_data_pkey` | PRIMARY KEY | `id` | uuid PK |
| `edinet_order_data_uniq` | UNIQUE | `(ticker, period, fiscal_year, segment_name_key, source_type)` | PG14対応版（generated column使用） |
| `edinet_order_data_source_unit_check` | CHECK | `source_unit` | `IN ('million_yen', 'billion_yen', 'thousand_yen', 'yen', 'unknown')` |
| `edinet_order_data_source_type_check` | CHECK | `source_type` | `IN ('edinet_yuho', 'edinet_hanki', 'manual')` |
| `edinet_order_data_confidence_check` | CHECK | `confidence` | `IN ('high', 'medium', 'low')` |

---

## インデックス一覧（3本）

| インデックス名 | 対象カラム | WHERE 条件 | 用途 |
|---|---|---|---|
| `edinet_order_data_ticker_year_idx` | `(ticker, fiscal_year DESC)` | — | Viewer の銘柄ロード（最頻クエリ） |
| `edinet_order_data_doc_idx` | `(doc_id)` | `doc_id IS NOT NULL` | EDINET docID からの逆引き |
| `edinet_order_data_confidence_idx` | `(confidence)` | `confidence IN ('low', 'medium')` | low/medium データの棚卸し |

---

## RLS 状態

| 項目 | 状態 |
|---|---|
| RLS | **ENABLED**（有効） |
| policy 数 | **0件** |
| 現在のアクセス制御 | RLS 有効・policy なし = **すべてのロールからアクセス不可**（service_role は除く） |

> [!IMPORTANT]
> RLS が有効かつ policy が 0件の状態では、`anon` / `authenticated` ロールからは全行アクセス不可。  
> `service_role`（抽出スクリプト）は RLS をバイパスするため INSERT/SELECT が可能。  
> **Viewer から参照するには SELECT policy の追加が必要。**

---

## 今後の作業

### 必須（Viewer 公開前に実施）

- [ ] **RLS policy 設計・実装**  
  - SELECT: `allowed_users` テーブルのメールアドレスに一致するユーザーのみ参照可  
  - INSERT/UPDATE: 抽出スクリプト（service_role）のみ  
  - 実装案は [`migrations/009_create_edinet_order_data.sql`](file:///C:/Users/takuy/OneDrive/company-memo-app/migrations/009_create_edinet_order_data.sql) の E セクション（コメント）を参照

### 推奨（データ投入前に実施）

- [ ] **抽出スクリプトの DB 保存 DRY RUN**  
  - Python スクリプトで EDINET 有報から抽出 → `edinet_order_data` への INSERT を DRY RUN  
  - `source_unit` / `raw_*` / `confidence` の値が想定通りに入るか確認  
  - `segment_name_key` が `COALESCE(segment_name, '__ALL__')` で自動生成されることを確認  
  - UNIQUE 制約違反が発生しないか確認（upsert 戦略の検討）

### 将来対応

- [ ] **Viewer 連携**（未実施）  
  - `edinet_order_data` を参照する Viewer コンポーネントの設計・実装  
  - セグメント別・連結全体の切り替え表示  
  - `confidence` / `null_reason` に基づく「未開示」「抽出エラー」の別表示

- [ ] **`period` 形式の統一確認**  
  - 既存テーブル（`financials` 等）の `period` 形式（`'2024'` か `'2024/03'`）に合わせて INSERT

- [ ] **`company_name` カラムの要否再評価**  
  - `companies` テーブルとの JOIN で代替できる場合は削除を検討

---

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [edinet-order-backlog-db-design.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-db-design.md) | テーブル設計仕様 |
| [edinet-order-backlog-sql-review.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-sql-review.md) | SQL レビュー（10項目） |
| [edinet-order-backlog-raw-value-review.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-raw-value-review.md) | raw_* カラム設計レビュー |
| [edinet-order-backlog-009-preflight-review.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-009-preflight-review.md) | 実行前最終レビュー |
| [009_create_edinet_order_data.sql](file:///C:/Users/takuy/OneDrive/company-memo-app/migrations/009_create_edinet_order_data.sql) | 実行済み migration |
