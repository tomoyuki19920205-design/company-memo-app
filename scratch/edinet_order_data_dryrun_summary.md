# edinet_order_data — INSERT DRY RUN 集計レポート（最終版）

> **実施日**: 2026-06-15  
> **ステータス**: DRY RUN のみ。**DB INSERT 未実施・Supabase 接続なし。**  
> **入力ファイル**: `C:\Users\takuy\OneDrive\tdnet-excel-input\scratch\orders_extracted_30_v4.json`  
> **出力 JSON**: `scratch/edinet_order_data_dryrun.json`  
> **出力 SQL**: `scratch/edinet_order_data_dryrun.sql`  
> **対象テーブル**: `edinet_order_data`  
> **前回からの修正**: `source_unit = null` → `'unknown'` に修正済み（NOT NULL 制約対応）

---

## 1. 対象企業数

**31社**

---

## 2. INSERT 予定レコード数

**31件**（全社 1件ずつ・`segment_name = NULL`（連結全体））

---

## 3. confidence 内訳

| confidence | 件数 |
|---|---|
| `high` | 25件 |
| `medium` | 3件 |
| `low` | 3件 |
| **合計** | **31件** |

---

## 4. medium（3件）の内訳

| ticker | company | 理由 |
|---|---|---|
| 1762 | 高松コンストラクション | テキスト抽出（表ではなく本文から） |
| 5805 | SWCC | RPO のみテキスト抽出 |
| 8035 | 東京エレクトロン | RPO のみテキスト抽出 |

---

## 5. low（3件）の内訳

| ticker | company | null_reason |
|---|---|---|
| 5985 | サンコール | `no_table_found` |
| 6101 | ツガミ | `no_table_found` |
| 7735 | SCREEN HD | `no_table_found` |

---

## 6. source_unit 内訳

| source_unit | 件数 | 変換方法 |
|---|---|---|
| `million_yen` | 21件 | 変換なし（raw = 変換後と同値） |
| `thousand_yen` | 6件 | ÷1,000（切捨て） |
| `billion_yen` | 1件 | ×100（IHI） |
| `unknown` | 3件 | low 銘柄。値は全 NULL |

---

## 7. 指標別件数（変換後・NULL でない件数）

| 指標 | 件数 | 備考 |
|---|---|---|
| `orders_received` | 26件 | |
| `order_backlog` | 20件 | |
| `construction_carryover` | 3件 | 大林組・鹿島建設・高砂熱学工業 |
| `completed_construction` | 4件 | 大林組・鹿島建設・新日本空調・高砂熱学工業 |
| `rpo` | 2件 | SWCC・東京エレクトロン |

---

## 8. null_reason 内訳

| null_reason | 件数 |
|---|---|
| `no_table_found` | 3件（サンコール・ツガミ・SCREEN HD） |
| `null`（設定なし） | 28件 |

---

## 9. サンプル 5件

| ticker | company | source_unit | raw_orders_received | orders_received（百万円） | confidence | null_reason |
|---|---|---|---|---|---|---|
| 1762 | 高松コンストラクション | million_yen | 99,008 | **99,008** | medium | — |
| 1802 | 大林組 | million_yen | 2,044,406 | **2,044,406** | high | — |
| 1812 | 鹿島建設 | million_yen | 1,773,567 | **1,773,567** | high | — |
| 1952 | 新日本空調 | million_yen | 153,891 | **153,891** | high | — |
| 1969 | 高砂熱学工業 | million_yen | 307,974 | **307,974** | high | — |

---

## 10. 百万円変換が発生した企業（千円・億円単位）

| ticker | company | source_unit | raw_orders_received | orders_received（百万円） | 端数切捨て |
|---|---|---|---|---|---|
| 6254 | 野村マイクロ | thousand_yen | 94,531,888 千円 | **94,531** | 888千円分 |
| 6258 | 平田機工 | thousand_yen | 79,512,424 千円 | **79,512** | 424千円分 |
| 6266 | タツモ | thousand_yen | 23,938,781 千円 | **23,938** | 781千円分 |
| 6315 | TOWA | thousand_yen | 47,429,464 千円 | **47,429** | 464千円分 |
| 6466 | TVE | thousand_yen | 13,322,341 千円 | **13,322** | 341千円分 |
| 6834 | 精工技研 | thousand_yen | 21,380,102 千円 | **21,380** | 102千円分 |
| 7013 | IHI | billion_yen | 17,511 億円 | **1,751,100** | 端数なし |

> [!NOTE]
> 千円単位の端数は `raw_orders_received` 等に元値を保持しているため原値は失われない。

---

## 11. UPSERT キー（全 31件）

```sql
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq
-- 制約: UNIQUE (ticker, period, fiscal_year, segment_name_key, source_type)
-- segment_name_key = COALESCE(segment_name, '__ALL__') = '__ALL__'（全件連結全体）
```

全 31件のキー形式:

```
(ticker='XXXX', period='2025', fiscal_year=2025, segment_name_key='__ALL__', source_type='edinet_yuho')
```

---

## 12. 問題点・注意事項

> [!IMPORTANT]
> **period 形式要確認（INSERT 前必須）**  
> DRY RUN では `period = '2025'` を設定。  
> 既存 `financials` テーブルの `period` 形式と一致しているか確認すること。  
> 確認方法: `SELECT DISTINCT period FROM financials ORDER BY period DESC LIMIT 5;`

> [!NOTE]
> **source_unit = 'unknown' の 3件（low）**  
> サンコール・ツガミ・SCREEN HD は全値 NULL。`source_unit='unknown'` で統一済み（NOT NULL 制約に対応）。  
> DB に INSERT することで「抽出失敗」として追跡可能になる。

> [!NOTE]
> **medium 3件は値あり**  
> medium confidence でも値は格納済み。high との差分は `confidence='medium'` で識別可能。

---

## 次のステップ

| # | 作業 | 状態 |
|---|---|---|
| ✅ | DRY RUN JSON 生成 | `scratch/edinet_order_data_dryrun.json` |
| ✅ | SQL サンプル生成 | `scratch/edinet_order_data_dryrun.sql` |
| ✅ | `source_unit=null` → `'unknown'` 修正 | 解消済み |
| 🔲 | `period` 形式確認（`'2025'` か `'2025/03'`） | **INSERT 前に必須** |
| 🔲 | DRY RUN 内容のにゃもーんによる承認 | 本ドキュメントをレビュー |
| 🔲 | 承認後、本番 DB への UPSERT 実行 | Supabase SQL Editor または スクリプト経由 |
