"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import TopNavigation from "@/components/TopNavigation";
import MarginSectorCharts from "@/components/MarginSectorCharts";
import { MARGIN_SECTORS, buildMarginViewRows, formatMarginOku, formatMarginRatio, formatIndexClose,
  indexDirection, initialMarginPeriod, jpxCorrectionDifference, marginRatioDirection,
  type MarginDirection, type MarginFrequency, type MarginIndexBars, type MarginRow, type MarginViewRow } from "@/lib/margin-interest";

type Result = { rows: MarginRow[]; indexBars: MarginIndexBars; weeklyBars: MarginIndexBars; calendarDays: string[];
  latest: { date: string; updated_at: string } | null };

function RatioCell({ value, direction, comparisonDate }: {
  value: string; direction: MarginDirection; comparisonDate: string | null;
}) {
  return <td className="margin-ratio-value">{value}{direction && comparisonDate && <span
    className={`margin-arrow ${direction}`} title={`比較対象：${comparisonDate}`}
    aria-label={`${direction === "up" ? "上昇" : "下落"}。比較対象：${comparisonDate}`}>
    {direction === "up" ? "↑" : "↓"}
  </span>}</td>;
}

function DateCell({ item, selected, select }: {
  item: MarginViewRow; selected: string | null; select: (date: string) => void;
}) {
  return <th scope="row">{item.row ? <button type="button" title="分類内訳を表示"
    aria-current={selected === item.date ? "date" : undefined}
    onClick={() => select(item.date)}>{item.date}{jpxCorrectionDifference(item.row) ? " ⚠" : ""}</button>
    : item.date}
    {item.provisional && <span className="margin-week-status provisional">暫定</span>}
    {item.missing && <span className="margin-week-status missing" title="その週の最終営業日の信用残データが欠損しています">欠損</span>}
  </th>;
}

export default function MarginInterestPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [initial] = useState(initialMarginPeriod);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);
  const [result, setResult] = useState<Result>({ rows: [], indexBars: {}, weeklyBars: {}, calendarDays: [], latest: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratioMode, setRatioMode] = useState(false);
  const [chartMode, setChartMode] = useState(false);
  const [frequency, setFrequency] = useState<MarginFrequency>("daily");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setAuthenticated(true);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) router.replace("/login");
      else setAuthenticated(true);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const load = useCallback(async (start: string, end: string) => {
    if (!start || !end || start > end) {
      setError("期間を確認してください");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/margin-interest?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "取得に失敗しました");
      setResult(body as Result);
      setApplied({ from: start, to: end });
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authenticated) void load(initial.from, initial.to);
  }, [authenticated, initial, load]);

  const viewRows = useMemo(() => buildMarginViewRows(
    result.rows, result.calendarDays, applied.from, applied.to, frequency, result.latest?.date ?? null,
  ), [result, applied, frequency]);

  if (!authChecked) return <div className="margin-auth">認証中...</div>;
  if (!authenticated) return null;
  const detail = viewRows.find((item) => item.date === selected && item.row)?.row
    ?? viewRows.find((item) => item.row)?.row;
  const updated = result.latest?.updated_at
    ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(result.latest.updated_at))
    : "—";

  return <main className="margin-page">
    <header className="margin-page-header">
      <TopNavigation active="margin" />
      <div className="margin-heading">
        <div><h1>信用買い残</h1><p>東証全体・33業種の残高基準日別データ</p></div>
        <div className="margin-latest">最新の残高基準日 <strong>{result.latest?.date ?? "—"}</strong><span>更新 {updated} JST</span></div>
      </div>
    </header>

    <form className="margin-period" onSubmit={(event) => { event.preventDefault(); void load(from, to); }}>
      <label>開始日 <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>終了日 <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" disabled={loading}>{loading ? "読み込み中..." : "表示"}</button>
      <button type="button" className={`margin-frequency-button${frequency === "daily" ? " active" : ""}`}
        aria-pressed={frequency === "daily"} onClick={() => setFrequency("daily")}>日次</button>
      <button type="button" className={`margin-frequency-button${frequency === "weekly" ? " active" : ""}`}
        aria-pressed={frequency === "weekly"} onClick={() => setFrequency("weekly")}>週次</button>
      <button type="button" className={`margin-ratio-button${ratioMode && !chartMode ? " active" : ""}`}
        aria-pressed={ratioMode && !chartMode} onClick={() => {
          if (chartMode) { setChartMode(false); setRatioMode(true); }
          else setRatioMode((current) => !current);
        }}>レシオ</button>
      <button type="button" className={`margin-chart-button${chartMode ? " active" : ""}`}
        aria-pressed={chartMode} onClick={() => setChartMode((current) => !current)}>チャート</button>
      <span>{chartMode ? "左軸：指数（pt）／右軸：信用買い残（億円）"
        : ratioMode ? "単位：億円／pt" : "金額単位：億円"}</span>
    </form>
    {frequency === "weekly" && <p className="margin-week-explanation">週次は月曜〜日曜の最終営業日の残高基準日を表示します。最新の未確定週は取得済みの最新日を「暫定」、過去週の最終営業日が未保存なら「欠損」と表示します。週内の合計・平均は行いません。</p>}
    {frequency === "weekly" && viewRows.some((item) => item.row?.money_reason) &&
      <p className="margin-week-explanation">2026年9月25日より前のJ-Quants銘柄別信用残には金額がありません。業種別の金額・レシオは「—」、市場全体の金額はJPXの東京・名古屋合計から名証の名古屋分を引いた東京市場分（百万円単位）です。保存済みの業種別株数は下の週次株数表に表示します。指数の週足は週内の日足四本値から作成しています。</p>}
    {ratioMode && !chartMode && <p className="margin-ratio-explanation">レシオ＝保存済みの信用買い残金額（円）÷同じ残高基準日の指数終値（pt）÷1億。市場全体はTOPIX、各業種は対応する東証33業種別株価指数で計算し、億円／ptで小数点以下4桁まで表示します。指数・金額が欠損、または指数が0以下の場合は「—」を表示します。</p>}
    {chartMode && <p className="margin-chart-explanation">市場全体のTOPIXと東証33業種の株価指数（始値・高値・安値・終値）に、同じ残高基準日の信用買い残金額を重ねて表示します。週足は週内の最初の始値・最高値・最安値・最後の終値、買い残は週末時点の残高です。欠損は補完しません。買い残の縦軸は表示期間に合わせて自動調整します。</p>}
    {error && <p role="alert" className="margin-error">{error}</p>}
    {!loading && !error && viewRows.length === 0 && <p className="margin-empty">指定期間の保存済みデータはありません。</p>}

    {chartMode ? <MarginSectorCharts viewRows={viewRows} calendarDays={result.calendarDays}
      indexBars={result.indexBars} weeklyBars={result.weeklyBars} frequency={frequency} /> : <div className="margin-table-scroll" role="region" aria-label="信用買い残一覧" tabIndex={0}>
      <table className={`margin-table${ratioMode ? " margin-ratio-table" : ""}`}>
        {ratioMode ? <thead><tr>
          <th scope="col" className="margin-date-heading">日付</th>
          <th scope="col">市場全体<br />買い残金額／TOPIX<br />（億円／pt）</th>
          <th scope="col">TOPIX終値<br />（pt）</th>
          {MARGIN_SECTORS.flatMap((sector) => [
            <th key={`${sector.code}-ratio`} scope="col">{sector.name}<br />買い残金額／同業種指数<br />（億円／pt）</th>,
            <th key={`${sector.code}-index`} scope="col">{sector.name}<br />指数終値（pt）</th>,
          ])}
        </tr></thead> : <thead>
          <tr>
            <th rowSpan={2} className="margin-date-heading">日付</th>
            <th rowSpan={2}>TOPIX<br />終値</th>
            <th rowSpan={2}>日経平均<br />終値</th>
            <th rowSpan={2}>全体売り残<br />（金額）</th>
            <th rowSpan={2}>全体買い残<br />（金額）</th>
            <th colSpan={MARGIN_SECTORS.length} className="margin-group-heading">各業種の信用買い残（金額）</th>
          </tr>
          <tr>{MARGIN_SECTORS.map((sector) => <th key={sector.code} scope="col">{sector.name}</th>)}</tr>
        </thead>}
        {ratioMode ? <tbody>
          {viewRows.map((item) => <tr key={item.date} className={selected === item.date ? "selected" : ""}>
            <DateCell item={item} selected={selected} select={setSelected} />
            <RatioCell value={formatMarginRatio(item.row?.long_value_yen, item.row?.topix_close)}
              direction={marginRatioDirection(item.row?.long_value_yen, item.row?.topix_close,
                item.comparisonRow?.long_value_yen, item.comparisonRow?.topix_close)}
              comparisonDate={item.comparisonDate} />
            <RatioCell value={formatIndexClose(item.row?.topix_close)}
              direction={indexDirection(item.row?.topix_close, item.comparisonRow?.topix_close)}
              comparisonDate={item.comparisonDate} />
            {MARGIN_SECTORS.flatMap(({ code, indexCode }) => [
              <RatioCell key={`${code}-ratio`}
                value={formatMarginRatio(item.row?.sector_long_yen?.[code], item.row?.sector_index_close?.[indexCode])}
                direction={marginRatioDirection(item.row?.sector_long_yen?.[code], item.row?.sector_index_close?.[indexCode],
                  item.comparisonRow?.sector_long_yen?.[code], item.comparisonRow?.sector_index_close?.[indexCode])}
                comparisonDate={item.comparisonDate} />,
              <RatioCell key={`${code}-index`} value={formatIndexClose(item.row?.sector_index_close?.[indexCode])}
                direction={indexDirection(item.row?.sector_index_close?.[indexCode], item.comparisonRow?.sector_index_close?.[indexCode])}
                comparisonDate={item.comparisonDate} />,
            ])}
          </tr>)}
        </tbody> : <tbody>
          {viewRows.map((item) => <tr key={item.date} className={selected === item.date ? "selected" : ""}>
            <DateCell item={item} selected={selected} select={setSelected} />
            <td>{formatIndexClose(item.row?.topix_close)}</td>
            <td>{formatIndexClose(item.row?.nikkei_close)}</td>
            <td>{formatMarginOku(item.row?.short_value_yen)}</td>
            <td>{formatMarginOku(item.row?.long_value_yen)}</td>
            {MARGIN_SECTORS.map(({ code }) => <td key={code}>{formatMarginOku(item.row?.sector_long_yen?.[code])}</td>)}
          </tr>)}
        </tbody>}
      </table>
    </div>}
    {frequency === "weekly" && !chartMode && viewRows.some((item) => item.row?.sector_long_volume) && <section className="margin-weekly-volume">
      <h2>週次の買い残株数</h2>
      <p>各週の最終営業日時点の残高です。金額には換算していません。単位：株</p>
      <div className="margin-table-scroll" role="region" aria-label="週次の業種別買い残株数" tabIndex={0}>
        <table className="margin-table"><thead><tr><th scope="col" className="margin-date-heading">日付</th>
          <th scope="col">市場全体</th>{MARGIN_SECTORS.map((sector) =>
            <th scope="col" key={sector.code}>{sector.name}</th>)}</tr></thead>
          <tbody>{viewRows.map((item) => <tr key={item.date}><th scope="row">{item.date}{item.provisional ? " 暫定" : ""}</th>
            <td>{item.row?.long_volume === undefined ? "—" : Number(item.row.long_volume).toLocaleString("ja-JP")}</td>
            {MARGIN_SECTORS.map(({ code }) => <td key={code}>{item.row?.sector_long_volume?.[code] === undefined ? "—" : Number(item.row.sector_long_volume[code]).toLocaleString("ja-JP")}</td>)}
          </tr>)}</tbody></table>
      </div>
    </section>}
    {detail && <p className="margin-note">
      {detail.date} の分類：33業種以外 {formatMarginOku(detail.outside_long_yen)} 億円（{detail.outside_count.toLocaleString("ja-JP")}件）、
      業種未判明 {formatMarginOku(detail.unknown_long_yen)} 億円（{detail.unknown_count.toLocaleString("ja-JP")}件）。
      集計銘柄 {detail.row_count.toLocaleString("ja-JP")}件。欠損値は「—」で表示。
      {detail.money_reason && ` ${detail.money_reason}。`}
      {detail.market_source_jpx_url && detail.market_source_nse_url && <> 市場全体金額の出典：
        <a href={detail.market_source_jpx_url} target="_blank" rel="noopener noreferrer">JPX二市場合計</a>・
        <a href={detail.market_source_nse_url} target="_blank" rel="noopener noreferrer">名証名古屋分</a>。
        東京市場分は百万円単位の公表値の差から計算。</>}
    </p>}
    {detail && jpxCorrectionDifference(detail) && <p className="margin-warning" role="note">
      {detail.date} はJPX訂正版の総合計と差があります。差額（JPX訂正版 − J-Quants）：
      買い残 {formatMarginOku(String(jpxCorrectionDifference(detail)!.long))} 億円、
      売り残 {formatMarginOku(String(jpxCorrectionDifference(detail)!.short))} 億円。
      <a href={jpxCorrectionDifference(detail)!.url} target="_blank" rel="noopener noreferrer">JPX訂正版PDF</a>
    </p>}
  </main>;
}
