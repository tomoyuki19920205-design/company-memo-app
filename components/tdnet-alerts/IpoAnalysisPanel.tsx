"use client";

import React from "react";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import SectorReportMarkdown from "@/components/SectorReportMarkdown";
import { fetchIpoAnalysisReport } from "@/lib/tdnet-alerts/queries";
import type { IpoAnalysisReport } from "@/lib/tdnet-alerts/types";

export default function IpoAnalysisPanel({ eventId, supabase }: { eventId: string; supabase: SupabaseClient }) {
  const [report, setReport] = useState<IpoAnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetchIpoAnalysisReport(supabase, eventId)
      .then(value => { if (active) setReport(value); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, supabase]);

  const copyReport = async () => {
    if (!report?.report_markdown) return;
    await navigator.clipboard.writeText(report.report_markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadReport = () => {
    if (!report?.report_markdown) return;
    const blob = new Blob([report.report_markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.ticker}-ipo-analysis.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="ipo-analysis-section" aria-label="IPO分析">
    <div className="ipo-analysis-header">
      <div>
        <h3>IPO分析</h3>
        {loading ? <span className="ipo-analysis-status collecting">読み込み中</span>
          : error ? <span className="ipo-analysis-status failed">取得失敗</span>
          : !report ? <span className="ipo-analysis-status pending">IPO分析を作成待ち</span>
          : null}
      </div>
      {report?.report_markdown ? <div className="ipo-analysis-actions">
        <button type="button" onClick={copyReport}>{copied ? "コピー済み" : "全文コピー"}</button>
        <button type="button" onClick={downloadReport}>Markdown</button>
      </div> : null}
    </div>
    {report ? <>
      {report.report_markdown
        ? <SectorReportMarkdown markdown={report.report_markdown} reportType="ipo_analysis" />
        : <p className="ipo-analysis-empty">レポート本文を準備しています。</p>}
    </> : !loading && !error ? <p className="ipo-analysis-empty">IPO分析を作成待ちです。</p> : null}
  </section>;
}
