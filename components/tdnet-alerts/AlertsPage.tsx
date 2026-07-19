"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { fetchEvents, markAsRead, markAsUnread, toggleStar } from "@/lib/tdnet-alerts/queries";
import { useRealtimeAlerts } from "@/lib/tdnet-alerts/realtime";
import { audioManager } from "@/lib/tdnet-alerts/audio";
import type { EnrichedEvent, TdnetEvent, FilterType } from "@/lib/tdnet-alerts/types";
import { EVENT_TYPE_CONFIG, EVENT_SUBTYPE_LABELS, getDisplayCategory } from "@/lib/tdnet-alerts/types";
import AlertDetailPanel from "./AlertDetailPanel";
import CompanyViewer, { type CompanyViewerHandle } from "@/components/CompanyViewer";

type AlertsCacheEntry = {
  timestamp: number;
  events: EnrichedEvent[];
};
const ALERTS_CACHE_TTL_MS = 30_000;
const LEFT_PANE_DEFAULT_WIDTH = 400;
const LEFT_PANE_MIN_WIDTH = 0;

const YOY_REGEX = /((?:YOY|前年比|sales_yoy|operating_profit_yoy)\s*:?\s*[+-]?[\d.]+%|(?:営業利益|経常利益|純利益)\s*[+-]?[\d.]+%|赤字継続|黒転|赤転)/gi;

const getYoyClass = (text: string) => {
  // 営業利益ターンアラウンドラベルの色分け
  if (text === "赤字継続") return "yoy-negative";
  if (text === "黒転")   return "yoy-positive";
  if (text === "赤転")   return "yoy-negative";
  const match = text.match(/([+-]?[\d.]+)%/);
  if (match) {
    const val = parseFloat(match[1]);
    if (val < 0) return "yoy-negative";
    if (val >= 30) return "yoy-positive-strong";
    return "yoy-positive";
  }
  return "yoy-negative"; // fallback
};

const processLines = (str: string) => str.split("\n").map((line, j, arr) => (
  <React.Fragment key={j}>
    {line}
    {j < arr.length - 1 && <br />}
  </React.Fragment>
));

const renderHighlightedCardBody = (text: string, event: EnrichedEvent) => {
  if (!text) return null;
  const cacheKey = `${event.id}:${text}:v2`;
  if (highlightCache.has(cacheKey)) return highlightCache.get(cacheKey);

  const applyRegex = (
    nodes: React.ReactNode[],
    regex: RegExp,
    mapper: (matchStr: string) => React.ReactNode
  ): React.ReactNode[] => {
    const nextNodes: React.ReactNode[] = [];
    nodes.forEach((node) => {
      if (typeof node === "string") {
        const parts = node.split(regex);
        parts.forEach((part) => {
          if (part.match(regex)) {
            nextNodes.push(mapper(part));
          } else if (part) {
            nextNodes.push(part);
          }
        });
      } else {
        nextNodes.push(node);
      }
    });
    return nextNodes;
  };

  let nodes: React.ReactNode[] = [text];

  const EPS_REGEX = /(EPS\s*[:：]?\s*[\d,.]+(?:円|銭)\s*[→＞]\s*[\d,.]+(?:円|銭)(?:\([+-][\d.]+\%\))?)/i;
  nodes = applyRegex(nodes, EPS_REGEX, (part) => {
    const match = part.match(/EPS\s*[:：]?\s*([\d,.]+)(?:円|銭)\s*[→＞]\s*([\d,.]+)(?:円|銭)/i);
    if (match) {
      const prev = parseFloat(match[1].replace(/,/g, ""));
      const rev = parseFloat(match[2].replace(/,/g, ""));
      if (!isNaN(prev) && !isNaN(rev) && prev > 0 && rev > prev && (rev - prev) / prev >= 0.1) {
        return <span className="yoy-positive">{processLines(part)}</span>;
      }
    }
    return part;
  });

  const DIV_REGEX = /((?:増配|配当|DPS|期末配当|中間配当|記念配当|特別配当)\s*[:：]?\s*[\d,.]+(?:円|銭)\s*[→＞]\s*[\d,.]+(?:円|銭)(?:\([+-][\d.]+\%\))?)/i;
  nodes = applyRegex(nodes, DIV_REGEX, (part) => {
    const match = part.match(/(?:増配|配当|DPS|期末配当|中間配当|記念配当|特別配当)\s*[:：]?\s*([\d,.]+)(?:円|銭)\s*[→＞]\s*([\d,.]+)(?:円|銭)/i);
    if (match) {
      const prev = parseFloat(match[1].replace(/,/g, ""));
      const rev = parseFloat(match[2].replace(/,/g, ""));
      if (!isNaN(prev) && !isNaN(rev) && prev > 0 && rev > prev && (rev - prev) / prev >= 0.2) {
        return <span className="yoy-positive">{processLines(part)}</span>;
      }
    }
    return part;
  });

  nodes = applyRegex(nodes, YOY_REGEX, (part) => {
    return <span className={getYoyClass(part)}>{processLines(part)}</span>;
  });

  const BB_KEYWORD_REGEX = /(?:自社株買い|自己株式|取得枠|取得決議|BB|割合)/i;
  if (BB_KEYWORD_REGEX.test(text)) {
    const BB_PCT_REGEX = /([\d.]+%)/;
    nodes = applyRegex(nodes, BB_PCT_REGEX, (part) => {
      const val = parseFloat(part);
      if (!isNaN(val) && val >= 4) {
        const className = val >= 6 ? "yoy-positive-strong" : "yoy-positive";
        return <span className={className}>{processLines(part)}</span>;
      }
      return part;
    });
  }

  const result = (
    <>
      {nodes.map((node, i) => {
        if (typeof node === "string") {
          return <React.Fragment key={i}>{processLines(node)}</React.Fragment>;
        }
        return <React.Fragment key={i}>{node}</React.Fragment>;
      })}
    </>
  );

  highlightCache.set(cacheKey, result);
  return result;
};


interface AlertsPageProps {
  userId: string;
  userEmail: string;
}

export const isEdinetOrderEvent = (eventType: string) => {
  return eventType === "edinet_order" || eventType === "edinet_order_partial";
};

const getBadgeConfig = (eventType: string, headline?: string) => {
  if (isEdinetOrderEvent(eventType)) {
    return { ...(EVENT_TYPE_CONFIG["edinet_order"] || { label: "受注・受注残", emoji: "📦", color: "#14b8a6" }), category: "edinet_order" };
  }
  const cat = getDisplayCategory(eventType, headline);
  const config = EVENT_TYPE_CONFIG[cat] || { label: "その他", emoji: "📄", color: "#94a3b8" };
  return { ...config, category: cat };
};

const getStrengthDisplay = (event: EnrichedEvent) => {
  if (event.primary_metric_value) {
    const yoy = event.primary_metric_yoy || "";
    return { value: event.primary_metric_value, yoy };
  }
  if (event.strength_score != null) {
    return { value: `${event.strength_score.toFixed(0)}`, yoy: "" };
  }
  return { value: "", yoy: "" };
};

const getPriorityClass = (rank: number) => {
  if (rank <= 10) return "priority-high";
  if (rank <= 30) return "priority-medium";
  return "";
};

const summaryCache = new Map<string, { line1: string; line2: string; line3?: string }>();
const bodyCache = new Map<string, { text: string; isFallback: boolean }>();
const highlightCache = new Map<string, React.ReactNode>();

// 全タブ共通カード本文フォーマッタ: raw_payload の数値を整形して表示
// 長い headline / formatted_message は使わない
const formatCardBody = (event: EnrichedEvent): { 
  text: string; 
  isFallback: boolean;
  primaryText?: string;
  summaryText?: string;
  compareText?: string;
} => {
  if (bodyCache.has(event.id)) return bodyCache.get(event.id) as any;
  const rawVal = event.raw_payload;
  const rp: Record<string, unknown> | null =
    typeof rawVal === "string"
      ? (() => {
          try {
            return JSON.parse(rawVal) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : (rawVal as Record<string, unknown> | null) ?? null;

  const ext = (
    rp && typeof rp === "object" && rp.extracted && typeof rp.extracted === "object"
      ? rp.extracted
      : {}
  ) as Record<string, unknown>;

  const fmtPct = (v: unknown): string => {
    const n = Number(v);
    if (isNaN(n)) return "?%";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  };
  const fmtBillion = (v: unknown): string => {
    const n = Number(v);
    if (isNaN(n)) return "---";
    if (Math.abs(n) >= 100) return `${(n / 100).toFixed(1)}億円`;
    return `${n.toFixed(0)}百万円`;
  };
  const fmtShares = (v: unknown): string => {
    const n = Number(v);
    if (isNaN(n)) return "---";
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万株`;
    return `${n.toLocaleString()}株`;
  };
  const fmtDiv = (v: unknown): string => {
    const n = Number(v);
    if (isNaN(n)) return "---";
    return n === Math.floor(n) ? `${Math.floor(n)}円` : `${n}円`;
  };

  const lines: string[] = [];
  let primaryText: string | undefined;
  let summaryText: string | undefined;
  let compareText: string | undefined;

  if (event.event_type === "forecast") {
    const typeEmoji = event.event_subtype === "upward" ? "🔺 上方修正"
      : event.event_subtype === "difference" ? "📋 差異開示"
      : event.event_subtype === "downward" ? "🔻 下方修正"
      : "📊 業績修正";
    const opPct  = ext.change_op_pct;
    const ordPct = ext.change_ordinary_pct;
    const netPct = ext.change_net_income_pct;
    const summaryPct = opPct ?? ordPct ?? netPct;
    const summaryPctLabel = opPct != null ? "営業利益"
      : ordPct != null ? "経常利益"
      : netPct != null ? "純利益"
      : null;
    const summaryStr = summaryPctLabel != null
      ? `${summaryPctLabel} ${fmtPct(summaryPct)}`
      : "";
    lines.push(summaryStr ? `${typeEmoji}  ${summaryStr}` : typeEmoji);

    const metrics: string[] = [];
    if (opPct  != null) metrics.push(`営業利益 ${fmtPct(opPct)}`);
    if (ordPct != null) metrics.push(`経常利益 ${fmtPct(ordPct)}`);
    if (netPct != null) metrics.push(`純利益 ${fmtPct(netPct)}`);
    if (metrics.length > 1) lines.push(metrics.join("  "));
    const epsPrev = ext.previous_eps;
    const epsRev  = ext.revised_eps;
    if (epsPrev != null && epsRev != null) {
      const p = Number(epsPrev), r = Number(epsRev);
      if (!isNaN(p) && !isNaN(r) && Math.abs(p) <= 10000 && Math.abs(r) <= 10000) {
        const ePct = p !== 0 ? (r - p) / Math.abs(p) * 100 : null;
        lines.push(`EPS: ${fmtDiv(p)}→${fmtDiv(r)}${ePct !== null ? `(${fmtPct(ePct)})` : ""}`);
      }
    }
    const periodLabel = ext.period_label;
    if (periodLabel) lines.push(String(periodLabel));

  } else if (event.event_type === "buyback") {
    const typeLabel = event.event_subtype === "tostnet"
      ? "📊 自社株買い（ToSTNeT）"
      : "📊 自社株買い（取得枠決議）";
    const ratio = ext.ratio_to_outstanding;
    const ratioStr = ratio != null ? `${Number(ratio).toFixed(2)}%` : "";
    lines.push(ratioStr ? `${typeLabel}  ${ratioStr}` : typeLabel);

    const shares = ext.shares_limit;
    const amount = ext.amount_limit_million_yen;
    const specs: string[] = [];
    if (ratio  != null) specs.push(`割合 ${Number(ratio).toFixed(2)}%`);
    if (shares != null) specs.push(`株数 ${fmtShares(shares)}`);
    if (amount != null) specs.push(`金額 ${fmtBillion(amount)}`);
    if (specs.length > 0) lines.push(specs.join("  "));
    const start = ext.start_date;
    const end   = ext.end_date;
    if (event.event_subtype === "tostnet" && start) {
      lines.push(`買付日: ${String(start)}`);
    } else if (start && end) {
      lines.push(`取得期間: ${String(start)}〜${String(end)}`);
    } else if (start) {
      lines.push(`取得開始: ${String(start)}`);
    }

  } else if (event.event_type === "dividend") {
    const typeLabel = event.event_subtype === "increase" ? "💰 増配"
      : event.event_subtype === "decrease" ? "📉 減配"
      : "💰 配当修正";
    const prev = ext.previous_dividend_per_share;
    const rev  = ext.revised_dividend_per_share;
    let pctStr = "";
    let pv: number | null = null, rv: number | null = null;
    if (prev != null && rev != null) {
      pv = Number(prev); rv = Number(rev);
      if (!isNaN(pv) && !isNaN(rv) && pv !== 0) {
        pctStr = fmtPct((rv - pv) / Math.abs(pv) * 100);
      }
    }
    lines.push(pctStr ? `${typeLabel}  ${pctStr}` : typeLabel);

    if (rv != null && !isNaN(rv)) {
      if (pv !== null && !isNaN(pv) && pv !== 0) {
        lines.push(`配当: ${fmtDiv(pv)}→${fmtDiv(rv)}(${fmtPct((rv - pv) / Math.abs(pv) * 100)})`);
      } else {
        lines.push(`配当: ${fmtDiv(rv)}`);
      }
    }
    const period = ext.fiscal_period;
    if (period) lines.push(String(period));

  } else if (event.event_type === "earnings") {
    const primaryLines: string[] = [];
    if (event.event_subtype) primaryLines.push(event.event_subtype);
    
    if (event.primary_metric_name && event.primary_metric_value) {
      const yoy = event.primary_metric_yoy
        ? `（YOY ${event.primary_metric_yoy}）`
        : "";
      primaryLines.push(`${event.primary_metric_name} ${event.primary_metric_value}${yoy}`);
    }
    primaryText = primaryLines.filter(s => s.trim()).join("\n");

    const comp = rp?.notification_compare_json as any;
    if (comp?.compare) {
      const cmp = comp.compare;
      const cmpOpStatus = cmp.op_yoy_status;
      if (cmp.sales_yoy != null || cmp.op_yoy != null || cmpOpStatus) {
        const cmpSales = cmp.sales_yoy != null ? fmtPct(cmp.sales_yoy * 100) : "-";
        
        let cmpOpStr = "YOY-";
        if (cmp.op_yoy != null) {
          cmpOpStr = `YOY${fmtPct(cmp.op_yoy * 100)}`;
        } else if (cmpOpStatus) {
          const statusMap: Record<string, string> = {
            "turnaround_to_profit": "黒字転換",
            "fall_into_red": "赤字転落",
            "loss_reduction": "赤字縮小",
            "loss_expansion": "赤字拡大"
          };
          if (statusMap[cmpOpStatus]) cmpOpStr = statusMap[cmpOpStatus];
        }
        
        compareText = `${cmp.label || ""} 売上(YOY${cmpSales}) 営利(${cmpOpStr})`;
      }
    }

    if (event.display_summary?.trim()) {
      summaryText = event.display_summary.trim();
    }
    
    console.log("[AlertsPage Debug 3816]", {
      ticker: event.ticker,
      primaryText,
      compareText,
      summaryText
    });

    // For text output fallback
    if (primaryText) lines.push(primaryText);
    if (compareText) lines.push(compareText);
    if (summaryText) lines.push(summaryText);

  } else {
    if (event.event_subtype) lines.push(event.event_subtype);
    if (event.primary_metric_name && event.primary_metric_value) {
      const yoy = event.primary_metric_yoy
        ? `（YOY ${event.primary_metric_yoy}）`
        : "";
      lines.push(`${event.primary_metric_name} ${event.primary_metric_value}${yoy}`);
    }
    if (event.display_summary?.trim()) {
      lines.push(event.display_summary.trim());
    }
  }

  const text = lines.filter((s) => s.trim()).join("\n");
  if (text) {
    const res = { text, isFallback: false, primaryText, summaryText, compareText };
    bodyCache.set(event.id, res as any);
    return res;
  }
  const fallbackRes = { text: (event.headline || "").trim(), isFallback: true };
  bodyCache.set(event.id, fallbackRes);
  return fallbackRes;
};

/**
 * 営業利益のターンアラウンドラベルを返す。
 * 赤字が絡む場合は「赤字継続」「黒転」「赤転」を返す。
 * 両方とも黒字の場合は null を返し、呼び出し元で従来のYOY表示を使う。
 * @param profitBase  比較元の営業利益実数 (前年実績 or 当年実績)
 * @param profitTarget 比較先の営業利益実数 (当年実績 or 来期予想)
 */
const getOpTurnaroundLabel = (
  profitBase: number | null | undefined,
  profitTarget: number | null | undefined
): "赤字継続" | "黒転" | "赤転" | null => {
  if (profitBase == null || isNaN(Number(profitBase))) return null;
  if (profitTarget == null || isNaN(Number(profitTarget))) return null;
  const base   = Number(profitBase);
  const target = Number(profitTarget);
  if (base < 0 && target < 0)  return "赤字継続";
  if (base < 0 && target >= 0) return "黒転";
  if (base >= 0 && target < 0) return "赤転";
  return null; // 両方黒字: 通常YOY表示
};

const formatCardSummary = (event: EnrichedEvent, badge: ReturnType<typeof getBadgeConfig>, subtypeLabel: string) => {
  if (summaryCache.has(event.id)) return summaryCache.get(event.id)!;
  const rawVal = event.raw_payload;
  const rp: Record<string, unknown> | null =
    typeof rawVal === "string"
      ? (() => {
          try { return JSON.parse(rawVal) as Record<string, unknown>; } catch { return null; }
        })()
      : (rawVal as Record<string, unknown> | null) ?? null;
  const ext = (rp && typeof rp === "object" && rp.extracted && typeof rp.extracted === "object" ? rp.extracted : {}) as Record<string, unknown>;
  
  const fmtPct = (v: unknown): string => {
    const n = Number(v);
    if (isNaN(n)) return "?%";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  };
  const fmtDiv = (v: unknown): string => {
    const n = Number(v);
    if (isNaN(n)) return "---";
    return n === Math.floor(n) ? `${Math.floor(n)}円` : `${n}円`;
  };

  const d = new Date(event.disclosed_at || event.detected_at);
  const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  
  const ticker = event.ticker;
  const name = event.company_name || "";
  
  let typeLabel = subtypeLabel;
  let line1 = "";
  let line2 = "";
  let line3: string | undefined = undefined;

  if (event.event_type === "earnings") {
    line1 = `${dateStr} ${timeStr} ${ticker} ${name} ${typeLabel} ${ext.period_label || ""}`.trim();
    
    const comp = rp?.notification_compare_json as any;

    let metric1 = "";
    let metric2 = "";
    
    const fm = event.formatted_message || event.display_summary || "";
    let fallbackSalesYoy: string | null = null;
    let fallbackOpYoy: string | null = null;
    if (fm) {
      const sMatch = fm.match(/売上.*?YOY\s*([+-]?[\d.]+%)/i);
      if (sMatch) fallbackSalesYoy = sMatch[1];
      const oMatch = fm.match(/(?:営業利益|営利).*?YOY\s*([+-]?[\d.]+%)/i);
      if (oMatch) fallbackOpYoy = oMatch[1];
    }
    
    const currSalesVal = comp?.current?.sales_yoy ?? ext.sales_yoy;
    let currSalesStr = "-";
    if (currSalesVal != null) {
      currSalesStr = fmtPct(Number(currSalesVal) * 100);
    } else if (fallbackSalesYoy) {
      currSalesStr = fallbackSalesYoy;
    }
    metric1 = `売上（YOY${currSalesStr}）`;
    
    const currOpVal = comp?.current?.op_yoy ?? ext.op_yoy;
    const opStatus = comp?.current?.op_yoy_status ?? ext.op_yoy_status;
    const statusMap: Record<string, string> = {
      "turnaround_to_profit": "黒字転換",
      "fall_into_red": "赤字転落",
      "loss_reduction": "赤字縮小",
      "loss_expansion": "赤字拡大"
    };

    // 営業利益 2行目表示 (前年実績 vs 当年実績)
    // op_current: 当年実績の実数。op_previous は DB にないため op_yoy と op_current から逆算する。
    // 逆算式: op_previous_est = op_current / (1 + op_yoy)  (op_yoy == -1 の場合は前年0=黒字扱い)
    if (currOpVal != null && ext.op_current != null) {
      const opCurrentNum = Number(ext.op_current);
      const opYoyNum = Number(currOpVal);
      let opPrevEst: number | null = null;
      if (!isNaN(opCurrentNum) && !isNaN(opYoyNum) && opYoyNum !== -1) {
        opPrevEst = opCurrentNum / (1 + opYoyNum);
      }
      const turnaround = getOpTurnaroundLabel(opPrevEst, opCurrentNum);
      if (turnaround !== null) {
        metric2 = `営利（${turnaround}）`;
      } else {
        const currOp = fmtPct(Number(currOpVal) * 100);
        metric2 = `営利（YOY${currOp}）`;
      }
    } else if (currOpVal != null) {
      const currOp = fmtPct(Number(currOpVal) * 100);
      metric2 = `営利（YOY${currOp}）`;
    } else if (fallbackOpYoy) {
      metric2 = `営利（YOY${fallbackOpYoy}）`;
    } else if (opStatus && statusMap[opStatus]) {
      metric2 = `営利（${statusMap[opStatus]}）`;
    } else if (ext.op_current != null || ext.op_yoy != null) {
      metric2 = `営利（YOY-）`;
    } else if (ext.ordinary_profit_current != null || ext.ordinary_profit_yoy != null) {
      const currOrd = ext.ordinary_profit_yoy != null ? fmtPct(Number(ext.ordinary_profit_yoy) * 100) : "-";
      metric2 = `経常（YOY${currOrd}）`;
    } else if (ext.net_income_current != null || ext.net_income_yoy != null) {
      const currNet = ext.net_income_yoy != null ? fmtPct(Number(ext.net_income_yoy) * 100) : "-";
      metric2 = `純利（YOY${currNet}）`;
    } else {
      metric2 = `営利（YOY-）`;
    }

    const currentLabel = event.event_subtype || (ext.quarter as string) || "";
    line2 = `${metric1} ${metric2} ${currentLabel}`.trim();


    if (comp?.compare) {
      const cmp = comp.compare;
      const cmpOpStatus = cmp.op_yoy_status;
      
      if (cmp.label || cmp.sales_yoy != null || cmp.op_yoy != null || cmpOpStatus) {
        const cmpSales = cmp.sales_yoy != null ? fmtPct(cmp.sales_yoy * 100) : "-";
        
        let cmpOpStr = "YOY-";

        // 3行目表示: 当年実績 vs 来期予想 (FY/4Q の場合のみ特別判定)
        // guidance.op_forecast がある場合、op_current との符号比較でターンアラウンドを判定する。
        const q = ext.quarter as string;
        const isForecastRow = (q === "FY" || q === "4Q");
        const opForecast = (ext as any).guidance?.op_forecast;
        const opCurrentForCmp = ext.op_current;

        if (isForecastRow && opForecast != null && opCurrentForCmp != null) {
          // 3行目: 当年実績 vs 来期予想 でターンアラウンド判定
          const turnaroundCmp = getOpTurnaroundLabel(Number(opCurrentForCmp), Number(opForecast));
          if (turnaroundCmp !== null) {
            cmpOpStr = turnaroundCmp;
          } else if (cmp.op_yoy != null) {
            cmpOpStr = `YOY${fmtPct(cmp.op_yoy * 100)}`;
          } else if (cmpOpStatus && statusMap[cmpOpStatus]) {
            cmpOpStr = statusMap[cmpOpStatus];
          }
        } else if (cmp.op_yoy != null) {
          cmpOpStr = `YOY${fmtPct(cmp.op_yoy * 100)}`;
        } else if (cmpOpStatus && statusMap[cmpOpStatus]) {
          cmpOpStr = statusMap[cmpOpStatus];
        }

        let compLabel = cmp.label || "";
        if (q === "1Q") compLabel = "通期予想";
        else if (q === "FY" || q === "4Q") compLabel = "来期FY予想";
        else if (q === "2Q" || q === "3Q") compLabel = "前Q";
        else compLabel = cmp.label || "前Q";
        
        line3 = `売上（YOY${cmpSales}） 営利（${cmpOpStr}） ${compLabel}`.trim();
      }
    }
  } else if (event.event_type === "forecast") {
    if (event.event_subtype === "upward") typeLabel = "上方";
    else if (event.event_subtype === "downward") typeLabel = "下方";
    else if (event.event_subtype === "difference") typeLabel = "差異";
    else typeLabel = "修正";
    
    line1 = `${dateStr} ${timeStr} ${ticker} ${name} ${typeLabel}`.trim();

    const epsPrev = ext.previous_eps;
    const epsRev  = ext.revised_eps;
    if (epsPrev != null && epsRev != null) {
      const p = Number(epsPrev), r = Number(epsRev);
      if (!isNaN(p) && !isNaN(r) && p !== 0) {
        const ePct = (r - p) / Math.abs(p) * 100;
        line2 = `EPS ${fmtDiv(p)}→${fmtDiv(r)}(${fmtPct(ePct)})`;
      }
    }
    if (!line2) {
      const opPct = ext.change_op_pct;
      if (opPct != null) line2 = `営業利益 ${fmtPct(opPct)}`;
      else if (ext.change_ordinary_pct != null) line2 = `経常利益 ${fmtPct(ext.change_ordinary_pct)}`;
      else if (ext.change_net_income_pct != null) line2 = `純利益 ${fmtPct(ext.change_net_income_pct)}`;
    }
  } else if (event.event_type === "buyback") {
    typeLabel = "BB";
    const ratio = ext.ratio_to_outstanding;
    const ratioStr = ratio != null ? `${Number(ratio).toFixed(2)}%` : "";
    line1 = `${dateStr} ${timeStr} ${ticker} ${name} ${typeLabel} ${ratioStr}`.trim();
  } else if (event.event_type === "dividend") {
    if (event.event_subtype === "increase") typeLabel = "増配";
    else typeLabel = "配当";
    
    const prev = ext.previous_dividend_per_share;
    const rev  = ext.revised_dividend_per_share;
    let divStr = "";
    if (prev != null && rev != null) {
       divStr = `${fmtDiv(prev)}→${fmtDiv(rev)}`;
    } else if (rev != null) {
       divStr = `${fmtDiv(rev)}`;
    }
    line1 = `${dateStr} ${timeStr} ${ticker} ${name} ${typeLabel} ${divStr}`.trim();
  } else if (isEdinetOrderEvent(event.event_type)) {
    typeLabel = "受注/有報";
    line1 = `${dateStr} ${timeStr} ${ticker} ${name} ${typeLabel} ${ext.quarter || ext.fiscal_year || ""}`.trim();
    
    let metrics = [];
    const isPartial = event.event_type === "edinet_order_partial";

    if (ext.orders_received != null) {
      // 念のため単数形のキーもフォールバックとしてチェック
      const rawYoy = ext.orders_received_yoy ?? (ext as any).order_received_yoy;
      const yoy = typeof rawYoy === "string" ? parseFloat(rawYoy) : typeof rawYoy === "number" ? rawYoy : null;
      const yoyStr = yoy != null && !isNaN(yoy) ? fmtPct(yoy * 100) : "-";
      metrics.push(`受注高 YOY${yoyStr}`);
    } else if (isPartial) {
      metrics.push("受注高 未開示");
    }

    if (ext.order_backlog != null) {
      const rawYoy = ext.order_backlog_yoy;
      const yoy = typeof rawYoy === "string" ? parseFloat(rawYoy) : typeof rawYoy === "number" ? rawYoy : null;
      const yoyStr = yoy != null && !isNaN(yoy) ? fmtPct(yoy * 100) : "-";
      metrics.push(`受注残 YOY${yoyStr}`);
    } else if (isPartial) {
      metrics.push("受注残 未開示");
    }
    
    if (metrics.length > 0) {
      line2 = metrics.join(" ");
    } else {
      line2 = "EDINET受注データ";
    }
  } else {
    line1 = `${dateStr} ${timeStr} ${ticker} ${name} ${typeLabel}`.trim();
    if (event.primary_metric_name) {
       line2 = `${event.primary_metric_name} ${event.primary_metric_value || ""}`;
    }
  }

  const res = { line1, line2, line3 };
  summaryCache.set(event.id, res);
  return res;
};

const getEarningsScore = (text: string): number | null => {
  const match = text.match(/(?:営利|営業利益|営業益|OP)\s*[（(](?:YOY|前年比)\s*([+-]?[\d.]+)%[）)]/i);
  if (match) return parseFloat(match[1]);
  return null;
};
const getBuybackScore = (text: string): number | null => {
  const match = text.match(/(?:BB|割合|自社株買い|取得枠)\s*[:：]?\s*([\d.]+)%/i);
  if (match) return parseFloat(match[1]);
  return null;
};
const getForecastUpScore = (text: string): number | null => {
  const matchPctParen = text.match(/(?:EPS|上方\s*EPS)[^()]*\(\s*([+-]?[\d.]+)%\s*\)/i);
  if (matchPctParen) return parseFloat(matchPctParen[1]);
  const matchPct = text.match(/(?:EPS|上方\s*EPS)\s*([+-]?[\d.]+)%/i);
  if (matchPct) return parseFloat(matchPct[1]);
  const matchVal = text.match(/(?:EPS|上方\s*EPS)[^()→＞]*([\d,.]+)(?:円|銭)?\s*[→＞]\s*([\d,.]+)(?:円|銭)?/i);
  if (matchVal) {
    const prev = parseFloat(matchVal[1].replace(/,/g, ""));
    const rev = parseFloat(matchVal[2].replace(/,/g, ""));
    if (prev > 0) return ((rev - prev) / prev) * 100;
  }
  return null;
};
const getForecastScore = (text: string): number | null => {
  const opPct = text.match(/(?:営利|営業利益|営業益|OP)\s*([+-]?[\d.]+)%/i);
  if (opPct) return parseFloat(opPct[1]);
  const opVal = text.match(/(?:営利|営業利益|営業益|OP)[^()→＞]*([\d,.]+)(?:円|銭)?\s*[→＞]\s*([\d,.]+)(?:円|銭)?/i);
  if (opVal) {
    const prev = parseFloat(opVal[1].replace(/,/g, ""));
    const rev = parseFloat(opVal[2].replace(/,/g, ""));
    if (prev > 0) return ((rev - prev) / prev) * 100;
  }
  return getForecastUpScore(text);
};
const getDividendScore = (text: string): number | null => {
  const matchVal = text.match(/(?:増配|配当|DPS|期末配当|中間配当|年配|記念配当|特別配当)\s*([\d,.]+)(?:円|銭)?\s*[→＞]\s*([\d,.]+)(?:円|銭)?/i);
  if (matchVal) {
    const prev = parseFloat(matchVal[1].replace(/,/g, ""));
    const rev = parseFloat(matchVal[2].replace(/,/g, ""));
    if (prev > 0) return ((rev - prev) / prev) * 100;
  }
  return null;
};

/**
 * 決算カテゴリ専用のソートキー取得処理。
 * 当期営業利益(2行目)の状態をもとに bucket と yoyValue を返す。
 * bucket:
 *   0: 黒転
 *   1: 通常YOY％
 *   2: 赤字継続
 *   3: 赤転
 *   4: YOY- / 判定不能
 */
const getEarningsOpSortKey = (event: EnrichedEvent): { bucket: number, yoyValue: number } => {
  const rp: Record<string, unknown> | null =
    typeof event.raw_payload === "string"
      ? (() => { try { return JSON.parse(event.raw_payload) as Record<string, unknown>; } catch { return null; } })()
      : (event.raw_payload as Record<string, unknown> | null) ?? null;
  const ext = (rp && typeof rp === "object" && rp.extracted && typeof rp.extracted === "object" ? rp.extracted : {}) as Record<string, unknown>;
  const comp = rp?.notification_compare_json as any;
  const fm = event.formatted_message || event.display_summary || "";

  const currOpVal = comp?.current?.op_yoy ?? ext.op_yoy;
  const opCurrentNum = Number(ext.op_current);
  const opYoyNum = Number(currOpVal);

  if (currOpVal != null && ext.op_current != null) {
    let opPrevEst: number | null = null;
    if (!isNaN(opCurrentNum) && !isNaN(opYoyNum) && opYoyNum !== -1) {
      opPrevEst = opCurrentNum / (1 + opYoyNum);
    }
    const turnaround = getOpTurnaroundLabel(opPrevEst, opCurrentNum);
    if (turnaround === "黒転") return { bucket: 0, yoyValue: 0 };
    if (turnaround === "赤字継続") return { bucket: 2, yoyValue: 0 };
    if (turnaround === "赤転") return { bucket: 3, yoyValue: 0 };
    
    // 通常YOY
    if (!isNaN(opYoyNum)) return { bucket: 1, yoyValue: opYoyNum };
  } else if (currOpVal != null && !isNaN(opYoyNum)) {
    // op_currentが欠損だがop_yoyはある場合
    return { bucket: 1, yoyValue: opYoyNum };
  } else {
    // fallbackOpYoy (正規表現) を試す
    let fallbackOpYoy: string | null = null;
    if (fm) {
      const oMatch = fm.match(/(?:営業利益|営利).*?YOY\s*([+-]?[\d.]+%)/i);
      if (oMatch) fallbackOpYoy = oMatch[1];
    }
    if (fallbackOpYoy) {
      const val = parseFloat(fallbackOpYoy);
      if (!isNaN(val)) return { bucket: 1, yoyValue: val / 100 };
    }
  }

  // 判定不能
  return { bucket: 4, yoyValue: 0 };
};

const getCategoryScore = (event: EnrichedEvent, category: string): number | null => {
  const badge = getBadgeConfig(event.event_type, event.headline);
  const subtypeLabel = event.event_subtype ? (EVENT_SUBTYPE_LABELS[event.event_subtype] ?? event.event_subtype) : "";
  const { line1, line2, line3 } = formatCardSummary(event, badge, subtypeLabel);
  
  const text = `${line1 || ""} ${line2 || ""} ${line3 || ""} ${event.formatted_message || ""} ${JSON.stringify(event.raw_payload || {})}`;
  
  switch (category) {
    case "earnings": return getEarningsScore(text);
    case "buyback": return getBuybackScore(text);
    case "forecast_up": return getForecastUpScore(text);
    case "forecast": return getForecastScore(text);
    case "dividend": return getDividendScore(text);
    default: return null;
  }
};

/**
 * 受注高 YOY を raw_payload.extracted.orders_received_yoy から取得する。
 * 値は小数（例: 1.049 → 104.9%）で格納されているため、100倍してパーセントに変換する。
 * 取得できない場合は null を返す（末尾扱い）。
 */
const getOrderReceivedYoy = (event: EnrichedEvent): number | null => {
  const rp = event.raw_payload;
  if (!rp || typeof rp !== "object") return null;
  const rpObj = rp as Record<string, unknown>;
  const ext = (rpObj.extracted && typeof rpObj.extracted === "object"
    ? rpObj.extracted
    : {}) as Record<string, unknown>;
  const raw = ext.orders_received_yoy;
  if (raw == null) return null;
  const n = Number(raw);
  if (isNaN(n)) return null;
  return n * 100; // 小数→パーセント変換
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,+\s%]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
};

const getEarningsImpactKey = (event: EnrichedEvent): { bucket: number; score: number } | null => {
  const { bucket, yoyValue } = getEarningsOpSortKey(event);
  if (bucket === 4) return null;
  if (bucket === 0) return { bucket: 2, score: 0 };
  if (bucket === 3) return { bucket: 4, score: 0 };
  if (yoyValue > 0) return { bucket: 1, score: yoyValue };
  return { bucket: 3, score: yoyValue };
};

const getBuybackImpactKey = (event: EnrichedEvent): { bucket: number; score: number } | null => {
  const rp = event.raw_payload as any;
  const ext = rp?.extracted || {};
  const ratio = toFiniteNumber(ext.ratio_to_outstanding);
  if (ratio == null) return null;
  return { bucket: 1, score: ratio };
};

const getImpactSortKey = (event: EnrichedEvent, activeCategory: string): { bucket: number; score: number } | null => {
  if (activeCategory === "edinet_order") {
    const yoy = getOrderReceivedYoy(event);
    if (yoy == null) return null;
    return { bucket: 1, score: yoy };
  }
  if (activeCategory === "earnings") return getEarningsImpactKey(event);
  if (activeCategory === "buyback") return getBuybackImpactKey(event);
  return null;
};


export default function AlertsPage({ userId, userEmail }: AlertsPageProps) {
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const dt = new Date();
    dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset() + 9 * 60);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [search, setSearch] = useState("");
  const [allPeriodTickerSearch, setAllPeriodTickerSearch] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discordSortMode, setDiscordSortModeState] = useState<"timeline" | "category">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tdnet_discord_sort");
      if (saved === "category") return "category";
    }
    return "timeline";
  });
  const setDiscordSortMode = (mode: "timeline" | "category") => {
    setDiscordSortModeState(mode);
    if (typeof window !== "undefined") localStorage.setItem("tdnet_discord_sort", mode);
  };

  // 左ペイン幅（localStorage永続化）
  const [leftPaneWidth, setLeftPaneWidthState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tdnet_left_pane_width");
      if (saved !== null && saved.trim() !== "") {
        const n = Number(saved);
        if (Number.isFinite(n) && n >= LEFT_PANE_MIN_WIDTH) return n;
      }
    }
    return LEFT_PANE_DEFAULT_WIDTH;
  });
  // 右ペインタブ（"detail" | "company"）
  const [rightPaneTab, setRightPaneTab] = useState<"detail" | "company">("company");

  const supabaseRef = useRef(createSupabaseBrowser());
  const viewerRef = useRef<CompanyViewerHandle>(null);
  const searchRef = useRef("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);
  const alertsCacheRef = useRef<Map<string, AlertsCacheEntry>>(new Map());

  // Realtime 接続
  const { status: connectionStatus } = useRealtimeAlerts({
    onNewEvent: (newEvent: TdnetEvent) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        const enriched: EnrichedEvent = {
          ...newEvent,
          is_read: false,
          is_starred: false,
          comments_count: 0,
        };
        return [enriched, ...prev];
      });
    },
  });

  // イベント読み込み
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const opts: Parameters<typeof fetchEvents>[1] = {
        userId,
        limit: 1000,
        allPeriodTickerSearch,
      };

      if (filter === "unread") opts.unreadOnly = true;
      else if (filter === "starred") opts.starredOnly = true;
      else if (filter === "buyback") opts.eventType = "buyback";
      else if (filter === "forecast_up") opts.eventType = "forecast_up";
      else if (filter === "forecast") opts.eventType = "forecast";
      else if (filter === "dividend") opts.eventType = "dividend";
      else if (filter === "earnings") opts.eventType = "earnings";
      else if (filter === "edinet_order") {
        // partialも取得するためクエリパラメータから外し、フロントエンド側でフィルタする
      }
      else if (filter === "discord") opts.discordOnly = true;
      // 全件タブ: DBソート (disclosed_at DESC, detected_at DESC) をそのまま使用
      else if (filter === "all") opts.skipClientSort = true;

      if (selectedDate) opts.selectedDate = selectedDate;

      const currentSearch = searchRef.current.trim();
      if (currentSearch) opts.search = currentSearch;

      const cacheKey = JSON.stringify({
        userId,
        limit: opts.limit,
        allPeriod: opts.allPeriodTickerSearch,
        filter,
        date: opts.selectedDate || null,
        search: currentSearch || null,
        eventType: opts.eventType || null,
        discordOnly: opts.discordOnly || false,
        skipClientSort: opts.skipClientSort || false,
        unreadOnly: opts.unreadOnly || false,
        starredOnly: opts.starredOnly || false,
      });

      const cached = alertsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ALERTS_CACHE_TTL_MS) {
        setEvents(cached.events);
        setLoading(false);
        return;
      }

      console.log("[tdnet-alerts] loadEvents params", {
        filter,
        selectedDate,
        eventType: opts.eventType,
        selectedDateParam: opts.selectedDate,
      });

      const data = await fetchEvents(supabaseRef.current, opts);
      alertsCacheRef.current.set(cacheKey, { timestamp: Date.now(), events: data });
      setEvents(data);
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, filter, selectedDate, allPeriodTickerSearch]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // 音を初期化
  useEffect(() => {
    audioManager.restoreFromStorage();
    setAudioEnabled(audioManager.isEnabled);
  }, []);

  // ペインリサイズ：drag イベント
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const newW = Math.max(LEFT_PANE_MIN_WIDTH, dragStartWidthRef.current + delta);
      setLeftPaneWidthState(newW);
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const delta = e.clientX - dragStartXRef.current;
      const newW = Math.max(LEFT_PANE_MIN_WIDTH, dragStartWidthRef.current + delta);
      setLeftPaneWidthState(newW);
      localStorage.setItem("tdnet_left_pane_width", String(newW));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleToggleAudio = () => {
    const enabled = audioManager.toggle();
    setAudioEnabled(enabled);
  };

  const handleFilterChange = (f: FilterType) => {
    setFilter(f);
  };

  const handleTodayClick = () => {
    setAllPeriodTickerSearch(false);
    if (!selectedDate) {
      const dt = new Date();
      dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset() + 9 * 60);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      setSelectedDate(`${yyyy}-${mm}-${dd}`);
    }
    setTimeout(() => {
      const input = dateInputRef.current;
      if (input) {
        if (typeof input.showPicker === "function") {
          input.showPicker();
        } else {
          input.focus();
          input.click();
        }
      }
    }, 50);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAllPeriodTickerSearch(false);
    if (val) {
      setSelectedDate(val);
    } else {
      setSelectedDate(null);
    }
  };

  const handleClearDate = () => {
    setAllPeriodTickerSearch(false);
    setSelectedDate(null);
    if (dateInputRef.current) dateInputRef.current.value = "";
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    searchRef.current = value;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    // 300ms debounce: 高速タイピング時の過剰クエリを抑制
    searchDebounceRef.current = setTimeout(() => loadEvents(), 300);
  };

  const handleSelectEvent = (event: EnrichedEvent) => {
    if (selectedId === event.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(event.id);
    setRightPaneTab("company"); // クリック時は Company Viewer をデフォルト表示
    
    // UIの反映(左カードの展開)を優先するため、右Viewerの読み込みを非同期で開始する
    setTimeout(() => {
      viewerRef.current?.loadTicker(event.ticker);
    }, 0);

    if (!event.is_read) {
      // 既読化処理もUIをブロックしないように非同期で後追い実行
      (async () => {
        try {
          await markAsRead(supabaseRef.current, event.id, userId);
          alertsCacheRef.current.clear();
          setEvents((prev) =>
            prev.map((e) => (e.id === event.id ? { ...e, is_read: true } : e))
          );
        } catch (err) {
          console.error("Failed to mark as read:", err);
        }
      })();
    }
  };

  const handleToggleRead = async (event: EnrichedEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // オプティミスティック・アップデート (即時UI反映)
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === event.id ? { ...ev, is_read: !ev.is_read } : ev
      )
    );

    try {
      if (event.is_read) {
        await markAsUnread(supabaseRef.current, event.id, userId);
      } else {
        await markAsRead(supabaseRef.current, event.id, userId);
      }
      alertsCacheRef.current.clear();
    } catch (err) {
      console.error("Failed to toggle read:", err);
      // エラー時は元に戻す
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === event.id ? { ...ev, is_read: event.is_read } : ev
        )
      );
    }
  };

  const handleToggleStar = async (event: EnrichedEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // オプティミスティック・アップデート (即時UI反映)
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === event.id ? { ...ev, is_starred: !ev.is_starred } : ev
      )
    );

    try {
      await toggleStar(supabaseRef.current, event.id, userId, event.is_starred);
      alertsCacheRef.current.clear();
    } catch (err) {
      console.error("Failed to toggle star:", err);
      // エラー時は元に戻す
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === event.id ? { ...ev, is_starred: event.is_starred } : ev
        )
      );
    }
  };

  const handleLogout = async () => {
    await supabaseRef.current.auth.signOut();
    window.location.href = "/login";
  };

  const selectedEvent = events.find((e) => e.id === selectedId) || null;
  const unreadCount = events.filter((e) => !e.is_read).length;

  const formatTime = (dt: string) => {
    const d = new Date(dt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const DD = String(d.getDate()).padStart(2, "0");
    return `${MM}/${DD} ${hh}:${mm}`;
  };




  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "全体" },
    { key: "starred", label: "⭐ スター" },
    { key: "buyback", label: "📊 自社株買" },
    { key: "forecast_up", label: "📈 上方修正" },
    { key: "forecast", label: "📉 業績修正" },
    { key: "dividend", label: "💰 配当" },
    { key: "earnings", label: "📋 決算" },
    { key: "edinet_order", label: "📦 受注・受注残" },
    { key: "discord", label: "🔔 Discord対象" },
  ];

  const todayBtnLabel = (() => {
    if (selectedDate) {
      const [, m, d] = selectedDate.split("-");
      return `📅 ${m}/${d}`;
    }
    return "📅 今日";
  })();

  // unused variable suppression
  void getStrengthDisplay;

  return (
    <div className="alerts-layout">
      {/* Header */}
      <header className="alerts-header">
        <div className="alerts-header-left">
          <a href="/" className="site-link">
            🏢 Company Viewer
          </a>
          <h1 className="alerts-header-title">TDNET Alerts</h1>
          <span className="stat-badge unread">未読 {unreadCount}</span>
          <span className="stat-badge total">表示件数 {events.length}件</span>
        </div>
        <div className="alerts-header-right">
          <span className="stat-badge" title={`接続: ${connectionStatus}`}>
            <span className={`connection-dot ${connectionStatus}`} />
            {connectionStatus === "connected" ? "Live" : connectionStatus}
          </span>
          <button
            className={`audio-toggle ${audioEnabled ? "enabled" : ""}`}
            onClick={handleToggleAudio}
            title={audioEnabled ? "音をOFFにする" : "クリックで音をON"}
          >
            {audioEnabled ? "🔔 ON" : "🔕 OFF"}
          </button>
          <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
            {userEmail}
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            ログアウト
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="filter-bar">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`filter-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => handleFilterChange(f.key)}
          >
            {f.label}
          </button>
        ))}

        {/* 日付ピッカー付き「今日」ボタン */}
        <div className="date-filter-wrap">
          <button
            className={`filter-chip ${selectedDate ? "active" : ""}`}
            onClick={handleTodayClick}
            title="クリックで日付を選択"
          >
            {todayBtnLabel}
          </button>
          {selectedDate && (
            <button
              className="date-clear-btn"
              onClick={handleClearDate}
              title="日付フィルタを解除"
              aria-label="日付フィルタを解除"
            >
              ×
            </button>
          )}
          <input
            ref={dateInputRef}
            type="date"
            className="date-picker-hidden"
            value={selectedDate ?? ""}
            onChange={handleDateChange}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
          <button
            className={`filter-chip ${allPeriodTickerSearch ? "active" : ""}`}
            onClick={() => setAllPeriodTickerSearch(!allPeriodTickerSearch)}
            title="ティッカー検索時に日付指定を無視して全期間から検索します"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem", height: "30px" }}
          >
            {allPeriodTickerSearch ? "全期間ON" : "全期間OFF"}
          </button>
          <input
            type="text"
            className="filter-search"
            placeholder="🔍 ティッカー / 会社名 / ヘッドライン"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Discord対象タブのソートボタン */}
      {filter === "discord" && (
        <div className="discord-sort-bar">
          <span className="discord-sort-label">⇅ 並び順:</span>
          <button
            id="discord-sort-timeline"
            className={`discord-sort-btn ${discordSortMode === "timeline" ? "active" : ""}`}
            onClick={() => setDiscordSortMode("timeline")}
          >
            時系列
          </button>
          <button
            id="discord-sort-category"
            className={`discord-sort-btn ${discordSortMode === "category" ? "active" : ""}`}
            onClick={() => setDiscordSortMode("category")}
          >
            カテゴリー別
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="alerts-content">
        {/* List Pane */}
        <div
          className="alerts-list-pane"
          style={{ width: leftPaneWidth, flexShrink: 0 }}
        >
          {loading ? (
            <div className="loading-message">読み込み中...</div>
          ) : events.length === 0 ? (
            <div className="placeholder">
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
              <div>イベントがありません</div>
              <div style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                フィルタを変更するか、新着を待ってください
              </div>
            </div>
          ) : (
            (() => {
            const isDiscordTab = filter === "discord";
            
            // ====================
            // Full 優先フィルタの実装
            // ====================
            const filteredEvents = events.filter(e => {
              // 受注タブの場合はフロントエンドでフィルタ
              if (filter === "edinet_order" && !isEdinetOrderEvent(e.event_type)) {
                return false;
              }

              if (e.event_type !== "edinet_order_partial") return true;
              const eExt = (e.raw_payload && typeof e.raw_payload === "object") ? (e.raw_payload as Record<string, any>).extracted : null;
              const ePeriod = eExt?.period;
              if (!ePeriod) return true;
              
              const hasFull = events.some(f => 
                f.event_type === "edinet_order" &&
                f.ticker === e.ticker &&
                ((f.raw_payload && typeof f.raw_payload === "object" ? (f.raw_payload as Record<string, any>).extracted : null)?.period === ePeriod)
              );
              return !hasFull;
            });

            // ソート処理
            const isImpactCategory = filter === "edinet_order" || filter === "earnings" || filter === "buyback";
            let displayEvents = filteredEvents;

            if (isImpactCategory) {
              displayEvents = [...filteredEvents].sort((a, b) => {
                if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
                const keyA = getImpactSortKey(a, filter);
                const keyB = getImpactSortKey(b, filter);
                if (keyA && keyB) {
                  if (keyA.bucket !== keyB.bucket) return keyA.bucket - keyB.bucket;
                  if (keyA.score !== keyB.score) return keyB.score - keyA.score;
                }
                if (keyA && !keyB) return -1;
                if (!keyA && keyB) return 1;
                return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
              });
            } else if (isDiscordTab) {
              displayEvents = [...filteredEvents].sort((a, b) => {
                // 未読を常に上
                if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
                if (discordSortMode === "timeline") {
                  return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
                } else {
                  const getScore = (ev: typeof a) => {
                    const baseCat = getDisplayCategory(ev.event_type, ev.headline);
                    return getCategoryScore(ev, baseCat) ?? 0;
                  };
                  const aScore = getScore(a);
                  const bScore = getScore(b);
                  if (aScore !== bScore) return bScore - aScore; // スコア降順
                  return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
                }
              });
            }

            const nodes = displayEvents.map((event) => {
              const badge = getBadgeConfig(event.event_type, event.headline);
              const priorityClass = !event.is_read ? getPriorityClass(event.priority_rank) : "";
              const subtypeLabel = event.event_subtype
                ? (EVENT_SUBTYPE_LABELS[event.event_subtype] ?? event.event_subtype)
                : "";

              // 全タブ共通: raw_payload の数値要約を表示。長い headline は使わない。
              const { text: cardBody, isFallback, primaryText, compareText, summaryText } = formatCardBody(event);
              // Discord タブのみ: 送信時刻を末尾に追加
              let discordExtra = "";
              if (isDiscordTab && event.discord_sent_at) {
                const d = new Date(event.discord_sent_at);
                const mm  = String(d.getMonth() + 1).padStart(2, "0");
                const dd  = String(d.getDate()).padStart(2, "0");
                const hh  = String(d.getHours()).padStart(2, "0");
                const min = String(d.getMinutes()).padStart(2, "0");
                discordExtra = `\n🔔 ${d.getFullYear()}-${mm}-${dd} ${hh}:${min}`;
              }
              const bodyText = cardBody + discordExtra;

              const isSelected = selectedId === event.id;

              if (!isSelected) {
                const { line1, line2, line3 } = formatCardSummary(event, badge, subtypeLabel);
                return (
                  <div
                    key={event.id}
                    className={`alert-card collapsed ${!event.is_read ? "unread" : ""} ${priorityClass}`}
                    onClick={() => handleSelectEvent(event)}
                  >
                    <div className="alert-card-summary-line1">
                       {renderHighlightedCardBody(line1, event)}
                    </div>
                    {line2 && (
                       <div className="alert-card-summary-line2">
                          {renderHighlightedCardBody(line2, event)}
                       </div>
                    )}
                    {line3 && (
                       <div className="alert-card-summary-line3" style={{ fontSize: '0.85em', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                          {renderHighlightedCardBody(line3, event)}
                       </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={event.id}
                  className={`alert-card expanded ${!event.is_read ? "unread" : ""} selected ${priorityClass}`}
                  onClick={() => handleSelectEvent(event)}
                >
                  {/* Row 1: Time + Badge + Actions */}
                  <div className="alert-card-header">
                    <span className="alert-time">
                      {formatTime(event.disclosed_at || event.detected_at)}
                    </span>
                    <span className={`alert-badge ${badge.category}`}>
                      {badge.emoji} {subtypeLabel || badge.label}
                    </span>
                    {event.event_type === "edinet_order_partial" && (
                      <span className="alert-badge" style={{ backgroundColor: "#fef08a", color: "#854d0e", marginLeft: "4px" }}>
                        片側のみ
                      </span>
                    )}
                    {event.event_type === "edinet_order_partial" && ((event.raw_payload && typeof event.raw_payload === "object" ? (event.raw_payload as Record<string, any>).extracted?.review_label : null)) && (
                      <span className="alert-badge" style={{ backgroundColor: "#fef08a", color: "#854d0e", marginLeft: "4px" }}>
                        {((event.raw_payload as Record<string, any>).extracted?.review_label)}
                      </span>
                    )}
                    {event.event_type === "edinet_order_partial" && ((event.raw_payload && typeof event.raw_payload === "object" ? (event.raw_payload as Record<string, any>).extracted?.classification === "PARTIAL_METRIC_REVIEW_CAUTION" : false)) && (
                      <span className="alert-badge" style={{ backgroundColor: "#fecaca", color: "#991b1b", marginLeft: "4px" }}>
                        要確認
                      </span>
                    )}
                    <span className="alert-card-actions">
                      <button
                        className={`action-btn ${event.is_starred ? "active" : ""}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleToggleStar(event, e)}
                        title="スター"
                      >
                        {event.is_starred ? "⭐" : (
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="rgba(0,0,0,0.4)"
                            stroke="#ffffff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ display: "inline-block", verticalAlign: "middle", filter: "drop-shadow(0px 1px 1px rgba(0,0,0,0.5))", pointerEvents: "none" }}
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        )}
                      </button>
                      {event.pdf_url && (
                        <a
                          href={event.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="action-btn pdf-link"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          title="PDFを開く"
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          📄PDF
                        </a>
                      )}
                      <button
                        className={`action-btn ${!event.is_read ? "active" : ""}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleToggleRead(event, e)}
                        title={event.is_read ? "未読に戻す" : "既読にする"}
                      >
                        {event.is_read ? "📖" : "📩"}
                      </button>
                      {event.comments_count > 0 && (
                        <span style={{ fontSize: "0.72rem", color: "#8b5cf6" }}>
                          💬{event.comments_count}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Row 2: Ticker + Company Name */}
                  <div className="alert-card-company">
                    <span className="alert-ticker">{event.ticker}</span>
                    {event.company_name && (
                      <span className="alert-company-name">{event.company_name}</span>
                    )}
                  </div>

                  {/* Row 3: 数値要約 (fallback時はheadlineを1行muted) */}
                  <div className={`alert-card-body${isFallback ? " fallback" : ""}`}>
                    {event.event_type === "earnings" && !isFallback ? (
                      <>
                        {primaryText && renderHighlightedCardBody(primaryText, event)}
                        {compareText && (
                          <div 
                            className="notification-compare" 
                            style={{ 
                              marginTop: "4px", 
                              marginBottom: "8px",
                              padding: "4px 8px", 
                              backgroundColor: "var(--bg-secondary, #f3f4f6)", 
                              borderRadius: "4px",
                              fontSize: "0.9em",
                              color: "var(--text-secondary, #4b5563)",
                              borderLeft: "3px solid #8b5cf6"
                            }}
                          >
                            {compareText}
                          </div>
                        )}
                        {summaryText && renderHighlightedCardBody(summaryText + discordExtra, event)}
                      </>
                    ) : (
                      renderHighlightedCardBody(bodyText, event)
                    )}
                  </div>
                </div>
              );
            });
            console.timeEnd("renderEvents");
            return nodes;
            })()
          )}
        </div>

        {/* リサイズドラッガー */}
        <div
          className="pane-divider"
          onMouseDown={(e) => {
            isDraggingRef.current = true;
            dragStartXRef.current = e.clientX;
            dragStartWidthRef.current = leftPaneWidth;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            e.preventDefault();
          }}
        />

        {/* Detail Pane */}
        <div className="alerts-detail-pane">
          {selectedEvent ? (
            <>
              {/* 右ペインタブ */}
              <div className="right-pane-tabs">
                <button
                  id="right-tab-company"
                  className={`right-pane-tab-btn ${rightPaneTab === "company" ? "active" : ""}`}
                  onClick={() => setRightPaneTab("company")}
                >
                  🏢 Company Viewer
                </button>
                <button
                  id="right-tab-detail"
                  className={`right-pane-tab-btn ${rightPaneTab === "detail" ? "active" : ""}`}
                  onClick={() => setRightPaneTab("detail")}
                >
                  📋 イベント詳細
                </button>
              </div>

              {/* タブコンテンツ */}
              {rightPaneTab === "company" ? (
                <div className="cvs-body" style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <CompanyViewer ref={viewerRef} />
                </div>
              ) : (
                <AlertDetailPanel
                  event={selectedEvent}
                  userId={userId}
                  onUpdate={(updated) => {
                    alertsCacheRef.current.clear();
                    setEvents((prev) =>
                      prev.map((e) => (e.id === updated.id ? updated : e))
                    );
                  }}
                />
              )}
            </>
          ) : (
            <div className="cvs-body" style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
              <CompanyViewer ref={viewerRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
