# 未予測企業CSV出力・手動予測運用

左列の日付ボタン直下にある「未予測 ○社 CSV出力」で、選択日の全候補をUTF-8 BOM付きCSVに保存する。検索・並べ替え・選択銘柄によって出力集合は変わらない。0社は無効。「出力対象の確認」を開くと候補のコード・名称、照合要確認、暫定日程、除外理由を確認できる。↻は保存済み予測の登録状態を再読込する。

## 判定とCSV仕様

- 同一コード・確認済みの決算期末・四半期に、構造上有効な売上高と営業利益の有限数値が両方登録されていれば予測済み。0・赤字も値として扱う。要修正・検証未了等の品質ラベル、日程変更は登録を取り消さない。片方が欠損する失敗結果や別の期の予測は今回の予測済みとしない。
- 対象年未照合（`targetConfirmed=false` 等）は「照合要確認」としてCSV候補に残す。暦から対応付けた対象年はCSVへ出さない。原資料で観測したQ表記がある場合だけQ列を出し、それ以外は空欄。コード・日付・推定対象年だけで予測と紐付けない。
- 公式JPX上場会社情報に一意のコード・名称がある企業は、財務連動が保留でも出力可能。公式企業情報欠落・名前不一致・コードの曖昧さ・同日の複数対象期はCSVから除外し、理由を表示する。既存のカレンダー行は削除しない。旧コード別名だけで予測済みとはしない。
- 暫定・未確認の日程は`暫定`を出力し、画面に予定全体とCSV対象の暫定件数を表示する。
- コードは文字列のまま扱う。UTF-8 BOM、CRLF、引用符・改行のCSVエスケープ、数式開始文字の無効化を行う。`436A`・`0010`をそのまま既存ローダーへ渡せる。
- CSVには型情報がない。**Excelで編集・再保存する場合は「データ→テキスト/CSVから」でcode列を文字列として取り込む。** 直接開くとExcelの自動変換で先頭ゼロが消える場合がある。予測システムにはダウンロード原本を渡せば変換不要。数式`="0010"`は生成しない。

列は`code,company_name,announcement_date,fiscal_year,fiscal_quarter,schedule_status,source_url,target_status,forecast_status,financial_link_status`。`fiscal_year`は確認済み決算期末の西暦年（年度の開始年ではない）。既存の`forecast.inputs.load_companies`は最初の3列を読み、追加列はエラーなく無視する。そのため、**追加列の注意事項はAIへ自動的には伝達されない**。対象期・暫定日程は実行前に原資料で確認し、実行後の結果とも照合する。

2026-11-18の実データでは、12月4日の予定13社のうち予測値登録済み12社、出力1社（9008 京王電鉄）。京王電鉄の対象年は未照合のため空欄、Q2は原資料の表記、判定は照合要確認。日程暫定の2353は対象期の予測値が登録済みなので再出力されない。

## 予測を実行する

ダウンロードだけではAIを起動しない。以下は予測を実行するときの操作。出力先は既存実行フォルダと重複しない名前にする。基準日時・対象日は目的に合わせて指定し、既存446社や既存12社の出力先を指定しない。

```powershell
$system = 'C:\Users\takuy\Documents\Codex\2026-11-17\2026-11-3-5-1-api\outputs\earnings-forecast-system'
$date = '2026-12-04'
$csv = 'C:\data\earnings_targets_2026-12-04.csv' # 実際のダウンロード先
$run = Join-Path $system 'runs\20261204_viewer_csv_new'
& "$system\Start-Forecast.ps1" `
  -AnnouncementDate $date `
  -Companies $csv `
  -AsOf '2026-11-17T17:09:00+09:00' `
  -Output $run `
  -Parallel 4 `
  -Execution codex-chatgpt `
  -Model gpt-6-astra `
  -QualityReview
```

認証は既存のChatGPTログイン。追加のAPIキーは設定しない。独立レビュー済み結果は、上記例では`$run + '_quality_v2'`に保存される。実行・再開・失敗再試行は既存Start-Forecastの仕様に従う。

今回の互換性検査では、Start-Forecastが呼ぶ同じ`app.py run`と`load_companies`を使い、`mode=codex-chatgpt`・`parallel=4`・`model=gpt-6-astra`で`--max-jobs 0 --no-excel`を指定した。対象1社の読み込み・永続化まで実行し、企業処理0件・AI呼び出し0件・有料API0件を実行記録で確認した。上記の無制限予測・独立レビューコマンド自体は今回再実行していない。

## 結果をViewerへ取り込む

既存のオフライン取り込みスクリプトを使う。最初は隔離した保存先で確認し、その結果を確認してから必要なデータだけを開発用ストアへ反映する。本番反映は別途レビュー・承認・デプロイが必要で、ブラウザーのCSVボタンから書き込みは行わない。

```powershell
$viewer = 'C:\Users\takuy\Documents\Codex\2026-11-17\2026-11-3-5-1-api\outputs\company-viewer-calendar'
$runtime = Get-Content "$system\runtime.json" -Raw | ConvertFrom-Json
$reviewRun = $run + '_quality_v2'
$testStore = Join-Path $viewer '..\calendar-new-forecast-import-check'
& $runtime.python -B -X utf8 "$viewer\scripts\import-earnings-calendar.py" `
  --run $reviewRun --store $testStore

# 確認後、開発用ストアへ取り込む際の正確なコマンド
& $runtime.python -B -X utf8 "$viewer\scripts\import-earnings-calendar.py" `
  --run $reviewRun --store "$viewer\server-data\earnings-calendar"
```

取り込みは3シナリオ・比較・本文・独立レビュー・品質・未解決事項・基準時点・版を保存する。内容ハッシュが同じ版はスキップし、新しい版は追加保存する。予定データの追加が必要な場合だけ既存`--schedule`を利用する。CSV出力の入力リスト自体を、対象期確認済みの予定データとして流用しない。

**対象年未照合の企業は、予測を取り込んだだけでは自動的に照合済みにならない。** 原資料で対象期を確認後、既存の[決算予定日更新手順](calendar-schedules.md)に従い、`fiscal_year_end,quarter,source_url`等を持つ手動CSVで予定を照合する。会社予測の対象期を根拠なく予定データへ確定コピーしない。確認済みの同一期に予測値が登録された企業は、画面の↻または再読み込みで未予測件数から除かれる。Vercelではファイルがビルドに同梱されるため、ローカル取り込みだけで本番件数は変わらない。

## APIと検査

`GET /api/earnings-calendar?mode=targets&date=YYYY-MM-DD`は件数・候補・除外理由のJSON。`&format=csv`でダウンロード。同じSupabase認証と`private, no-store`を使い、CSVは`nosniff`と固定形式のファイル名を付ける。既存のPL取得に入る前に返すため、CSV用の全社財務取得は行わない。純粋関数`extractForecastTargets`と`forecastTargetsCsv`は将来の一括処理からも再利用できる。

`npm test`に抽出・品質別判定・別期・日程変更・部分失敗・同日重複・企業同一性・暫定・英字/先頭ゼロ・数式対策・実データ1社/769社の検査を追加した。Pythonの既存取り込み検査も継続する。
