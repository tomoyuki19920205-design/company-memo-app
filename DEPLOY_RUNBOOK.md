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

> [!WARNING]
> Viewer機能を含む本アプリの本番デプロイは、**必ずこの `company-memo-app` リポジトリからのみ**行ってください。
> `tdnet-excel-input` 等、別のリポジトリから Vercel CLI (`npx vercel --prod`) を直打ちしてデプロイすることは**絶対禁止**です。
