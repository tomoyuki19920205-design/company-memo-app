import type {CalendarSchedule,DayScheduleCount,ScheduleRegistry,ScheduleOverview} from '../types/earnings-calendar';

export const scheduleIdentity=(s:CalendarSchedule)=>s.target?`${s.code}:${s.target.fiscalYearEnd}:Q${s.target.quarter}`:s.id??`${s.code}:${s.date}:unresolved`;
export function mergeSchedules(legacy:CalendarSchedule[],registry:CalendarSchedule[]) {
  const map=new Map(legacy.map(s=>[scheduleIdentity(s),s]));
  for(const s of registry) {
    for(const alias of s.codeAliases??[]) if(s.target) map.delete(`${alias}:${s.target.fiscalYearEnd}:Q${s.target.quarter}`);
    map.set(scheduleIdentity(s),s);
  }
  return [...map.values()];
}
export function countMonth(schedules:CalendarSchedule[],month:string):Record<string,DayScheduleCount> {
  const days=new Map<string,Map<string,CalendarSchedule>>();
  for(const row of schedules) if(row.date.startsWith(month+'-')) {
    const codes=days.get(row.date)??new Map();codes.set(row.code,row);days.set(row.date,codes);
  }
  return Object.fromEntries([...days].map(([date,codes])=>{
    const statuses:DayScheduleCount['statuses']={};
    for(const r of codes.values()) statuses[r.status]=(statuses[r.status]??0)+1;
    return [date,{count:codes.size,statuses,coverage:'partial'}];
  }));
}
export function daySchedules(schedules:CalendarSchedule[],date:string) {
  const map=new Map<string,CalendarSchedule>();
  for(const row of schedules.filter(s=>s.date===date)) {
    const old=map.get(row.code);
    // Rare multiple periods on one day are surfaced; never duplicate company rows/counts.
    map.set(row.code,old?{...row,note:[row.note,'同日の対象決算期が複数あります。予定履歴・原資料を確認してください。'].filter(Boolean).join(' ')}:row);
  }
  return [...map.values()];
}
export function overviewOf(r:ScheduleRegistry|null):ScheduleOverview|null {
  if(!r)return null;
  return {updatedAt:r.updatedAt,masterAsOf:r.masterAsOf,period:r.period,coverage:r.coverage,coverageNote:r.coverageNote,stats:r.stats,sources:r.sources};
}
