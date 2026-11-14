export interface AnalysisSummary {
  schema: 1; card_id: string; revision: string; ticker: string; company_name: string;
  period: { fy_end: string; quarter: number; standard: string; scope: string };
  calculation: { candidate: boolean; classification: string; verified_acceleration_pt: string;
    profit_yoy_change_improvement_yen: string; classification_scope?: string; classification_note?: string; rounding_interval_pt?: string[] };
  completed_at: string; factor: string; verification: string; limitations: string[];
}
export interface AnalysisDetail extends AnalysisSummary {
  pl: string;
  analysis: { factor: string; sections: { heading: string; paragraphs: string[] }[];
    evidence: { source_id: string; page: number; quote: string }[] };
  source_index: { id: string; title: string; url: string; published_at: string; sha256: string }[];
}
export function validSummary(x: unknown): x is AnalysisSummary {
  if (!x || typeof x !== "object") return false;
  const v = x as AnalysisSummary;
  return v.schema === 1 && /^[a-f0-9]{64}$/.test(v.card_id ?? "") && /^[a-f0-9]{64}$/.test(v.revision ?? "") &&
    typeof v.company_name === "string" && typeof v.ticker === "string" &&
    !!v.period && typeof v.period.fy_end === "string" && [1,2,3,4].includes(v.period.quarter) &&
    v.calculation?.candidate === true && typeof v.calculation.verified_acceleration_pt === "string" &&
    Number.isFinite(Number(v.calculation.verified_acceleration_pt)) &&
    typeof v.calculation.profit_yoy_change_improvement_yen === "string" && Number.isFinite(Number(v.calculation.profit_yoy_change_improvement_yen)) &&
    typeof v.factor === "string" && typeof v.verification === "string" && Number.isFinite(Date.parse(v.completed_at)) &&
    Array.isArray(v.limitations) && v.limitations.every(s => typeof s === "string");
}
export function uniqueCards(rows: unknown[]): AnalysisSummary[] {
  const map = new Map<string, AnalysisSummary>();
  for (const row of rows) {
    if (!validSummary(row)) continue;
    const old = map.get(row.card_id);
    if (!old || Date.parse(row.completed_at) > Date.parse(old.completed_at)) map.set(row.card_id,row);
  }
  return [...map.values()].sort((a,b) => Date.parse(b.completed_at)-Date.parse(a.completed_at));
}
export function safeSourceURL(url: string): string | undefined {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password ? u.href : undefined; }
  catch { return undefined; }
}
export function validDetail(v: unknown, card: AnalysisSummary): v is AnalysisDetail {
  if (!validSummary(v) || v.card_id !== card.card_id || v.revision !== card.revision) return false;
  const d = v as AnalysisDetail;
  return typeof d.pl === "string" && Array.isArray(d.analysis?.sections) &&
    d.analysis.sections.every(s => typeof s.heading === "string" && Array.isArray(s.paragraphs) && s.paragraphs.every(p => typeof p === "string")) &&
    Array.isArray(d.analysis.evidence) && d.analysis.evidence.every(e => typeof e.source_id === "string" && Number.isInteger(e.page) && e.page>0 && typeof e.quote === "string") &&
    Array.isArray(d.source_index) && d.source_index.every(s => typeof s.id === "string" && typeof s.url === "string" && typeof s.title === "string");
}
