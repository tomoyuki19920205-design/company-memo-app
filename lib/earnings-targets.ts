import type {CalendarSchedule,ForecastVersion,ScheduleCompany,TargetQuarter} from '../types/earnings-calendar';

export interface ForecastTarget {
  code:string; company_name:string; announcement_date:string;
  fiscal_year:string; fiscal_quarter:string; schedule_status:string; source_url:string;
  target_status:'確認済み'|'照合要確認'; forecast_status:'未予測'|'照合要確認';
  financial_link_status:string;
}
export interface TargetExclusion {code:string;companyName:string;reason:string}
export interface ForecastTargets {
  date:string;total:number;forecasted:number;forecastedCodes:string[];count:number;
  needsReview:number;provisional:number;scheduledProvisional:number;
  candidates:ForecastTarget[];excluded:TargetExclusion[];
}
export function validCalendarDate(value:string):boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
const nameKey=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'');
const validTarget=(target:TargetQuarter|null|undefined):target is TargetQuarter=>!!target && validCalendarDate(target.fiscalYearEnd) && Number.isInteger(target.quarter) && target.quarter>=1 && target.quarter<=4;
const targetKey=(code:string,target:TargetQuarter)=>`${code}:${target.fiscalYearEnd}:Q${target.quarter}`;
const confirmedTarget=(s:CalendarSchedule)=>validTarget(s.target) && s.targetConfirmed!==false && s.periodBasis!=='fiscal_calendar_unverified';
const provisional=(s:CalendarSchedule)=>['provisional','unconfirmed','unknown'].includes(s.status);
function officialIdentity(company:ScheduleCompany):boolean {
  try {
    const source=new URL(company.source??'');
    return source.protocol==='https:' && (source.hostname==='jpx.co.jp'||source.hostname.endsWith('.jpx.co.jp')) && company.listingStatus==='listed';
  } catch {return false;}
}

/** Entire selected day, independent of UI filters. No financial, AI, or network calls. */
export function extractForecastTargets(date:string,schedules:CalendarSchedule[],versions:ForecastVersion[],companies:ScheduleCompany[]):ForecastTargets {
  if(!validCalendarDate(date))throw new Error('日付の形式が不正です');
  const master=new Map<string,ScheduleCompany[]>(),day=new Map<string,CalendarSchedule[]>();
  for(const c of companies)master.set(c.code,[...(master.get(c.code)??[]),c]);
  for(const s of schedules)if(s.date===date)day.set(s.code,[...(day.get(s.code)??[]),s]);
  // Quality labels are review outcomes, not registration state. Date changes do not change the target period.
  const registered=new Set(versions.filter(v=>v.valid && validTarget(v.target) && typeof v.revenue==='number' && Number.isFinite(v.revenue) && typeof v.operatingProfit==='number' && Number.isFinite(v.operatingProfit)).map(v=>targetKey(v.code,v.target)));
  const result:ForecastTargets={date,total:day.size,forecasted:0,forecastedCodes:[],count:0,needsReview:0,provisional:0,scheduledProvisional:0,candidates:[],excluded:[]};
  for(const [code,rows] of [...day].sort(([a],[b])=>a.localeCompare(b,'en'))) {
    const s=rows[0],identities=master.get(code)??[];
    if(rows.some(provisional))result.scheduledProvisional++;
    const exclude=(reason:string)=>result.excluded.push({code,companyName:s.companyName,reason});
    // Match the forecast system's code grammar without coercing numeric/leading-zero codes.
    if(!/^[0-9]{3}[0-9A-Z]$/.test(code)){exclude('予測システムの証券コード形式に未対応');continue;}
    if(identities.length!==1 || !officialIdentity(identities[0]) || !identities[0].companyName.trim() || rows.some(r=>nameKey(r.companyName)!==nameKey(identities[0].companyName))) {
      exclude('公式上場企業情報でコード・企業名を一意に照合できません');continue;
    }
    // Do not silently choose one of conflicting periods or confirmation states.
    const periods=new Set(rows.map(r=>JSON.stringify([r.target,confirmedTarget(r),r.quarter??null])));
    if(periods.size!==1){exclude('同日の対象決算期・確認状態が競合しています。原資料で照合してください');continue;}
    const known=confirmedTarget(s);
    // Aliases are not sufficient issuer/period evidence for automatic suppression.
    if(known && registered.has(targetKey(code,s.target!))) {
      result.forecasted++;result.forecastedCodes.push(code);continue;
    }
    const tentative=rows.some(provisional);
    const status=tentative?'暫定':s.status;
    // For an unverified fiscal year, keep only the independently observed Q label (if present).
    const observedQuarter=Number.isInteger(s.quarter) && s.quarter!>=1 && s.quarter!<=4?String(s.quarter):'';
    result.candidates.push({code,company_name:identities[0].companyName,announcement_date:date,
      fiscal_year:known?s.target!.fiscalYearEnd.slice(0,4):'',fiscal_quarter:known?String(s.target!.quarter):observedQuarter,
      schedule_status:status,source_url:s.source,target_status:known?'確認済み':'照合要確認',
      forecast_status:known?'未予測':'照合要確認',financial_link_status:s.financialLinkStatus==='hold'?'財務連動保留':'通常'});
    if(!known)result.needsReview++;
    if(tentative)result.provisional++;
  }
  result.count=result.candidates.length;
  return result;
}

export const targetCsvColumns=['code','company_name','announcement_date','fiscal_year','fiscal_quarter','schedule_status','source_url','target_status','forecast_status','financial_link_status'] as const;
function csvCell(value:string):string {
  // Excel formulas can follow whitespace/control characters. Never generate formula-based code cells.
  const safe=/^[\s\u0000-\u001f\u007f\ufeff]*[=+@-]/u.test(value)?`'${value}`:value;
  return `"${safe.replace(/"/g,'""')}"`;
}
export function forecastTargetsCsv(targets:ForecastTargets):string {
  return '\ufeff'+[targetCsvColumns.join(','),...targets.candidates.map(row=>targetCsvColumns.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';
}
export function forecastTargetsFilename(date:string):string {
  if(!validCalendarDate(date))throw new Error('日付の形式が不正です');
  return `earnings_targets_${date}.csv`;
}
