# Company Viewer — 本番運用ガイド

## 概要

3人共有の企業詳細 Web Viewer。Supabase Auth + RLS で認証・権限管理。Vercel にデプロイして使用。

> **重要**: localhost では自分以外アクセスできません。3人で共有するには **Vercel にデプロイ**してください。

---

## 🔧 本番公開チェックリスト（一本道手順）

以下を上から順に実行してください。

### Step 1: Supabase SQL 実行

1. [Supabase Dashboard](https://supabase.com/dashboard) → 対象プロジェクト
2. **SQL Editor** → New Query
3. `supabase_schema.sql` の内容を全文コピペして **Run**
4. エラーが出なければ OK（何度実行しても安全）

### Step 2: allowed_users にメール登録

SQL Editor で以下を実行（メールアドレスを実際のものに変更）:

```sql
-- 3人分を登録（メールを実際のアドレスに変更してください）
INSERT INTO allowed_users (email, display_name) VALUES
    ('user1@gmail.com', 'ユーザー1'),
    ('user2@gmail.com', 'ユーザー2'),
    ('user3@gmail.com', 'ユーザー3')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name;
```

確認:

```sql
SELECT * FROM allowed_users;
```

### Step 3: Supabase Auth ユーザー作成

1. Supabase Dashboard → **Authentication** → **Users**
2. **Add User** → **Create new user**
3. 以下を入力:
   - **Email**: allowed_users と**完全に同じメールアドレス**
   - **Password**: 任意（8文字以上推奨）
   - ✅ **Auto Confirm User** にチェック
4. **Create** をクリック
5. 3人分繰り返す

> ⚠️ **Auth のメールと allowed_users のメールが1文字でも違うと RLS で拒否されます。**
> 大文字小文字も一致させてください。

| # | Email | Password | 備考 |
|---|-------|----------|------|
| 1 | `user1@gmail.com` | (任意) | Auto Confirm ✅ |
| 2 | `user2@gmail.com` | (任意) | Auto Confirm ✅ |
| 3 | `user3@gmail.com` | (任意) | Auto Confirm ✅ |

### Step 4: Supabase Auth URL 設定

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. 以下を設定:

| 設定 | 値 |
|------|-----|
| **Site URL** | `https://your-app.vercel.app` |
| **Redirect URLs** | `https://your-app.vercel.app/auth/callback` |

3. ローカル開発も使う場合、Redirect URLs に追加:
   - `http://localhost:3333/auth/callback`

> Vercel のデプロイ完了後に実際の URL がわかるので、デプロイ後に Site URL を更新しても OK。

### Step 5: GitHub にプッシュ

```bash
cd company-memo-app
git init
git add .
git commit -m "Company Viewer v1"
git remote add origin https://github.com/your-user/company-viewer.git
git push -u origin main
```

### Step 6: Vercel デプロイ

1. [vercel.com](https://vercel.com) にログイン
2. **Add New** → **Project**
3. GitHub リポジトリを選択（Import）
4. 設定:
   - **Root Directory**: `company-memo-app`（モノレポの場合）
   - **Framework Preset**: Next.js（自動検出）

### Step 7: Vercel 環境変数設定

Project Settings → **Environment Variables** で以下を追加:

| 変数名 | 値 | 取得場所 |
|--------|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API → URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase → Settings → API → anon public |

**Environment** は `Production`, `Preview`, `Development` 全てにチェック。

設定後 **Redeploy** を実行。

### Step 8: 動作確認

本番 URL にアクセス:

| # | 確認項目 | 期待 |
|---|---------|------|
| 1 | URL にアクセス | /login にリダイレクト |
| 2 | 未登録メールでログイン | エラー表示 |
| 3 | 登録済みメールでログイン | viewer 表示 |
| 4 | ticker 入力（例: 4062） | PL テーブル表示 |
| 5 | PL 横/縦スクロール | 正常動作 |
| 6 | FY 行が黄色 | ✅ |
| 7 | Memo A/B ダブルクリック編集 | 保存成功 |
| 8 | 左メモ欄で保存 | 保存成功 |
| 9 | リロード後メモ復元 | ✅ |
| 10 | ログアウト → 再アクセス | /login にリダイレクト |
| 11 | allowed_users にないメールでログイン | データ取得0件 |

---

## 📋 よく使う SQL

### ユーザー追加（4人目以降）

```sql
-- 1. allowed_users に追加
INSERT INTO allowed_users (email, display_name)
VALUES ('new-user@example.com', '新メンバー');

-- 2. Supabase Dashboard → Authentication → Add User で同じメールを登録
```

### ユーザーのメール変更

```sql
UPDATE allowed_users
SET email = 'new-email@gmail.com'
WHERE email = 'old-email@gmail.com';
```

### 登録状況の確認

```sql
SELECT id, email, display_name, created_at FROM allowed_users ORDER BY created_at;
```

### RLS テスト（SQL Editor で）

```sql
-- allowed_users の中身確認
SELECT * FROM allowed_users;

-- company_memo_grids のデータ確認
SELECT ticker, period, quarter, updated_at FROM company_memo_grids LIMIT 10;
```

---

## ローカル開発

### 前提

- Node.js 18+
- `.env.local` に環境変数設定済み

### `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 起動

```bash
cd company-memo-app
npm install
npx next dev --port 3333
```

http://localhost:3333 でアクセス。

### 再デプロイ

```bash
git add .
git commit -m "update"
git push
```

Vercel が自動でデプロイ。

---

## 認証フロー

```
ブラウザ → middleware.ts (セッション確認)
              ↓ 未認証 → /login (Email/Password)
              ↓ 認証済 → / (viewer)
                           ↓
                     Supabase RLS
                     auth.jwt() ->> 'email' IN (SELECT email FROM allowed_users)
                           ↓ 許可 → データ取得/保存
                           ↓ 拒否 → 空結果 or エラー
```

---

## 既知の限界

1. **同時編集は後勝ち上書き** — 同じ期のメモを2人が同時編集した場合、後に保存した方が残る
2. **リアルタイム同期なし** — 他ユーザーの変更はリロードで反映
3. **Magic Link / OAuth 未実装** — Email/Password のみ
4. **パスワードリセット未実装** — Dashboard から手動で対応
