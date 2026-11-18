import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { CalendarSchedule, ForecastDetail, ForecastVersion, ComparisonContext, ScheduleRegistry } from "../types/earnings-calendar";
import {mergeSchedules,applyIdentityReviews} from './earnings-schedules';

// Server-only filesystem adapter. Never import this module from a client component.
// Vercel receives a read-only build bundle; the offline importer updates it before deployment.
const root = () => process.env.EARNINGS_CALENDAR_DATA_DIR || path.join(process.cwd(),"server-data","earnings-calendar");
async function json<T>(name:string, fallback:T):Promise<T> {
  try { return JSON.parse(await readFile(path.join(root(),name),"utf8")); }
  catch(e) { if ((e as NodeJS.ErrnoException).code==="ENOENT") return fallback; throw e; }
}
let cached:{key:string;value:ScheduleRegistry}|null=null;
export async function readRegistry():Promise<ScheduleRegistry|null> {
  const file=path.join(root(),'registry.json');
  try {
    const info=await stat(file),key=`${file}:${info.mtimeMs}:${info.size}`;
    if(cached?.key===key)return cached.value;
    const value=await json<ScheduleRegistry>('registry.json',null as unknown as ScheduleRegistry);
    if(value.schemaVersion!==2 || !Array.isArray(value.schedules))throw new Error('Unsupported schedule registry');
    cached={key,value};return value;
  } catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
export async function readSchedules() {
  const [legacy,registry]=await Promise.all([json<CalendarSchedule[]>('schedules.json',[]),readRegistry()]);
  return applyIdentityReviews(mergeSchedules(legacy,registry?.schedules??[]),registry);
}
export const readForecastIndex = () => json<ForecastVersion[]>("index.json",[]);
export const readComparisonContexts = () => json<Record<string,ComparisonContext[]>>("comparison-contexts.json",{});
export async function readForecast(id:string) {
  if (!/^[0-9][0-9A-Z]{3}-[a-f0-9]{64}$/.test(id)) return null;
  return json<ForecastDetail|null>(`details/${id}.json`,null);
}
