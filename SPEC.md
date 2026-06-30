# Company Memo App / TDNET Alerts SPEC

## 1. 現行通知欄の厳格な定義

現行の通知欄つき本番サイトは以下である。

https://company-memo-app.vercel.app/tdnet-alerts

この `/tdnet-alerts` が、現在ユーザーが実際に使用している通知欄画面である。

root の以下URLは旧Company Viewerであり、通知欄の確認対象ではない。

https://company-memo-app.vercel.app/

同じドメインであっても、 `/` と `/tdnet-alerts` は別画面として扱うこと。

---

## 2. 正しい作業repo

現行通知欄の正しい作業repoは以下である。

C:\Users\takuy\OneDrive\company-memo-app

通知欄UI、AlertsPage.tsx、/tdnet-alerts に関する修正は、必ずこのrepoで行うこと。

主な対象ファイルは以下。

- app/tdnet-alerts/page.tsx
- components/tdnet-alerts/AlertsPage.tsx

---

## 3. 誤対象repo

以下は現行通知欄UIの修正対象ではない。

C:\Users\takuy\OneDrive\tdnet-excel-input

C:\Users\takuy\OneDrive\tdnet-excel-input\web

tdnet-excel-input 側に `/tdnet-alerts` や `AlertsPage.tsx` が存在していても、それを現行本番通知欄の修正対象として扱ってはならない。

---

## 4. 作業開始前の確認義務

通知欄UIを修正する前に、必ず以下を確認して報告すること。

1. 作業repoの絶対パス
2. git remote
3. 現在のbranch
4. 最新commit
5. 修正対象URL
6. 修正対象ファイル
7. `/tdnet-alerts` を描画しているpageファイル
8. 現行本番URLが `/tdnet-alerts` であること
9. root `/` を確認対象にしていないこと

以下が一致しない場合はコード変更禁止。

- 本番URL: https://company-memo-app.vercel.app/tdnet-alerts
- 作業repo: C:\Users\takuy\OneDrive\company-memo-app
- 主要ファイル: components/tdnet-alerts/AlertsPage.tsx

---

## 5. Vercel本番反映の完了条件

Vercelでは、Ready と Current Production を混同してはならない。

Ready は「新しい版が作られた」という意味であり、
Current Production は「本番URLが実際にその版を見ている」という意味である。

通知欄UIの修正では、以下すべてを満たすまで完了扱いしてはならない。

1. GitHubに目的のcommitがpushされている
2. VercelでそのcommitのデプロイがReadyになっている
3. そのcommitがCurrent Productionになっている
4. Production Alias がそのデプロイを向いている
5. 本番URL https://company-memo-app.vercel.app/tdnet-alerts で実際に表示変化を確認している

以下だけでは完了扱いしてはならない。

- 200 OK が返る
- VercelでReadyになった
- GitHubにpushした
- ローカルでbuildが成功した
- ローカルで表示できた

---

## 6. ロールバック後の注意

Vercelでロールバックした後は、本番URLが古い版を見続ける場合がある。

そのため、ロールバック後に新しい修正をpushした場合は、必ず以下を確認すること。

1. 新しいデプロイがReadyになっていること
2. その新しいデプロイがCurrent Productionになっていること
3. 本番画面で実際に表示が変わったこと

Readyだけで「本番反映完了」と報告してはならない。

---

## 7. 完了報告に必ず含めるもの

通知欄UIの修正完了報告には、必ず以下を含めること。

- 修正repo
- 修正ファイル
- commit ID
- push先branch
- Vercel Deployment URL
- Production Alias URL
- Current Production のcommit ID
- 本番URLで実際に確認した内容
- 200 OKだけで完了判定していないこと

---

## 8. 絶対禁止

以下は禁止。

- tdnet-excel-input を現行通知欄UIの修正対象として扱うこと
- root URL `https://company-memo-app.vercel.app/` を通知欄確認URLとして扱うこと
- Readyだけで本番反映完了と報告すること
- 200 OKだけで本番反映完了と報告すること
- Current Production の確認なしに完了報告すること
- Vercel CLIで本番デプロイすること
- vercel --prod を使うこと
- DBやSupabaseを無断変更すること
- src/events を無断変更すること


## 9. EDINET受注 / ORDER KPI のデータストア定義

現行の Viewer ( `/tdnet-alerts` 等 ) における受注データの保存先は以下で厳格に定義される：

1. **EDINET受注データ**
   - **本番保存先**: Supabase `edinet_order_data` テーブル
   - **参照API**: `lib/viewer-api.ts` の `loadEdinetOrders(ticker)`
   - **UI**: `CompanyViewer.tsx` の EDINET受注タブ

2. **TDNET ORDER KPIデータ**
   - **本番保存先**: Supabase `order_kpis` テーブル
   - **参照API**: `lib/viewer-api.ts` の `loadOrderKpis(ticker)`
   - **UI**: `CompanyViewer.tsx` の ORDER KPIタブ

> [!WARNING]
> **旧システム残骸の使用禁止**
> ローカルの `data/decision_db.db`、`order_metrics`、その他ローカルSQLiteの受注っぽい旧テーブルは、旧システムのプロトタイプ残骸であり、**現行Viewerの EDINET受注タブからは一切参照されない**。
> そのため、これらを保存先にしてはならない。

## 10. 保存先判断と本番投入の厳格ルール

1. **保存先判断ルール**
   - 保存先は必ず Viewer/API の参照経路から逆算して決めること。
   - ローカルDB棚卸しで見つかったテーブル名だけで保存先を決めてはならない。
   - DB保存プリフライトでは、最初に `CompanyViewer.tsx` / `viewer-api.ts` の参照先を確認すること。

2. **現行ルートの注意**
   - 現行利用画面は `/tdnet-alerts` であり、root `/` の旧Company Viewer と混同しないこと。
   - `CompanyViewer.tsx` は共通コンポーネントのため、どのルートで使われているか確認すること。

3. **本番投入ルール**
   - Supabase書き込みは、ユーザーの明示承認後のcanary投入から開始すること。
   - canary前に `edinet_order_data` のスキーマ確認、UNIQUE/重複確認、planned rows確認を必須とすること。
   - USER_APPROVAL / HOLD / EXCLUDED 候補は自動保存の対象外とすること。
