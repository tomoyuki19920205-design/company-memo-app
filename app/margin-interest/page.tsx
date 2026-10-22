"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import TopNavigation from "@/components/TopNavigation";
import { MARGIN_SECTORS, formatMarginOku, formatIndexClose, initialMarginPeriod, jpxCorrectionDifference, type MarginRow } from "@/lib/margin-interest";

type Result = { rows: MarginRow[]; latest: { date: string; updated_at: string } | null };

export default function MarginInterestPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [initial] = useState(initialMarginPeriod);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [result, setResult] = useState<Result>({ rows: [], latest: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  if (!authChecked) return <div className="margin-auth">認証中...</div>;
  if (!authenticated) return null;
  const detail = result.rows.find((row) => row.date === selected) ?? result.rows[0];
  const updated = result.latest?.updated_at
    ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(result.latest.updated_at))
    : "—";

  return <main className="margin-page">
    <header className="margin-page-header">
      <TopNavigation active="margin" />
      <div className="margin-heading">
        <div><h1>信用買い残</h1><p>東証全体・33業種の申込日別残高</p></div>
        <div className="margin-latest">最新の残高基準日 <strong>{result.latest?.date ?? "—"}</strong><span>更新 {updated} JST</span></div>
      </div>
    </header>

    <form className="margin-period" onSubmit={(event) => { event.preventDefault(); void load(from, to); }}>
      <label>開始日 <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>終了日 <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" disabled={loading}>{loading ? "読み込み中..." : "表示"}</button>
      <span>金額単位：億円</span>
    </form>
    {error && <p role="alert" className="margin-error">{error}</p>}
    {!loading && !error && result.rows.length === 0 && <p className="margin-empty">指定期間の確定済みデータはありません。</p>}

    <div className="margin-table-scroll" role="region" aria-label="信用買い残一覧" tabIndex={0}>
      <table className="margin-table">
        <thead>
          <tr>
            <th rowSpan={2} className="margin-date-heading">日付</th>
            <th rowSpan={2}>TOPIX<br />終値</th>
            <th rowSpan={2}>日経平均<br />終値</th>
            <th rowSpan={2}>全体売り残<br />（金額）</th>
            <th rowSpan={2}>全体買い残<br />（金額）</th>
            <th colSpan={MARGIN_SECTORS.length} className="margin-group-heading">各業種の信用買い残（金額）</th>
          </tr>
          <tr>{MARGIN_SECTORS.map((sector) => <th key={sector.code} scope="col">{sector.name}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((row) => <tr key={row.date} className={selected === row.date ? "selected" : ""}>
            <th scope="row"><button type="button" title="分類内訳を表示" onClick={() => setSelected(row.date)}>{row.date}{jpxCorrectionDifference(row) ? " ⚠" : ""}</button></th>
            <td>{formatIndexClose(row.topix_close)}</td>
            <td>{formatIndexClose(row.nikkei_close)}</td>
            <td>{formatMarginOku(row.short_value_yen)}</td>
            <td>{formatMarginOku(row.long_value_yen)}</td>
            {MARGIN_SECTORS.map(({ code }) => <td key={code}>{formatMarginOku(row.sector_long_yen?.[code] ?? "0")}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    {detail && <p className="margin-note">
      {detail.date} の分類：33業種以外 {formatMarginOku(detail.outside_long_yen)} 億円（{detail.outside_count.toLocaleString("ja-JP")}件）、
      業種未判明 {formatMarginOku(detail.unknown_long_yen)} 億円（{detail.unknown_count.toLocaleString("ja-JP")}件）。
      集計銘柄 {detail.row_count.toLocaleString("ja-JP")}件。欠損値は「—」で表示。
    </p>}
    {detail && jpxCorrectionDifference(detail) && <p className="margin-warning" role="note">
      {detail.date} はJPX訂正版の総合計と差があります。差額（JPX訂正版 − J-Quants）：
      買い残 {formatMarginOku(String(jpxCorrectionDifference(detail)!.long))} 億円、
      売り残 {formatMarginOku(String(jpxCorrectionDifference(detail)!.short))} 億円。
      <a href={jpxCorrectionDifference(detail)!.url} target="_blank" rel="noopener noreferrer">JPX訂正版PDF</a>
    </p>}
  </main>;
}
