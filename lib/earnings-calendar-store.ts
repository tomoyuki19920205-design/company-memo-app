import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CalendarSchedule, ForecastDetail, ForecastVersion, ComparisonContext } from "../types/earnings-calendar";

// Server-only filesystem adapter. Never import this module from a client component.
// Vercel receives a read-only build bundle; the offline importer updates it before deployment.
const root = () => process.env.EARNINGS_CALENDAR_DATA_DIR || path.join(process.cwd(),"server-data","earnings-calendar");
async function json<T>(name:string, fallback:T):Promise<T> {
  try { return JSON.parse(await readFile(path.join(root(),name),"utf8")); }
  catch(e) { if ((e as NodeJS.ErrnoException).code==="ENOENT") return fallback; throw e; }
}
export const readSchedules = () => json<CalendarSchedule[]>("schedules.json",[]);
export const readForecastIndex = () => json<ForecastVersion[]>("index.json",[]);
export const readComparisonContexts = () => json<Record<string,ComparisonContext[]>>("comparison-contexts.json",{});
export async function readForecast(id:string) {
  if (!/^[0-9][0-9A-Z]{3}-[a-f0-9]{64}$/.test(id)) return null;
  return json<ForecastDetail|null>(`details/${id}.json`,null);
}
