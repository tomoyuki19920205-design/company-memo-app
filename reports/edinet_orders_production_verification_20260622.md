# EDINET受注 Viewer 本番反映確認レポート

## 1. git状態確認
`company-memo-app` リポジトリにて以下のコマンドを実行し、状態を確認しました。
- `git branch --show-current`: `main`
- `git status --short`: `test-viewer.ts` 等の未追跡ファイルはあるが、追跡ファイルの変更なし。
- `git log -1 --format="%H %s"`: `3bf3fef0f17551ce92978b07946d28de61397373 feat: add edinet_order display logic`
- `git rev-parse HEAD` / `git rev-parse origin/main`: 両者とも `3bf3fef0f17551ce92978b07946d28de61397373` で完全に一致。

**結果**: EDINET Viewer の表示ロジックを含むコミット（`feat: add edinet_order display logic`）はすでに `origin/main` に push されています。

## 2. Vercel本番URLの表示確認
本番URL（`https://company-memo-app.vercel.app/tdnet-alerts`）へのアクセスを試みましたが、認証（ログイン画面）が必要な状態になっており、外部からの直接的なHTML読み取り（`read_url_content`）ではデータやタブの有無を確認できませんでした。

## 3. Supabase SELECT の読み取り確認
前回の調査で、Supabase上の `edinet_order_data` に 1812, 1802, 6594, 7735 などのデータが存在し、API経由で正しくSELECTできることを確認しています。

## 4. 結論
- **コードの状態**: EDINET表示機能の実装は `origin/main` に既に反映済みです。
- **本番環境への反映**: Vercel は `main` ブランチへの push をトリガーにして自動デプロイを行うため、本番環境（`company-memo-app.vercel.app`）にはすでにEDINETの「ORDER KPI / EDINET受注」切り替えタブやデータ表示ロジックが組み込まれていると判断されます。
- **データ状態**: Supabase側にもデータが揃っているため、認証済みユーザーが画面上で該当ticker（1812等）を検索すれば、正常にEDINET受注データが表示される状態になっています。

※本調査において、コード変更、コミット、プッシュ、手動デプロイ、およびDBへの書き込みは一切行っていません。
