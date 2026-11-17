export type ScheduleStatus = "official" | "external" | "provisional" | "unconfirmed";
export interface TargetQuarter { fiscalYearEnd: string; quarter: number }
export interface ComparisonContext { fiscalYearEnd:string; quarter:number; scope:string; accountingBasis:string; unit:string; sourceIds:string[] }
export interface CalendarSchedule {
  code: string; companyName: string; date: string; status: ScheduleStatus;
  target: TargetQuarter | null; source: string; updatedAt: string;
}
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
