"use client";
import React from "react";
import type { TdnetEvent } from "@/lib/tdnet-alerts/types";
import { getForecastReason } from "@/lib/tdnet-alerts/forecast-reason";

export default function ForecastReason({ event }: { event: TdnetEvent }) {
  const { url, sections, status } = getForecastReason(event);
  const fallback = {
    not_present: "原本PDFに業績修正理由の記載はありません",
    source_unavailable: url ? "原本PDFを取得できていません" : "原本PDFを特定・取得できていません",
    extraction_failed: "原本PDFから修正理由を抽出できませんでした",
    scope_unverified: "原本PDFの修正理由の範囲を確認中です",
    environment_error: "PDF読み取り環境に異常があります",
    unavailable: "修正理由を取得できませんでした",
    available: "修正理由を取得できませんでした",
  }[status];
  return <section className="forecast-reason" aria-label="業績修正の理由"
    onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    <h4>業績修正の理由</h4>
    {sections.length ? sections.map((section, index) => <div className="forecast-reason-section" key={index}>
      {section.context.length > 0 && <div className="forecast-reason-context">{section.context.join("\n")}</div>}
      <h5>{section.heading}</h5>
      <div className="forecast-reason-text">{section.text}</div>
      <a href={`${url}#page=${section.page_start}`} target="_blank" rel="noopener noreferrer">
        原本PDF（{section.page_start === section.page_end ? `${section.page_start}ページ` : `${section.page_start}–${section.page_end}ページ`}）
      </a>
    </div>) : <>
      <p>{fallback}</p>
      {url && <a href={url} target="_blank" rel="noopener noreferrer">原本PDF</a>}
    </>}
  </section>;
}
