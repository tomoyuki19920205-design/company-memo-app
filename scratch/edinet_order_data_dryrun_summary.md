# edinet_order_data — INSERT DRY RUN 集計レポート

> **実施日**: 2026-06-15  
> **ステータス**: DRY RUN のみ。**DB INSERT 未実施。**  
> **ソースファイル**: `tdnet-excel-input/scratch/orders_extracted_30_v4.json`  
> **出力ファイル**: `company-memo-app/scratch/edinet_order_data_dryrun.json`  
> **対象テーブル**: `edinet_order_data`

---

## 1. 対象企業数

**31社**

---

## 2. INSERT予定レコード数

**31件**（全社 1件ずつ、segment_name = NULL（連結全体））

---

## 3. confidence 内訳

| confidence | 件数 |
|---|---|
| `high` | 25件 |
| `medium` | 3件 |
| `low` | 3件 |
| **合計** | **31件** |

---

## 4. source_unit 内訳

| source_unit | 件数 | 該当企業（抜粋） |
|---|---|---|
| `million_yen`（百万円） | 21件 | 大林組、鹿島、三菱重工、村田製作所 等 |
| `thousand_yen`（千円） | 6件 | 野村マイクロ、平田機工、タツモ、TOWA、TVE、精工技研 |
| `billion_yen`（億円） | 1件 | IHI |
| `null`（low のため設定なし） | 3件 | サンコール、ツガミ、SCREEN HD |

---

## 5. orders_received（受注高）件数

**26件**（NULL でないもの）

---

## 6. order_backlog（受注残高）件数

**20件**（NULL でないもの）

---

## 7. construction_carryover（繰越工事高）件数

**3件**（大林組、鹿島建設、高砂熱学工業）

---

## 8. completed_construction（完成工事高）件数

**4件**（大林組、鹿島建設、新日本空調、高砂熱学工業）

---

## 9. rpo（RPO）件数

**2件**（SWCC: 1,997百万円、東京エレクトロン: 225,019百万円）

---

## 10. null_reason 内訳

| null_reason | 件数 | 理由 |
|---|---|---|
| `no_table_found` | 3件 | サンコール、ツガミ、SCREEN HD — 表なし・抽出不可 |

---

## 11. サンプル5件

| # | ticker | company | source_unit | raw_orders_received | orders_received（百万円） | raw_order_backlog | order_backlog（百万円） | confidence | null_reason |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1762 | 高松コンストラクション | million_yen | 99,008 | **99,008** | — | — | medium | — |
| 2 | 1802 | 大林組 | million_yen | 2,044,406 | **2,044,406** | — | — | high | — |
| 3 | 1812 | 鹿島建設 | million_yen | 1,773,567 | **1,773,567** | — | — | high | — |
| 4 | 1952 | 新日本空調 | million_yen | 153,891 | **153,891** | — | — | high | — |
| 5 | 1969 | 高砂熱学工業 | million_yen | 307,974 | **307,974** | — | — | high | — |

---

## 千円・億円 単位変換の確認（要注意企業）

| ticker | company | source_unit | raw_orders_received | orders_received（百万円） | 端数損失 |
|---|---|---|---|---|---|
| 6254 | 野村マイクロ | thousand_yen | 94,531,888千円 | **94,531** | 888千円分（端数切捨て） |
| 6258 | 平田機工 | thousand_yen | 79,512,424千円 | **79,512** | 424千円分 |
| 6266 | タツモ | thousand_yen | 23,938,781千円 | **23,938** | 781千円分 |
| 6315 | TOWA | thousand_yen | 47,429,464千円 | **47,429** | 464千円分 |
| 6466 | TVE | thousand_yen | 13,322,341千円 | **13,322** | 341千円分 |
| 6834 | 精工技研 | thousand_yen | 21,380,102千円 | **21,380** | 102千円分 |
| 7013 | IHI | billion_yen | 17,511億円 | **1,751,100** | 端数なし（整数） |

> [!NOTE]
> 千円単位の企業は百万円変換で最大 999千円の端数が切捨てされる。  
> `raw_orders_received` に元値を保持しているため、原値は失われない。

---

## 12. INSERT 時の想定 UPSERT キー（全31件）

```
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq
  → (ticker, period, fiscal_year, segment_name_key, source_type)
  → segment_name_key = COALESCE(NULL, '__ALL__') = '__ALL__' （全件連結全体）
```

| ticker | period | fiscal_year | segment_name_key | source_type |
|---|---|---|---|---|
| 1762 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 1802 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 1812 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 1952 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 1969 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 5631 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 5805 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 5985 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6101 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6103 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6104 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6141 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6254 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6258 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6266 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6315 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6323 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6370 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6466 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6492 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6594 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6834 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 6981 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 7011 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 7013 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 7014 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 7735 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 8035 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 9682 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 9719 | 2025 | 2025 | __ALL__ | edinet_yuho |
| 9749 | 2025 | 2025 | __ALL__ | edinet_yuho |

---

## 問題点・要確認事項

> [!WARNING]
> **period の形式確認が必要**  
> DRY RUN では `period = '2025'`、`fiscal_year = 2025` を設定した（2025年3月期想定）。  
> 既存の `financials` テーブルの `period` 形式（`'2025'` か `'2025/03'`）と統一すること。  
> INSERT 実行前に `SELECT DISTINCT period FROM financials LIMIT 5;` で形式を確認する。

> [!NOTE]
> **1762 高松コンストラクション は confidence = medium**  
> テキスト抽出（table ではない）のため medium。値は格納されているが要注意フラグあり。  
> null_reason は設定不要（値はある）。

> [!NOTE]
> **5985 サンコール / 6101 ツガミ / 7735 SCREEN HD は low**  
> 全値 NULL。`null_reason = 'no_table_found'`。  
> DB には低品質レコードとして INSERT することで「この銘柄は抽出失敗」と追跡可能になる。

> [!NOTE]
> **source_unit = null の 3件（low 銘柄）について**  
> low confidence の場合 source_unit を null にしているが、  
> `source_unit` は NOT NULL カラム（DEFAULT 'million_yen'）。  
> → INSERT 時は `source_unit = 'unknown'` に統一する必要がある。  
> **DRY RUN JSON の修正が必要。**（low 銘柄の source_unit を 'unknown' に変更）

---

## 次のステップ

| 作業 | 内容 |
|---|---|
| ✅ DRY RUN JSON 生成済み | `scratch/edinet_order_data_dryrun.json` |
| 🔲 **要修正**: low 銘柄の source_unit を `'unknown'` に変更 | source_unit = null は NOT NULL 違反 |
| 🔲 **要確認**: `period` 形式（`'2025'` か `'2025/03'`） | 既存 financials テーブルで確認 |
| 🔲 DRY RUN 内容をにゃもーんが確認・承認 | 本ドキュメントをレビュー |
| 🔲 承認後、本番 DB への UPSERT 実行 | Supabase SQL Editor または スクリプト経由 |
