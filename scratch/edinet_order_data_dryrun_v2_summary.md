# edinet_order_data — INSERT DRY RUN v2 集計レポート

> **実施日**: 2026-06-15  
> **バージョン**: v2（period = YYYY-MM-DD 修正版）  
> **ステータス**: DRY RUN のみ。**DB INSERT 未実施・Supabase 接続なし。**  
> **入力ファイル**: `C:\Users\takuy\OneDrive\tdnet-excel-input\scratch\orders_extracted_30_v4.json`  
> **period 取得元**: `survey_detail.json` の `fiscal_end` フィールド  
> **出力 JSON**: `scratch/edinet_order_data_dryrun_v2.json`  
> **出力 SQL**: `scratch/edinet_order_data_dryrun_v2.sql`

---

## v1 からの修正点

| 項目 | v1 | v2 |
|---|---|---|
| `period` 形式 | `'2025'`（文字列） | `'YYYY-MM-DD'`（例: `'2025-03-31'`） |
| `fiscal_year` | `2025`（固定） | `fiscal_end` 年部分の integer（例: `2025` / `2024`） |
| period 取得元 | ハードコード | `survey_detail.json` の `fiscal_end` フィールド |
| DRY RUN エラー | 検出なし | fiscal_end 不在の場合にエラー記録 |

---

## 1. 対象企業数

**31社**

---

## 2. INSERT 予定レコード数

**31件**（全社 1件ずつ・`segment_name = NULL`（連結全体））

---

## 3. DRY RUN エラー数

**0件**（全 31社の `fiscal_end` が `survey_detail.json` から取得できた）

---

## 4. confidence 内訳

| confidence | 件数 |
|---|---|
| `high` | 25件 |
| `medium` | 3件 |
| `low` | 3件 |

---

## 5. source_unit 内訳

| source_unit | 件数 |
|---|---|
| `million_yen` | 21件 |
| `thousand_yen` | 6件 |
| `billion_yen` | 1件（IHI） |
| `unknown` | 3件（low銘柄） |

---

## 6. period 内訳（YYYY-MM-DD）

| period | 件数 | 企業例 |
|---|---|---|
| `2025-03-31` | 25件 | 大林組・鹿島建設・三菱重工業 等 |
| `2025-12-31` | 2件 | DMG森精機・タツモ |
| `2025-09-30` | 2件 | TVE・岡野バルブ製造 |
| `2025-02-28` | 1件 | ローツェ |
| `2024-12-31` | 1件 | 富士ソフト |

---

## 7. 非 3月期末企業（要注意）

| ticker | company | period | fiscal_year | 備考 |
|---|---|---|---|---|
| 6141 | DMG 森精機 | `2025-12-31` | 2025 | 12月決算 |
| 6266 | タツモ | `2025-12-31` | 2025 | 12月決算 |
| 6323 | ローツェ | `2025-02-28` | 2025 | 2月決算（うるう年考慮済み）|
| 6466 | TVE | `2025-09-30` | 2025 | 9月決算 |
| 6492 | 岡野バルブ製造 | `2025-09-30` | 2025 | 9月決算 |
| 9749 | 富士ソフト | `2024-12-31` | 2024 | 12月決算（fiscal_year=2024） |

---

## 8. 指標別件数

| 指標 | 件数 |
|---|---|
| `orders_received` | 26件 |
| `order_backlog` | 20件 |
| `construction_carryover` | 3件 |
| `completed_construction` | 4件 |
| `rpo` | 2件 |

---

## 9. null_reason 内訳

| null_reason | 件数 |
|---|---|
| `no_table_found` | 3件（サンコール・ツガミ・SCREEN HD） |

---

## 10. サンプル 5件

| ticker | company | period | fiscal_year | source_unit | orders_received（百万円） | confidence |
|---|---|---|---|---|---|---|
| 1762 | 高松コンストラクション | 2025-03-31 | 2025 | million_yen | 99,008 | medium |
| 1802 | 大林組 | 2025-03-31 | 2025 | million_yen | 2,044,406 | high |
| 1812 | 鹿島建設 | 2025-03-31 | 2025 | million_yen | 1,773,567 | high |
| 1952 | 新日本空調 | 2025-03-31 | 2025 | million_yen | 153,891 | high |
| 1969 | 高砂熱学工業 | 2025-03-31 | 2025 | million_yen | 307,974 | high |

---

## 11. UPSERT キー形式

```sql
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq
-- UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type)
```

例：

```
('1802', '2025-03-31', 2025, '__ALL__', 'edinet_yuho')
('6141', '2025-12-31', 2025, '__ALL__', 'edinet_yuho')
('9749', '2024-12-31', 2024, '__ALL__', 'edinet_yuho')
```

---

## 12. 問題点・注意事項

> [!NOTE]
> **富士ソフト（9749）は fiscal_year = 2024**  
> 決算期末が `2024-12-31` のため、`fiscal_year = 2024`。他の 2025/3期企業と混在する点に注意。

> [!NOTE]
> **ローツェ（6323）は `2025-02-28`（2月末）**  
> うるう年ではないため 28日が正しい。UNIQUE 制約の `period` カラムに `'2025-02-28'` が格納される。

> [!NOTE]
> **source_unit='unknown' の 3件（low 銘柄）**  
> サンコール・ツガミ・SCREEN HD。全値 NULL。  
> `source_unit='unknown'` は NOT NULL 制約に対応済み（v1 修正から継続）。

---

## 次のステップ

| # | 作業 | 状態 |
|---|---|---|
| ✅ | period を `YYYY-MM-DD` 形式に修正 | 完了 |
| ✅ | `source_unit=null` → `'unknown'` 修正 | 完了（v1 より継続） |
| ✅ | DRY RUN エラー 0件 | 全 31社取得成功 |
| 🔲 | DRY RUN 内容のにゃもーんによる承認 | 本ドキュメントをレビュー |
| 🔲 | 承認後、本番 DB への UPSERT 実行 | Supabase SQL Editor または スクリプト経由 |
