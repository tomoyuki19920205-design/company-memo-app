# 決算予定日更新の運用手順

この拡張は決算予定日と企業マスターを管理する。業績予測は生成しない。既存12社の `schedules.json` / `index.json` / `details/` / `comparison-contexts.json` は変更せず、追加の `registry.json` で表示を拡張する。DBマイグレーション、認証変更、定期タスクの追加、有料APIは不要。

## 情報源と利用範囲

- 自動収集: [東証上場会社情報サービス](https://www2.jpx.co.jp/tseHpFront/JJK010010Action.do?Show=Show)。公開検索フォームの200件表示で3市場の一覧を取得し、会社ごとの基本情報にある発表予定日・Q区分・期末月日・上場日を読む。
- [同サービスの利用案内・免責事項](https://www.jpx.co.jp/listing/co-search/01.html) には、公開情報の利用を制限しない旨の記載がある。決算書・有価証券報告書など第三者の資料本文は取り込まず、基本情報の事実のみ保存する。サービスの掲載条件により未登録・非表示の予定がある。空欄を「発表予定なし」と判定しない。
- JPX一般サイトの [利用条件](https://www.jpx.co.jp/term-of-use/index.html) は二次利用・再配信を制限している。その一般ページの月末銘柄Excel・決算予定Excelは今回の配信用レジストリに取り込まない。情報サービスで独立に確認した値を使う。
- 各社IR等の補足は、利用条件と原資料を確認してから手動CSV/XLSXを使う。第三者サイト、有料データ、ログイン必須ページ、CAPTCHA回避は自動取得の対象にしていない。

## ローカルでの更新

Python 3と、Excel取り込み時のみopenpyxlが必要。Node依存は既存のものを使用する。

```powershell
# このリポジトリを作業ディレクトリにする。
# この環境で検証に使用したPython。別環境では使用可能なPython 3に置き換える。
$pythonExe = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-611-0_26.1112.611.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe'
.\scripts\update-calendar.ps1 -From '2026-11-01' -To '2027-04-30' `
  -PythonExe $pythonExe -Cache '../../work/calendar-schedule-cache' `
  -ViewerMaster '../../work/calendar-schedule-cache/viewer-master-read.json'
```

次回は `-From` / `-To` を変更する。`-Refresh` はキャッシュを更新し、`-SkipFetch` は通信せず保存済みデータを再統合する。通常は24時間以内の企業別キャッシュを再利用する。期間・企業数・入力CSVの日付はコードに固定しない。既存12コードは収集順の優先指定だけであり、収集対象を限定しない。

```powershell
# 別期間への更新例。日程を推定生成する処理はない。
.\scripts\update-calendar.ps1 -From '2027-05-01' -To '2027-10-31' `
  -PythonExe $pythonExe -Cache '../../work/calendar-schedule-cache' `
  -ViewerMaster '../../work/calendar-schedule-cache/viewer-master-read.json' `
  -Manual 'C:\path\verified-schedules.csv'

# 収集だけを途中から再開。キャッシュ済みの正常な企業はスキップ。
& $pythonExe scripts/collect-tse-schedules.py --cache ../../work/calendar-schedule-cache
# 少数銘柄を公式IR確認後に再確認する場合
& $pythonExe scripts/collect-tse-schedules.py --cache ../../work/calendar-schedule-cache --codes 2353 --refresh
```

企業マスター照合用JSONは既存Viewerの `companies` を読み取り専用で出力したもの。`{ "checkedAt": "...", "companies": [{"ticker_code":"...","name_ja":"..."}] }`。取得には既存の認証・RLSを使う。匿名権限で0件だったものを「全社不一致」と解釈しない。今回の実データは認可済みSupabaseコネクターのSELECTで取得した。更新頻度に応じて同じ読み取りを実施する。

## 手動CSV・Excel

CSVはUTF-8（BOM可）。XLSXは先頭シート・先頭行を列名とし、計算式セルは拒否する。日付はISO形式、時刻はJSTの `HH:mm`、公表時刻はタイムゾーン付きISO形式を文字列で指定する。

必須列:

|列|内容|
|---|---|
|code|4文字、英字を含む証券コード|
|company_name|企業マスターと照合する名称（全半角・法人格等は正規化）|
|announcement_date|公表された発表予定日。未知なら空欄|
|fiscal_year_end|対象決算期末の年月日|
|quarter|1〜4。4は本決算|
|status|official_ir / exchange / provisional / unknown / changed / announced|
|source_url|原資料URL。確認済み扱いには必須|

任意列: `announcement_time`, `source_published_at`, `actual_date`, `confirmation_status`, `note`。延期して日付未定の場合は `status=changed`, `announcement_date` 空欄、`confirmation_status=official_ir` 等で根拠を指定する。`announced` は原資料と `actual_date` が必要。過去日であることだけでは自動で発表済みにしない。

既存企業に一致しないコード、名称不一致、日付不正、未来の公表時刻は `issues.csv` へ隔離する。公式IR・取引所の情報と古い/低信頼情報が競合した場合は自動で上書きせず、差分・競合を報告する。

企業マスターの補正には `-MasterUpdates` のCSV/XLSXを使う。列: `code,previous_code,company_name,market,fiscal_end_label,listing_status,listing_date,delisting_date,source_url`。IPOは新コード追加、改称は同コードの名称変更、コード変更は `previous_code` と `code` で明示する。自動推定で別会社を統合しない。補正入力・旧値・別コードを保存し、予測検索でも旧コードを参照する。現マスターから消えただけの企業を上場廃止と断定しない。

## 対象期と未確認情報

発表日とQ番号は原資料の表示値。情報サービスの基本情報は期末「月日」で、対象の決算「年」まで明記しない。既存12社は既存の確認済み対象期を保つ。それ以外は期末月日・Q・発表日から120日以内の報告遅れとなる一意の期を対応付け、`targetConfirmed=false` / `periodBasis=fiscal_calendar_unverified` と明示する。対応が一意でない場合は対象期を空欄にする。決算期変更や変則決算は原資料の明示的な対象期で補正が必要であり、全社の対象期確認済みとは扱わない。

前Qの差引計算・YoY計算は従来の共通ロジックのまま。期末の暦対応から表示する場合は比較条件に未照合の注記を出す。対象期不明なら前Q比較は保留し、「最新PLに存在する同じ発表対象Q」を誤って前Qと表示しない。右PLは既存Viewerの最新データで、予測時点のスナップショットとは区別する。

`unknown` 集計は公式・取引所の日程未確認企業で、暫定候補がある企業も含む。`withoutCandidate` は候補日さえない企業。`notChecked` / `failed` / `no_published_date_in_period` を分ける。確認対象期間に1回以上日付を得た企業数と、四半期イベント数は別集計。1社に複数日付があり得るので、日別件数の合計はユニーク企業数とは一致しない。

## 保存・再開・障害時

- 取得は1秒以上の間隔。503等は2秒・4秒の待機後に最大3回。401/403/429は回避せず停止。連続5社の取得障害でも停止する。
- `collector.lock` と `import.lock` で二重実行を防ぐ。通常のCtrl+C・終了ではロック解放。プロセス強制終了後にロックが残ったら、記録のPIDが終了したことを確認してそのロックだけを取り除き、同じコマンドを再実行する。
- 企業別キャッシュは一時ファイルから置換。取得済みファイルは再開時に再利用。取得処理とレジストリ統合を分け、途中でも取得できた範囲を集計できる。
- レジストリは同じ企業・決算期・Qでupsertし、単一JSONの原子的な置換で世代を切り替える。日程変更履歴と初回登録時刻を保持。消えた予定は自動削除しない。
- 元の12社成果物と既存財務DBは更新しない。予測のリンクは発表日より対象期を優先する。

出力: `registry.json`、`company-master.csv`、`master-mismatches.csv`、`schedules.csv`、`daily-counts.csv`、`unresolved-companies.csv`、`issues.csv`、実行別/最新 `run-*.json`。今回の実行結果と画面検証は隣接する `company-viewer-calendar-schedule-validation` フォルダーにある。

## 表示・検証・公開

```powershell
npm test
& $pythonExe -m unittest discover -s tests -p test_schedule_registry.py
npm run typecheck
npm run build
npm run start -- --hostname 127.0.0.1 --port 3104
```

`http://127.0.0.1:3104/earnings-calendar?date=2026-12-04` を既存アカウントで開く。月表示は一括集計、日表示は20社ずつ最大2グループで共通財務ローダーを利用、個別レポートは選択後取得、一覧は仮想スクロール。DBタイムアウト等は失敗グループだけ10社へ分割して1回再試行し、成功企業の結果を保つ。全APIで従来のログイン判定とprivate/no-storeを維持する。ローカル取り込み後はページを再読み込みして月集計も更新する。

この手順はmainのpush、Vercelデプロイ、DBへの投入を行わない。本番公開には今回のデータ件数・未確認事項・差分の確認後に別途承認が必要。本番は読み取り専用のビルド同梱ファイルなので、承認後の更新時はレジストリを含めて再デプロイする。自動スケジューラーは有効化しない。
# 本番公開時の企業対応確認（2026-11-18）

社名差84件を照合し、74件は表記差・JPX公式商号変更一覧・会社IRで対応を確認しました。
10件（4390、520A、546A、547A、548A、575A、623A、656A、660A、9399）は、今回取得した一次資料から既存財務マスター名との同一性を確認しきれず、財務連動を保留しています。
予定日・カレンダー件数は保持し、当該企業の前Q比較・予測紐付け・右PL読み込みを停止して保留理由を表示します。既存財務マスターは変更しません。

確認結果は `registry.json` の `companies[].viewerIdentityReview` に、証券コード、取引所企業名、財務コード・企業名、判定、理由、出典URL、確認日時を保存します。
判定はこの4項目の完全一致にのみ適用し、再取り込みで変わった場合は失効します。新しい社名差や財務マスター欠落も自動で保留します。再確認後は同じ4項目を指定した証拠付き判定を更新し、テスト・デプロイします。

対象決算年未照合3,262件の `targetConfirmed` は引き続き `false` です。暦から対応を置いた対象年とQは確定情報ではなく、画面の「対象年未照合」と比較条件注意に表示します。4件は対応年を特定できず `target:null`、前Q比較も保留です。既存12社の対象期・予測・レポートは変更していません。
