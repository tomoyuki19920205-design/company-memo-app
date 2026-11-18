param(
    [Parameter(Mandatory=$true)][string]$From,
    [Parameter(Mandatory=$true)][string]$To,
    [Parameter(Mandatory=$true)][string]$Cache,
    [Parameter(Mandatory=$true)][string]$ViewerMaster,
    [string]$PythonExe = 'python',
    [string]$Store = (Join-Path $PSScriptRoot '../server-data/earnings-calendar'),
    [string]$Report = (Join-Path $PSScriptRoot '../../company-viewer-calendar-schedule-validation'),
    [string[]]$Manual = @(),
    [string[]]$MasterUpdates = @(),
    [switch]$SkipFetch,
    [switch]$Refresh
)
$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
if (-not $SkipFetch) {
    $fetchArgs = @((Join-Path $PSScriptRoot 'collect-tse-schedules.py'), '--cache', $Cache)
    if ($Refresh) { $fetchArgs += '--refresh' }
    & $PythonExe @fetchArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Warning '取得に失敗した企業があります。キャッシュ済みデータは保全し、未取得・失敗として集計します。'
    }
}
$importArgs = @((Join-Path $PSScriptRoot 'update-earnings-schedules.py'), '--cache', $Cache,
    '--from', $From, '--to', $To, '--viewer-master', $ViewerMaster, '--store', $Store, '--report', $Report)
foreach ($file in $Manual) { $importArgs += @('--manual', $file) }
foreach ($file in $MasterUpdates) { $importArgs += @('--master-updates', $file) }
& $PythonExe @importArgs
if ($LASTEXITCODE -ne 0) { throw 'カレンダー取り込みに失敗しました。既存レジストリとエラーを確認してください。' }
Write-Output "ローカル更新完了: $Store"
Write-Output "取り込み差分・未確認一覧: $Report"
Write-Output 'このコマンドは本番DB・Git main・Vercel・定期タスクを更新しません。'
