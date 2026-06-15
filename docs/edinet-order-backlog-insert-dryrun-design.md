# edinet_order_data — INSERT DRY RUN 設計

> **ステータス**: 設計案（DB INSERT 未実施）  
> **対象テーブル**: `edinet_order_data`  
> **前提**: 抽出スクリプト（`scripts/extract_edinet_orders.py` 相当）が将来実装される想定  
> **作成日**: 2026-06-15

---

## 概要

EDINET 有報から抽出した受注系データを `edinet_order_data` に INSERT する前に、
JSON 形式で DRY RUN 出力を確認し、DB 投入前に内容を検証する設計。

```
有報 PDF テキスト
  ↓ 抽出スクリプト（Python）
抽出結果 JSON（dry_run_output.json）
  ↓ 人間によるレビュー
INSERT SQL または UPSERT 実行
  ↓
edinet_order_data（本番 DB）
```

---

## 1. JSON 結果から DB カラムへのマッピング

### 抽出スクリプトが出力する JSON（想定フォーマット）

```json
{
  "ticker": "1234",
  "company_name": "株式会社サンプル建設",
  "doc_id": "S100XXXX",
  "fiscal_year": 2024,
  "period": "2024",
  "segment_name": null,
  "source_type": "edinet_yuho",
  "source_tag": "table_order_received",
  "confidence": "high",
  "null_reason": null,
  "source_unit": "billion_yen",
  "extracted_values": {
    "orders_received": 5340,
    "order_backlog": 8200,
    "construction_carryover": null,
    "completed_construction": null,
    "rpo": null
  },
  "snippet": "受注高 5,340億円（前期比 +12.3%）"
}
```

### JSON → DB カラム マッピング表

| JSON フィールド | DB カラム | 変換処理 | 備考 |
|---|---|---|---|
| `ticker` | `ticker` | そのまま | normalizeTicker 適用済みであること |
| `company_name` | `company_name` | そのまま | NULL 可 |
| `doc_id` | `doc_id` | そのまま | NULL 可 |
| `fiscal_year` | `fiscal_year` | そのまま（integer） | |
| `period` | `period` | そのまま（text） | 形式統一必須（後述） |
| `segment_name` | `segment_name` | そのまま（NULL = 連結全体） | |
| （自動生成） | `segment_name_key` | `COALESCE(segment_name, '__ALL__')` | INSERT 不要（generated column） |
| `source_type` | `source_type` | そのまま | CHECK 制約あり |
| `source_tag` | `source_tag` | そのまま | NULL 可 |
| `confidence` | `confidence` | そのまま | CHECK 制約あり |
| `null_reason` | `null_reason` | そのまま | NULL 可 |
| `source_unit` | `source_unit` | そのまま | CHECK 制約あり |
| `extracted_values.orders_received` | `raw_orders_received` | そのまま（元単位） | |
| `extracted_values.order_backlog` | `raw_order_backlog` | そのまま（元単位） | |
| `extracted_values.construction_carryover` | `raw_construction_carryover` | そのまま（元単位） | |
| `extracted_values.completed_construction` | `raw_completed_construction` | そのまま（元単位） | |
| `extracted_values.rpo` | `raw_rpo` | そのまま（元単位） | |
| （変換後） | `orders_received` | `raw_orders_received` × 変換係数 | 百万円統一 |
| （変換後） | `order_backlog` | `raw_order_backlog` × 変換係数 | 百万円統一 |
| （変換後） | `construction_carryover` | `raw_construction_carryover` × 変換係数 | 百万円統一 |
| （変換後） | `completed_construction` | `raw_completed_construction` × 変換係数 | 百万円統一 |
| （変換後） | `rpo` | `raw_rpo` × 変換係数 | 百万円統一 |
| `snippet` | `snippet` | そのまま（最大 2000 文字） | |

---

## 2. source_unit と raw_* の扱い

### 原則

`raw_*` カラムには **元の単位のまま** の数値を格納する。  
`orders_received` 等の本体カラムには **百万円換算後** の値を格納する。

```
抽出スクリプトが読む:  「受注高 5,340億円」
  ↓
raw_orders_received = 5340        （億円のまま）
source_unit         = 'billion_yen'
orders_received     = 534000      （百万円換算: 5340 × 100）
```

### セット保存の原則

`raw_*` と本体カラムは **必ずペアで保存** すること。

```python
# 抽出スクリプト側の処理イメージ
raw_value = 5340          # 有報から読み取った数値
source_unit = 'billion_yen'
converted_value = convert_to_million_yen(raw_value, source_unit)  # 534000

row = {
    "raw_orders_received": raw_value,      # 5340
    "orders_received": converted_value,    # 534000
    "source_unit": source_unit,            # 'billion_yen'
}
```

---

## 3. 百万円変換ルール

| `source_unit` | 変換係数 | 例（raw = 5340） | 変換後 | 端数損失 |
|---|---|---|---|---|
| `million_yen` | × 1 | 5340 百万円 | 5340 | なし |
| `billion_yen` | × 100 | 5340 億円 | 534000 | なし（整数） |
| `thousand_yen` | ÷ 1000（切捨て） | 5340 千円 | 5 | **あり**（最大 999千円） |
| `yen` | ÷ 1000000（切捨て） | 5340 円 | 0 | **あり**（百万円未満全損） |
| `unknown` | — | — | NULL | — |

### 変換関数の実装イメージ（Python）

```python
import math

def convert_to_million_yen(value: float | None, source_unit: str) -> int | None:
    """raw 値を百万円に変換して返す。端数は切り捨て。"""
    if value is None or source_unit == 'unknown':
        return None
    factors = {
        'million_yen':  1,
        'billion_yen':  100,
        'thousand_yen': 1 / 1000,
        'yen':          1 / 1_000_000,
    }
    factor = factors.get(source_unit)
    if factor is None:
        return None
    return math.floor(value * factor)
```

---

## 4. segment_name / segment_name_key の扱い

| 状況 | INSERT する値 | `segment_name_key`（自動） |
|---|---|---|
| 連結全体 | `segment_name = NULL` | `'__ALL__'` |
| 建設セグメント | `segment_name = '建設'` | `'建設'` |
| 設備セグメント | `segment_name = '設備'` | `'設備'` |

> [!IMPORTANT]
> `segment_name_key` は **generated column** のため INSERT 対象に含めない。  
> 含めると `ERROR: cannot insert into column "segment_name_key"` になる。

```python
# 正しい INSERT（segment_name_key を除く）
insert_data = {
    "ticker": "1234",
    "segment_name": None,  # 連結全体
    # segment_name_key は含めない
    ...
}
```

---

## 5. confidence / null_reason の扱い

| 状況 | `confidence` | 値の格納 | `null_reason` |
|---|---|---|---|
| 正常抽出・単位確定 | `'high'` | 変換後の値を格納 | `NULL` |
| 正常抽出・単位不明 | `'medium'` | 値を格納（要注意フラグ） | `'unit_unclear'` |
| 表が見つからない | `'low'` | `NULL` | `'no_table_found'` |
| 複数候補で選択不能 | `'low'` | `NULL` | `'multi_value_conflict'` |
| 企業が明示的に未開示 | `'high'` | `NULL` | `'not_disclosed'` |
| スクリプトエラー | `'low'` | `NULL` | `'parse_error'` |

### source_unit = 'unknown' の場合の扱い

```python
if source_unit == 'unknown':
    confidence = 'medium'
    null_reason = 'unit_unclear'
    orders_received = None      # 変換不能のため NULL
    raw_orders_received = raw_value  # 元値は保持
```

---

## 6. UPSERT キー

```sql
-- UPSERT の ON CONFLICT 対象
ON CONFLICT (ticker, period, fiscal_year, segment_name_key, source_type)
DO UPDATE SET
    orders_received            = EXCLUDED.orders_received,
    raw_orders_received        = EXCLUDED.raw_orders_received,
    order_backlog              = EXCLUDED.order_backlog,
    raw_order_backlog          = EXCLUDED.raw_order_backlog,
    construction_carryover     = EXCLUDED.construction_carryover,
    raw_construction_carryover = EXCLUDED.raw_construction_carryover,
    completed_construction     = EXCLUDED.completed_construction,
    raw_completed_construction = EXCLUDED.raw_completed_construction,
    rpo                        = EXCLUDED.rpo,
    raw_rpo                    = EXCLUDED.raw_rpo,
    source_unit                = EXCLUDED.source_unit,
    confidence                 = EXCLUDED.confidence,
    null_reason                = EXCLUDED.null_reason,
    snippet                    = EXCLUDED.snippet,
    doc_id                     = EXCLUDED.doc_id,
    source_tag                 = EXCLUDED.source_tag,
    updated_at                 = now();
```

> [!NOTE]
> `segment_name_key` は generated column のため `ON CONFLICT` の列指定には含めず、  
> UNIQUE 制約名を直接指定する方法も使える:  
> `ON CONFLICT ON CONSTRAINT edinet_order_data_uniq DO UPDATE SET ...`

---

## 7. INSERT 前検証項目

DRY RUN JSON を確認する際のチェックリスト：

```
□ ticker が 4桁数字か（例: '1234'）
□ period の形式が既存テーブルと統一されているか（'2024' か '2024/03'）
□ fiscal_year が integer か（文字列 '2024' になっていないか）
□ source_unit が CHECK 制約の許容値内か
    ('million_yen' | 'billion_yen' | 'thousand_yen' | 'yen' | 'unknown')
□ source_type が CHECK 制約の許容値内か
    ('edinet_yuho' | 'edinet_hanki' | 'manual')
□ confidence が CHECK 制約の許容値内か ('high' | 'medium' | 'low')
□ raw_* と 本体カラムの変換結果が一致しているか
    例: raw_orders_received=5340, source_unit='billion_yen'
        → orders_received=534000 であること
□ segment_name_key が INSERT データに含まれていないか
□ source_unit='unknown' のとき orders_received 等が NULL になっているか
□ confidence='low' のとき null_reason が設定されているか
□ snippet が 2000 文字以内か
□ 同一 (ticker, period, fiscal_year, segment_name, source_type) が重複していないか
```

---

## 8. DRY RUN 出力形式

### 出力ファイル構成

```
dry_run/
  dry_run_<ticker>_<fiscal_year>_<timestamp>.json   # 検証用 JSON
  dry_run_<ticker>_<fiscal_year>_<timestamp>.sql    # 実行確認用 INSERT SQL
```

### JSON 出力例

```json
{
  "dry_run": true,
  "generated_at": "2026-06-15T14:00:00+09:00",
  "ticker": "1234",
  "fiscal_year": 2024,
  "rows": [
    {
      "ticker": "1234",
      "company_name": "株式会社サンプル建設",
      "doc_id": "S100XXXX",
      "period": "2024",
      "fiscal_year": 2024,
      "segment_name": null,
      "source_type": "edinet_yuho",
      "source_tag": "table_order_received",
      "confidence": "high",
      "null_reason": null,
      "source_unit": "billion_yen",
      "orders_received": 534000,
      "raw_orders_received": 5340,
      "order_backlog": 820000,
      "raw_order_backlog": 8200,
      "construction_carryover": null,
      "raw_construction_carryover": null,
      "completed_construction": null,
      "raw_completed_construction": null,
      "rpo": null,
      "raw_rpo": null,
      "snippet": "受注高 5,340億円（前期比 +12.3%）"
    }
  ],
  "validation": {
    "total_rows": 1,
    "errors": [],
    "warnings": []
  }
}
```

### SQL 出力例（実行確認用）

```sql
-- DRY RUN SQL — 実行前確認用
-- generated_at: 2026-06-15T14:00:00+09:00
-- !! 実際に実行するときはこのコメントを外す !!

INSERT INTO edinet_order_data (
    ticker, company_name, doc_id,
    period, fiscal_year,
    segment_name,
    source_type, source_tag,
    confidence, null_reason, source_unit,
    orders_received, raw_orders_received,
    order_backlog, raw_order_backlog,
    construction_carryover, raw_construction_carryover,
    completed_construction, raw_completed_construction,
    rpo, raw_rpo,
    snippet
)
VALUES (
    '1234', '株式会社サンプル建設', 'S100XXXX',
    '2024', 2024,
    NULL,                      -- segment_name: 連結全体
    'edinet_yuho', 'table_order_received',
    'high', NULL, 'billion_yen',
    534000, 5340,              -- orders_received, raw
    820000, 8200,              -- order_backlog, raw
    NULL, NULL,                -- construction_carryover, raw
    NULL, NULL,                -- completed_construction, raw
    NULL, NULL,                -- rpo, raw
    '受注高 5,340億円（前期比 +12.3%）'
)
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq
DO UPDATE SET
    orders_received     = EXCLUDED.orders_received,
    raw_orders_received = EXCLUDED.raw_orders_received,
    order_backlog       = EXCLUDED.order_backlog,
    raw_order_backlog   = EXCLUDED.raw_order_backlog,
    confidence          = EXCLUDED.confidence,
    snippet             = EXCLUDED.snippet,
    updated_at          = now();
```

---

## 次のステップ

| # | 作業 | 状態 |
|---|---|---|
| 1 | `scripts/extract_edinet_orders.py` の実装（PDF→JSON 抽出） | 🔲 未実施 |
| 2 | DRY RUN 実行 → `dry_run/` に JSON/SQL を出力 | 🔲 未実施 |
| 3 | DRY RUN 結果の人間によるレビュー | 🔲 未実施 |
| 4 | レビュー確認後、本番 DB への UPSERT 実行 | 🔲 未実施 |
| 5 | `period` 形式の既存テーブルとの統一確認 | 🔲 未実施 |

---

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [edinet-order-backlog-db-design.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-db-design.md) | テーブル設計仕様（26カラム） |
| [edinet-order-backlog-raw-value-review.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-raw-value-review.md) | raw_* カラム設計レビュー |
| [edinet-order-backlog-migration-009-result.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-migration-009-result.md) | 009 migration 実行結果 |
| [edinet-order-backlog-rls-policy-result.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-rls-policy-result.md) | RLS policy 実行結果 |
