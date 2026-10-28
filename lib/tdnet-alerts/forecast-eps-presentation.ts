import type { TdnetEvent } from "./types";

type Period = "2Q_CUMULATIVE" | "2Q_STANDALONE" | "FULL_YEAR" | "UNKNOWN";
type EpsRow = {
  fiscalPeriod: string | null;
  period: Period;
  basis: string | null;
  previousEps: number | null;
  revisedEps: number | null;
  previousOp: number | null;
  revisedOp: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try { return record(JSON.parse(value)); } catch { return null; }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function eps(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 10000 ? number : null;
}

function operatingProfit(value: unknown, unit: unknown): number | null {
  if (unit !== "millions_jpy" || value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 1e9 ? number : null;
}

function rate(previous: number | null, revised: number | null, suppressNonpositive = false): string {
  if (previous === null || revised === null || previous === 0 || (suppressNonpositive && previous < 0)) return "";
  const percent = (revised - previous) / Math.abs(previous) * 100;
  return ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`;
}

function legacyPeriod(label: string): Period {
  const fullYear = /通期/.test(label);
  const cumulative = /(?:第?2四半期|2Q).*累計|中間期|上期|上半期/i.test(label);
  const standalone = /(?:第?2四半期|2Q).*(?:単独|会計期間)/i.test(label);
  if ([fullYear, cumulative, standalone].filter(Boolean).length !== 1) return "UNKNOWN";
  return fullYear ? "FULL_YEAR" : cumulative ? "2Q_CUMULATIVE" : "2Q_STANDALONE";
}

const periodNames: Record<Period, string> = {
  "2Q_CUMULATIVE": "2Q（累計）",
  "2Q_STANDALONE": "2Q（単独）",
  "FULL_YEAR": "通期",
  "UNKNOWN": "期間不明",
};
const periodOrder: Record<Period, number> = {
  "2Q_CUMULATIVE": 0, "2Q_STANDALONE": 1, "FULL_YEAR": 2, "UNKNOWN": 3,
};

export function getForecastEpsPresentation(event: Pick<TdnetEvent, "raw_payload">): {
  fiscalPeriod: string | null;
  lines: string[];
} {
  const extracted = record(record(event.raw_payload)?.extracted);
  if (!extracted) return { fiscalPeriod: null, lines: [] };
  const rows: EpsRow[] = [];
  if (Array.isArray(extracted.eps_revisions) && extracted.eps_revisions.length > 0) {
    for (const entry of extracted.eps_revisions) {
      const row = record(entry);
      if (!row) continue;
      const previous = eps(row.previous_eps);
      const revised = eps(row.revised_eps);
      const previousOp = operatingProfit(row.previous_op, row.op_unit);
      const revisedOp = operatingProfit(row.revised_op, row.op_unit);
      if (previous === null && revised === null && previousOp === null && revisedOp === null) continue;
      if (previous !== null && revised !== null && previous === revised &&
          previousOp === revisedOp) continue;
      const period = typeof row.period === "string" && row.period in periodNames
        ? row.period as Period : "UNKNOWN";
      const fiscalPeriod = typeof row.fiscal_period === "string" && /^20\d{2}年(?:[1-9]|1[0-2])月期$/.test(row.fiscal_period)
        ? row.fiscal_period : null;
      rows.push({ fiscalPeriod, period, basis: typeof row.basis === "string" ? row.basis : null,
        previousEps: previous, revisedEps: revised, previousOp, revisedOp });
    }
  } else {
    const previous = eps(extracted.previous_eps);
    const revised = eps(extracted.revised_eps);
    if (previous !== null && revised !== null && previous !== revised) {
      const label = typeof extracted.period_label === "string" ? extracted.period_label : "";
      const fiscalPeriod = label.match(/20\d{2}年(?:[1-9]|1[0-2])月期/)?.[0] ?? null;
      rows.push({ fiscalPeriod, period: legacyPeriod(label), basis: typeof extracted.basis === "string" ? extracted.basis : null,
        previousEps: previous, revisedEps: revised, previousOp: null, revisedOp: null });
    }
  }
  rows.sort((a, b) => (a.fiscalPeriod || "").localeCompare(b.fiscalPeriod || "")
    || periodOrder[a.period] - periodOrder[b.period]
    || (a.basis || "").localeCompare(b.basis || ""));
  const fiscalPeriod = rows.length && rows.every(row => row.fiscalPeriod === rows[0].fiscalPeriod)
    ? rows[0].fiscalPeriod : null;
  const lines = rows.map(row => {
    const amount = (value: number | null) => value === null ? "—" : `${value}円`;
    const profit = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 }).format(value)}百万円`;
    const fiscal = fiscalPeriod ? "" : row.fiscalPeriod ? `${row.fiscalPeriod} ` : "";
    const basis = row.basis ? ` ${row.basis}` : "";
    return `${fiscal}${periodNames[row.period]}${basis}\n営業利益：${profit(row.previousOp)}→${profit(row.revisedOp)}${rate(row.previousOp, row.revisedOp, true)}\nEPS：${amount(row.previousEps)}→${amount(row.revisedEps)}${rate(row.previousEps, row.revisedEps)}`;
  });
  return { fiscalPeriod, lines };
}
