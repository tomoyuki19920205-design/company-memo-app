# edinet_order_data — RLS Policy 設計

> **ステータス**: 設計案（未実装）  
> **対象テーブル**: `edinet_order_data`  
> **現在の RLS 状態**: ENABLED / policy 0件  
> **作成日**: 2026-06-15  
> **設計根拠**: 既存テーブル（`financials`, `company_memo_grids` 等）のパターンに統一

---

## 1. 設計方針サマリー

| 項目 | 方針 |
|---|---|
| RLS | 既に ENABLED（009 migration 実行済み） |
| SELECT | `allowed_users` テーブルのメールが一致するユーザーのみ |
| INSERT | policy なし（service_role がバイパスして直接 INSERT） |
| UPDATE | policy なし（service_role のみ更新を想定） |
| DELETE | policy なし（service_role のみ削除を想定） |
| anon ロール | **アクセス不可**（既存テーブルと同じ方針） |
| authenticated ロール | `allowed_users` に登録済みのメールのみ SELECT 可 |

---

## 2. SELECT policy 案

### 方針

既存テーブル（`financials`, `segment_financials`）と完全に同一パターン。

```sql
-- SELECT: allowed_users に登録済みのメールアドレスを持つユーザーのみ
DROP POLICY IF EXISTS "Allowed users can select edinet_order_data" ON edinet_order_data;

CREATE POLICY "Allowed users can select edinet_order_data"
    ON edinet_order_data FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );
```

### なぜこのパターンか

| 選択肢 | 採否 | 理由 |
|---|---|---|
| `auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)` | ✅ **採用** | 既存の全テーブルと統一。管理が一元化できる |
| `auth.role() = 'authenticated'` | ❌ | `authenticated` ロール全体を許可してしまう。`allowed_users` 制御が不要になる |
| `auth.uid() = owner_id` | ❌ | `edinet_order_data` は所有者概念なし。企業データは全 allowed_users が共有して参照 |
| `true`（全許可） | ❌ | RLS の意味がなくなる |

---

## 3. INSERT / UPDATE / DELETE の扱い

### 方針: policy なし（service_role バイパスを利用）

| 操作 | 担当 | 理由 |
|---|---|---|
| INSERT | 抽出スクリプト（service_role_key） | スクリプトは `service_role_key` で接続。RLS をバイパスするため policy 不要 |
| UPDATE | 抽出スクリプト（service_role_key） | 同上 |
| DELETE | 管理者（service_role_key） | 誤抽出データの削除等。Viewer からの直接削除は不要 |

> [!NOTE]
> Supabase の `service_role_key` を使うクライアントは RLS を完全にバイパスする。  
> Viewer（フロントエンド）は `anon_key` を使用するため RLS の制約を受ける。  
> したがって、Viewer からの INSERT/UPDATE は設計上発生しない。

### INSERT policy を追加しない理由

```
Viewer は読み取り専用。
抽出スクリプトは service_role_key 経由。
→ authenticated ユーザー向けの INSERT policy は不要。
```

もし将来「Viewer から手動で受注データを補正入力する」要件が生じた場合は、
`company_memo_grids` と同様のパターンで INSERT / UPDATE policy を追加する。

---

## 4. 既存 allowed_users 方式との整合

### 既存テーブルの policy 一覧

| テーブル | SELECT | INSERT | UPDATE |
|---|---|---|---|
| `company_memo_grids` | allowed_users | allowed_users | allowed_users |
| `company_paste_memos` | allowed_users | allowed_users | allowed_users |
| `financials` | allowed_users | （なし） | （なし） |
| `segment_financials` | allowed_users | （なし） | （なし） |
| **`edinet_order_data`（今回）** | **allowed_users** | **（なし）** | **（なし）** |

`financials` / `segment_financials` と全く同じパターン。整合している。

---

## 5. anon / authenticated の扱い

| ロール | 現状（policy 0件） | policy 追加後 |
|---|---|---|
| `anon` | ❌ 全行アクセス不可（RLS ENABLED のため） | ❌ 引き続き不可（policy の USING 条件を満たさない） |
| `authenticated`（allowed_users 外） | ❌ 全行アクセス不可 | ❌ 引き続き不可（email が allowed_users に未登録） |
| `authenticated`（allowed_users 登録済み） | ❌ 全行アクセス不可 | ✅ 全行 SELECT 可 |
| `service_role` | ✅ RLS バイパスで全操作可 | ✅ 変わらず全操作可 |

> [!IMPORTANT]
> `anon_key`（フロントエンドの公開キー）を使ったアクセスは `anon` ロールとなる。  
> Supabase Auth でログインすると `authenticated` ロールに昇格する。  
> 現在の Viewer は認証済みユーザーのみアクセス可能な設計のため、`authenticated` + `allowed_users` のみ SELECT を許可する方針が適切。

---

## 6. Policy SQL 案（実行時に使用するSQL）

```sql
-- ============================================================
-- edinet_order_data RLS policy 設定
-- 実行前に edinet_order_data が存在することを確認すること
-- ============================================================

-- SELECT policy（allowed_users に登録済みのユーザーのみ）
DROP POLICY IF EXISTS "Allowed users can select edinet_order_data" ON edinet_order_data;

CREATE POLICY "Allowed users can select edinet_order_data"
    ON edinet_order_data FOR SELECT
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- 確認クエリ（実行後に policy が追加されたことを確認）
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'edinet_order_data';
-- → 1 row が返ることを確認
```

> [!NOTE]
> INSERT / UPDATE / DELETE policy は今回追加しない。  
> 抽出スクリプトは `service_role_key` でバイパスするため不要。

---

## 7. 実行前確認項目

実際に Supabase SQL Editor で policy を追加する前に以下を確認すること。

```sql
-- 確認①: edinet_order_data が存在するか
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'edinet_order_data';
-- → rowsecurity = true であること

-- 確認②: 現在の policy 数が 0 件か
SELECT policyname FROM pg_policies
WHERE tablename = 'edinet_order_data';
-- → 0 rows であること

-- 確認③: allowed_users テーブルが存在するか
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'allowed_users';
-- → 1 row であること

-- 確認④: allowed_users にメールが登録されているか（件数確認のみ）
SELECT COUNT(*) FROM allowed_users;
-- → 1 以上であること（登録済みユーザーの存在確認）
```

---

## 8. 実行後確認クエリ

```sql
-- policy 追加確認
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'edinet_order_data';
-- → 'Allowed users can select edinet_order_data' / SELECT / ... が 1 行返ること

-- 動作確認（Supabase Auth でログイン済みのセッションで実行）
-- SELECT count(*) FROM edinet_order_data;
-- → allowed_users 登録済みなら 0（テーブルは空） / 未登録なら permission denied
```

---

## 9. 将来の拡張パターン（参考）

Viewer から受注データの手動補正が必要になった場合：

```sql
-- INSERT policy（将来追加候補）
CREATE POLICY "Allowed users can insert edinet_order_data"
    ON edinet_order_data FOR INSERT
    WITH CHECK (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );

-- UPDATE policy（将来追加候補）
CREATE POLICY "Allowed users can update edinet_order_data"
    ON edinet_order_data FOR UPDATE
    USING (
        auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
    );
```

---

## 10. 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [edinet-order-backlog-migration-009-result.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-migration-009-result.md) | 009 migration 実行結果（RLS ENABLED 確認済み） |
| [edinet-order-backlog-009-preflight-review.md](file:///C:/Users/takuy/OneDrive/company-memo-app/docs/edinet-order-backlog-009-preflight-review.md) | 009 migration 実行前レビュー |
| [supabase_schema.sql](file:///C:/Users/takuy/OneDrive/company-memo-app/supabase_schema.sql) | 既存テーブルの RLS パターン（参考） |
