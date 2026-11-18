export type ScheduleStatus = "official" | "external" | "provisional" | "unconfirmed" | "official_ir" | "exchange" | "unknown" | "changed" | "announced";
export interface TargetQuarter { fiscalYearEnd: string; quarter: number }
export interface ComparisonContext { fiscalYearEnd:string; quarter:number; scope:string; accountingBasis:string; unit:string; sourceIds:string[] }
export interface CalendarSchedule {
  code: string; companyName: string; date: string; status: ScheduleStatus;
  target: TargetQuarter | null; source: string; updatedAt: string;
  id?:string; announcementTime?:string|null; quarter?:number|null; targetConfirmed?:boolean;
  confirmationStatus?:ScheduleStatus; checkedAt?:string; sourcePublishedAt?:string|null;
  firstRegisteredAt?:string; actualDate?:string|null; note?:string; periodBasis?:string;
  codeAliases?:string[];
  financialLinkStatus?:'verified'|'hold'; financialLinkNote?:string;
  history?:{changedAt:string;before:Partial<CalendarSchedule>}[];
}
export interface ScheduleOverview {
  updatedAt:string; masterAsOf:string; period:{from:string;to:string}; coverage:string; coverageNote:string;
  stats:{master:number;registeredCompanies:number;confirmedCompanies:number;officialIr:number;exchange:number;provisional:number;unknown:number;failed:number;checked:number;notChecked:number;periodUnverified:number};
  sources:{url:string;terms:string;checkedAt:string;type:string}[];
}
export interface UnresolvedCompany {code:string;companyName:string;reason:string;collectionStatus:string;checkedAt:string}
export interface CompanyIdentityReview {
  code:string;companyName:string;viewerCode:string|null;viewerName:string|null;
  status:'verified'|'hold';reason:string;sourceUrls:string[];checkedAt:string;
}
export interface ScheduleCompany {
  code:string;companyName:string;viewerMatch:string;viewerCode:string|null;viewerName:string|null;
  source?:string;listingStatus?:string;
  viewerIdentityReview?:CompanyIdentityReview;
}
export interface ScheduleRegistry extends ScheduleOverview {schemaVersion:number;schedules:CalendarSchedule[];unresolved:UnresolvedCompany[];companies?:ScheduleCompany[]}
export interface DayScheduleCount {count:number;statuses:Partial<Record<ScheduleStatus,number>>;coverage:"partial"|"uncollected"|"confirmed_zero"}
export interface Growth { rate: number | null; label: string; tone: "positive" | "negative" | "neutral"; note: string }
export interface ForecastVersion {
  id: string; code: string; companyName: string; announcementDate: string;
  target: TargetQuarter; asOf: string; version: string; savedAt: string;
  quality: string; reviewExecuted: boolean; reviewPassed: boolean;
  valid: boolean; preAnnouncement: boolean;
  revenue: number | null; operatingProfit: number | null;
  revenueYoY: Growth; profitYoY: Growth;
}
export interface ForecastDetail extends ForecastVersion {
  markdown: string; reviewMarkdown: string;
  result: Record<string, unknown>; review: Record<string, unknown>;
  issues: Record<string, string>[]; assumptions: Record<string, string>[];
  guidance: Record<string, string>[]; scheduleCheck: Record<string, string> | null;
  sourceHashes: Record<string, string>;
}
export interface PreviousQuarter {
  target: TargetQuarter | null; revenueYoY: Growth; profitYoY: Growth;
  current: { revenue: number | null; operatingProfit: number | null } | null;
  previousYear: { revenue: number | null; operatingProfit: number | null } | null;
  notes: string[];
}
export interface CalendarRow extends CalendarSchedule {
  forecast: ForecastVersion | null; previous: PreviousQuarter;
  financialsAvailable: boolean | null; financeError?: string;
}
