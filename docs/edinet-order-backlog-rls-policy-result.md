# edinet_order_data — RLS SELECT Policy 実行結果

> **実行日時**: 2026-06-15（日本時間 14:02 頃）  
> **実行環境**: Supabase SQL Editor（本番 DB）  
> **設計根拠**: [`docs/edinet-order-backlog-rls-policy-design.md`](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-rls-policy-design.md)

---

## 実行結果サマリー

| 項目 | 結果 |
|---|---|
| 実行ステータス | ✅ 成功 |
| policy 名 | `Allowed users can select edinet_order_data` |
| 対象テーブル | `edinet_order_data` |
| 対象操作 | `SELECT` |
| 許可条件 | `auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)` |

---

## 実行した SQL

```sql
DROP POLICY IF EXISTS "Allowed users can select edinet_order_data" ON edinet_order_data;

CREATE POLICY "Allowed users can select edinet_order_data"
    ON edinet_order_data FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );
```

---

## 確認結果

| 確認項目 | 値 |
|---|---|
| `policyname` | `Allowed users can select edinet_order_data` |
| `cmd` | `SELECT` |
| `qual`（USING 条件） | `allowed_users` の `email` に含まれるユーザーのみ SELECT 可 |

---

## 現在の edinet_order_data アクセス制御状態

| ロール | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `allowed_users` 登録済み認証ユーザー | ✅ 可（policy により許可） | ❌ 不可（policy なし） |
| `anon` / 未登録 `authenticated` | ❌ 不可（条件不一致） | ❌ 不可 |
| `service_role`（抽出スクリプト） | ✅ 可（RLS バイパス） | ✅ 可（RLS バイパス） |

---

## 既存テーブルとの整合性

| テーブル | SELECT policy | 整合 |
|---|---|---|
| `financials` | `allowed_users` email 方式 | ✅ |
| `segment_financials` | `allowed_users` email 方式 | ✅ |
| `company_memo_grids` | `allowed_users` email 方式 | ✅ |
| `edinet_order_data` | `allowed_users` email 方式 | ✅ **統一済み** |

---

## 今後の作業

| 優先度 | 作業 | 状態 |
|---|---|---|
| **高** | 抽出スクリプトの DB 保存 DRY RUN | 🔲 未実施 |
| **低** | Viewer 連携 | 🔲 未実施 |
| **低** | INSERT / UPDATE policy（Viewer からの手動補正が必要になった場合） | 🔲 未実施（現時点では不要） |

---

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [edinet-order-backlog-rls-policy-design.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-rls-policy-design.md) | RLS policy 設計書 |
| [edinet-order-backlog-migration-009-result.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-migration-009-result.md) | 009 migration 実行結果 |
| [009_create_edinet_order_data.sql](file:///C:/Users/takuy/OneDrive/company-memo-app/migrations/009_create_edinet_order_data.sql) | 実行済み migration |
