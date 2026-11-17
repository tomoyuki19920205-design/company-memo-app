# 決算カレンダー：運用・実装メモ

2026-11-18。ローカル開発用コピー、ブランチ `codex/earnings-calendar-local`。基点は `944743a`。
本番URLの追加候補は `https://company-memo-app.vercel.app/earnings-calendar`。未公開です。

## 使い方

現在のローカル確認URLは `http://127.0.0.1:3104/earnings-calendar?date=2026-12-04`。
既存Company Viewerのアカウントでログインします。12月4日の12社は入力予定であり、全社を「公式日未確認」として保持しています。
左で日付・企業を選ぶと、中央の全文レポートと右の既存Viewerが同じ企業へ切り替わります。
予測本文／独立レビュー／未解決事項を切り替えられます。比較条件は「前Qの比較元・確認状態」で確認できます。
区切り線はドラッグ、左右矢印、Shift＋左右矢印で変更できます。Homeまたはダブルクリックで38:34:28へ戻ります。
狭い画面では3ペインを横に移動します。中央のMarkdown表と右のPLは、それぞれ横スクロールできます。

## 次の決算日の手動取り込み

リポジトリのルートで実行します。Pythonは標準ライブラリだけを使用します。

```powershell
Set-Location 'C:\Users\takuy\Documents\Codex\2026-11-17\2026-11-3-5-1-api\outputs\company-viewer-calendar'
$calendarPython = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe'
& $calendarPython -B -X utf8 scripts/import-earnings-calendar.py --run '取り込む実行結果フォルダの絶対パス'
# 予測が未作成の企業も含む予定表を追加する場合
& $calendarPython -B -X utf8 scripts/import-earnings-calendar.py --schedule '予定企業CSVの絶対パス'
```

両方の引数を同時指定できます。出力先の既定値は `server-data/earnings-calendar`、別のローカル保存先は `--store` で指定します。
予定CSVの列は以下です。`code,company_name,announcement_date` が必須です。

```csv
code,company_name,announcement_date,status,fiscal_year_end,quarter,source
1873,日本ハウスホールディングス,2026-12-04,unconfirmed,2027-04-30,2,ユーザー入力予定
```

- status: `official`（公式確定）、`external`（外部サイト予定）、`provisional`（暫定）、`unconfirmed`（未確認）。未指定はunconfirmed。
- officialには公式の出典URLを指定します。手動指定そのものが事実確認の代行になるわけではありません。
- fiscal_year_endとquarterは併記を推奨します。対象期がない予定では、選択日より前の最新完了四半期を表示し、その制約を注記します。
- 原本のsummary.csv、各社result.json、reports、quality_review、独立レビュー、issues・assumptions・guidance_comparisons・schedule_checks CSVを読みます。数値は構造化JSONとCSVを照合し、Excel表示の丸め値は取り込みません。
- 企業コード、日付、四半期、期間、CSVとJSONの整合を検査します。一部企業の失敗はreceiptに理由を保存し、他社を継続します。
- 同じ内容はスキップし、変更された内容は別のIDで保存します。詳細ファイルは上書きしません。予測値・本文・レビューを改変しません。
- 処理中断時は再実行できます。`import.lock`が残る場合は、前のインポーターが終了したことを確認してから、この保存先のロックだけを除去します。稼働中に除去しないでください。
- 取り込み後はブラウザーを再読み込みします。Vercelではファイルが読み取り専用なので、承認後の再ビルド・再デプロイが必要です。

## ローカル起動・検査

`.env.local`には既存アプリと同じ `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定します。サービスロールキーは不要です。

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run typecheck
npm.cmd test
& $calendarPython -B -X utf8 tests/test_calendar_import.py
node --env-file=.env.local --import tsx scripts/verify-earnings-calendar.tsx 2026-12-04
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3104
```

`npm test`はネットワークを使わない既存・追加テストです。Pythonテストは同階層に今回のquality_v2原本がある場合に実行できます。
`verify-earnings-calendar.tsx`だけが既存Supabaseを読み取り、日付を引数で受けて前Q・予測値・既存PLコンポーネントを照合します。DB更新・OpenAI呼び出しはしません。
Windowsの隔離環境で一時ディレクトリを作れない場合は、書き込み可能な検査用フォルダを `CALENDAR_TEST_TMP` で指定します。
ビルド中は開発サーバーを停止し、`.next`を同時に書き換えないでください。

## 保存構造とAPI

保存先はpublic配下ではありません。`EARNINGS_CALENDAR_DATA_DIR`でサーバー側の保存先を切り替えられます。
Vercelの既定運用ではこの変数を設定せず、取り込み済みのファイルをビルドに同梱します。

| ファイル | 内容 |
|---|---|
| schedules.json | 日付＋企業コードで一意の予定。予測の有無と独立 |
| index.json | 予測のコード・決算期・四半期・基準日時・版・保存日時・品質・数値 |
| details/コード-SHA256.json | 原文Markdown、別レビュー、構造化予測、未解決事項・仮定・出典ハッシュ |
| comparison-contexts.json | 保存資料の会計基準・連結範囲・単位。比較の禁止判定だけに使用 |
| receipts/*.json | 成功・スキップ・失敗、取り込み後の件数 |

SHA-256は入力の予測・本文・レビュー・付随CSVの内容から計算します。形式上のvalidは、経済的な予測妥当性が検証済みという意味ではありません。
初期表示は発表日前の有効な予測から情報基準日時が新しい版を選びます。発表日以後の版は明示して手動選択する参考版です。
時刻がない予定日との境界は日本時間0時とし、同日中の予測を発表前と推定しません。

読み取りAPIはすべて `GET /api/earnings-calendar`。SupabaseのgetUserによる認証確認とprivate/no-storeを使用します。

| 引数 | 応答 |
|---|---|
| month=YYYY-MM | 予定表から集計した日別件数。PL問い合わせなし |
| date=YYYY-MM-DD | 日付の全予定企業、前Q、標準予測。PLは40コード単位・500行ページングで取得 |
| date=...&code=... | 選択企業の詳細と版一覧。本文を遅延取得 |
| date=...&code=...&version=... | 指定した保存版 |

本番向けビルドでは既存middlewareが未認証アクセスをログインに誘導します。API本体にも独立の401ガードがあります。
新しい書き込み用HTTP API、アップロードAPI、認証回避、サービスロールキー、定期タスクは追加していません。
将来の予定配信・DB保存への置換箇所は `lib/earnings-calendar-store.ts`。UIと集計の型を維持してアダプターを差し替えられます。

## 前Qと比較上の限界

`lib/viewer-api.ts`のPL取得本体を`lib/financial-loader.ts`へ共通化しました。右のCompanyViewerと日付一覧が同じcanonicalビューを読み、同じtransformとquarter-mathを使います。
前Qは予測対象Qの直前。Q1予測では前期FY−3Qを使います。前年も同四半期単独で比較し、欠損は埋めません。
金融業などで既存Viewerが営業利益以外を表示する場合、営業利益YoYとして置き換えて表示しません。
利益が赤字の場合は黒転／赤転／赤縮／赤拡等を使い、率のソートでは欠損と同様に末尾へ残します。

今回の例外：436Aは比較四半期が不足。6696は保存資料で前Qと前年Qの連結／単体が異なるため非表示です。
その他10社も既存DBには会計基準・連結範囲の履歴が完全にはなく、その未確認状態を画面に明示します。
表示前Qは現在のViewerデータです。保存予測の情報基準日時のスナップショットとして扱いません。
財務データの原本や予測精度、会社固有の会計判断を今回のUI実装で修正・保証したものではありません。

## 本番反映

2026年11月18日に、今回のコード差分と12社の認証付き配信データについてmainへの反映・pushと既存Vercel本番プロジェクトへの公開が承認されました。DBスキーマ変更・DBへのデータ投入は不要です。
公開時は最新mainとの差分を再確認し、`company-memo-app`という名前の独立したチェックアウトから既存のデプロイガードを通します。停止中の有料API設定・NY/セクター/NEWS/TDNETの配信処理には触れません。
公開後は `/earnings-calendar?date=2026-12-04` の12社、本文・PL連動、操作、既存4ページ、未認証アクセスを確認します。異常時は公開前に記録した既存Vercelデプロイへロールバックします。
