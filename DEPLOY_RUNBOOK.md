# Deployment Runbook

## 対象プロジェクト
- **Project Name:** company-memo-app
- **Production URL:** https://company-memo-app.vercel.app

## デプロイ手順
本リポジトリでは誤デプロイを防ぐため、Vercel へのデプロイ前に厳格なガードが設けられています。

以下のコマンドを実行して本番へデプロイしてください：

```bash
npm run deploy:prod
```

### ガードの仕組み (`scripts/check-deploy.mjs`)
デプロイを実行する前に以下の検査を自動で行い、**すべての条件を満たした場合のみ**デプロイが開始されます。一つでも満たさない場合は `[STOP]` となりデプロイは失敗します。

1. **Git Root Check:** 実行ディレクトリが `company-memo-app` であるか
2. **Git Remote Check:** リモートに `company-memo-app.git` が含まれているか
3. **Vercel Project ID Check:** `.vercel/project.json` の ID が `prj_GwU7C3maWs9p3OnyAw8MNTscaVbQ` であるか
4. **Vercel Project Name Check:** `.vercel/project.json` の Name が `company-memo-app` であるか
5. **Forbidden Project Check:** `web-psi-six-68` や `web-psi` 等の誤ったプロジェクト設定が混入していないか
6. **Required Ancestry Check:** 現在の `HEAD` が、productionで必須のViewer機能commitをすべてancestorとして含むか

Required Ancestry Checkは各commitに対して`git merge-base --is-ancestor <required_commit> HEAD`相当を実行します。1件でも欠けていれば、機能名とcommit hashの一覧を表示して`[STOP]`し、Vercel CLIは起動しません。force overrideはありません。

Preview deployにはこのguardを適用しません。Previewはproduction aliasを変更せず、rollback事故を発生させないためです。Previewをproductionへ反映するときは、必ず改めて`npm run deploy:prod`を実行してください。

> [!WARNING]
> Viewer機能を含む本アプリの本番デプロイは、**必ずこの `company-memo-app` リポジトリからのみ**行ってください。
> `tdnet-excel-input` 等、別のリポジトリから Vercel CLI (`npx vercel --prod`) を直打ちしてデプロイすることは**絶対禁止**です。
