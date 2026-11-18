import type { CalendarRow, ForecastVersion, Growth, PreviousQuarter, TargetQuarter, ComparisonContext } from "../types/earnings-calendar";
import type { FinancialRecord } from "../types/financial";
import type { FinancialProvenance } from "./financial-loader";
import { buildFinancialTableModel } from "./financial-table-model";
import { FORECAST_SOURCES } from "./quarter-math";

export const scheduleLabels = {official:"公式確定",external:"外部サイト予定",provisional:"暫定",unconfirmed:"公式日未確認",official_ir:"公式IR確認済み",exchange:"取引所届出",unknown:"日程未判明",changed:"変更・延期",announced:"発表済み"};
export const emptyGrowth = (note = "比較値なし"): Growth => ({rate:null,label:"—",tone:"neutral",note});
export function growth(current: number | null | undefined, previous: number | null | undefined): Growth {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return emptyGrowth();
  const tone = current > previous ? "positive" : current < previous ? "negative" : "neutral";
  if (previous < 0) return {rate:null,label:current>=0?"黒転":current>previous?"赤縮":current<previous?"赤拡":"赤字横ばい",tone,note:`前年 ${previous} → 当期 ${current}`};
  if (current < 0 && previous > 0) return {rate:null,label:"赤転",tone,note:`前年 ${previous} → 当期 ${current}`};
  if (previous === 0) return emptyGrowth("前年ゼロのため率は非表示");
  const rate = (current-previous)/previous;
  return {rate,label:`${rate>=0?"+":""}${(rate*100).toFixed(1)}%`,tone,note:`前年 ${previous} → 当期 ${current}`};
}
function shiftFiscalEnd(day:string,months:number) {
  const source=new Date(day+"T00:00:00Z"),y=source.getUTCFullYear(),m=source.getUTCMonth(),d=source.getUTCDate();
  const sourceLast=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  const destLast=new Date(Date.UTC(y,m+months+1,0)).getUTCDate();
  return new Date(Date.UTC(y,m+months,d===sourceLast?destLast:Math.min(d,destLast))).toISOString().slice(0,10);
}
export function yearBefore(day: string) { return shiftFiscalEnd(day,-12); }
export function previousTarget(target: TargetQuarter): TargetQuarter {
  return target.quarter === 1 ? {fiscalYearEnd:yearBefore(target.fiscalYearEnd),quarter:4}
    : {...target,quarter:target.quarter-1};
}
export function latestForecast(versions: ForecastVersion[]) {
  // A post-announcement analysis must never silently replace a pre-announcement forecast.
  return versions.filter(v => v.valid && v.preAnnouncement).sort((a,b) => Date.parse(b.asOf)-Date.parse(a.asOf) || Date.parse(b.savedAt)-Date.parse(a.savedAt) || b.id.localeCompare(a.id))[0] ?? null;
}
export function relevantVersions(versions: ForecastVersion[], code: string, date: string, target?: TargetQuarter | null) {
  return versions.filter(v=>v.code===code && (target ? v.target.fiscalYearEnd===target.fiscalYearEnd && v.target.quarter===target.quarter : v.announcementDate===date))
    // Keep the saved version, but never call it a pre-announcement forecast if
    // the newly scheduled date has moved to/before its analysis date (JST).
    .map(v=>({...v,preAnnouncement:v.preAnnouncement&&Date.parse(v.asOf)<Date.parse(`${date}T00:00:00+09:00`)}));
}
function quarterEnd(period: string, quarter: number) {
  return shiftFiscalEnd(period,-(4-quarter)*3);
}
export function previousQuarter(data: FinancialRecord[], target: TargetQuarter | null, date: string,
  industry?: string | null, provenance?: FinancialProvenance[], contexts:ComparisonContext[]=[]): PreviousQuarter {
  const rows = buildFinancialTableModel(data,industry).standaloneRows;
  let wanted = target ? previousTarget(target) : null;
  const notes: string[] = [];
  if (!wanted) {
    // For schedule-only rows use the last completed quarter before the selected announcement.
    // The Viewer also carries non-quarter/legacy period labels. They cannot be
    // used as a calendar date; leave its PL presentation/calculation unchanged.
    const datedRows=rows.filter(r=>/^(?:[123]Q|FY)$/.test(r.quarter) && /^\d{4}-\d{2}-\d{2}$/.test(r.period) && Number.isFinite(Date.parse(r.period)) && new Date(r.period).toISOString().slice(0,10)===r.period);
    if(datedRows.length!==rows.length)notes.push('決算期・四半期表記が不明なPL行はカレンダー比較から除外');
    const candidates = datedRows.filter(r=>quarterEnd(r.period,r.quarter==="FY"?4:Number(r.quarter[0])) < date)
      .sort((a,b)=>quarterEnd(b.period,b.quarter==="FY"?4:Number(b.quarter[0])).localeCompare(quarterEnd(a.period,a.quarter==="FY"?4:Number(a.quarter[0]))));
    if (candidates[0]) wanted = {fiscalYearEnd:candidates[0].period,quarter:candidates[0].quarter==="FY"?4:Number(candidates[0].quarter[0])};
    notes.push("予測対象期未登録のため、選択日より前の最新完了四半期を表示");
  }
  const q = wanted?.quarter === 4 ? "FY" : `${wanted?.quarter}Q`;
  const current = rows.find(r=>r.period===wanted?.fiscalYearEnd && r.quarter===q);
  const prior = rows.find(r=>r.period===yearBefore(wanted?.fiscalYearEnd ?? "0000-01-01") && r.quarter===q);
  const out: PreviousQuarter = {target:wanted, revenueYoY:emptyGrowth(),profitYoY:emptyGrowth(),
    current:current?{revenue:current.sales,operatingProfit:current.profitDisplay.metric==="operating_profit"?current.operatingProfit:null}:null,
    previousYear:prior?{revenue:prior.sales,operatingProfit:prior.profitDisplay.metric==="operating_profit"?prior.operatingProfit:null}:null,notes};
  if (!current || !prior) { notes.push("前Qまたは前年同四半期が不足"); return out; }
  // Review artifacts can veto a comparison, but their historical numbers never feed PL.
  const contextsForQ=contexts.filter(c=>c.quarter===wanted!.quarter && [current.period,prior.period].includes(c.fiscalYearEnd));
  if (["scope","accountingBasis","unit"].some(k=>new Set(contextsForQ.map(c=>c[k as "scope"|"accountingBasis"|"unit"]).filter(Boolean)).size>1)) {
    const note="保存資料の比較条件に会計基準・連結範囲・単位の変更があり、前年比較は非表示";
    notes.push(note);out.revenueYoY=emptyGrowth(note);out.profitYoY=emptyGrowth(note);return out;
  }
  // Source rows for both standalone differences, not just the two final cumulative rows.
  const qs = wanted!.quarter>1 ? [q,`${wanted!.quarter-1}Q`] : [q];
  const inputs = data.filter(r=>!FORECAST_SOURCES.has(r.source) && qs.includes(r.quarter) && [current.period,prior.period].includes(r.period));
  const scopes = new Set(inputs.map(r=>r.consolidation_scope).filter(Boolean));
  const compare = (metric: "sales" | "operating_profit", a:number|null,b:number|null) => {
    if (scopes.size>1) return emptyGrowth("連結範囲の不一致");
    if (!provenance) return emptyGrowth("比較条件の取得未了");
    const matches = inputs.map(r=>provenance.filter(p=>p.ticker===r.ticker && p.period===r.period && p.quarter===r.quarter && p.metric===metric && Number(p.value)===r[metric] && !FORECAST_SOURCES.has(p.source)));
    if (matches.some(m=>m.length===0)) return emptyGrowth("累計差引きの入力値に比較条件が未確認のものがあります");
    const matched = matches.flat();
    const units = new Set(matched.map(p=>["million_yen","millions_jpy","百万円"].includes(p.unit??"")?"million_yen":p.unit).filter(Boolean));
    const knownScopes = new Set(matched.map(p=>p.accounting_scope).filter(x=>x && x!=="unknown"));
    const standards = new Set(matched.map(p=>p.document_type?.match(/IFRS|JGAAP|USGAAP/i)?.[0]?.toUpperCase()).filter(Boolean));
    if (units.size!==1 || !units.has("million_yen")) return emptyGrowth("単位が未確認または不一致");
    if (knownScopes.size>1 || standards.size>1) return emptyGrowth("会計基準・連結範囲の不一致");
    if (!knownScopes.size || !standards.size) {
      if (!notes.includes("既存PLに会計基準・連結範囲の完全な履歴がなく、同一基準比較は未確認")) notes.push("既存PLに会計基準・連結範囲の完全な履歴がなく、同一基準比較は未確認");
    }
    return growth(a,b);
  };
  out.revenueYoY=compare("sales",current.sales,prior.sales);
  out.profitYoY=current.profitDisplay.metric!=="operating_profit" || prior.profitDisplay.metric!=="operating_profit"
    ?emptyGrowth("既存Viewerの利益科目が営業利益以外のため、営業利益YoYは非表示")
    :compare("operating_profit",current.operatingProfit,prior.operatingProfit);
  return out;
}
export type CalendarSort = "code" | "previousRevenue" | "previousProfit" | "forecastRevenue" | "forecastProfit";
export function sortCalendarRows(rows:CalendarRow[],key:CalendarSort,ascending:boolean) {
  const val = (r:CalendarRow) => key==="previousRevenue"?r.previous.revenueYoY.rate:key==="previousProfit"?r.previous.profitYoY.rate:key==="forecastRevenue"?r.forecast?.revenueYoY.rate:r.forecast?.profitYoY.rate;
  return [...rows].sort((a,b)=>{
    if(key==="code") return a.code.localeCompare(b.code)*(ascending?1:-1);
    const x=val(a),y=val(b);
    if(x==null || y==null) return x==null&&y==null?a.code.localeCompare(b.code):x==null?1:-1;
    return (x-y)*(ascending?1:-1)||a.code.localeCompare(b.code);
  });
}
export function resizeCalendar(panes: number[], divider:number, ratio:number) {
  const next = [...panes]; const sum=panes[divider]+panes[divider+1];
  next[divider]=Math.min(sum-.17,Math.max(.17,ratio)); next[divider+1]=sum-next[divider]; return next;
}
