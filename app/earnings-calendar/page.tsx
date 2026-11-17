import EarningsCalendar from "@/components/EarningsCalendar";
import { readSchedules } from "@/lib/earnings-calendar-store";
import "./calendar.css";
export const dynamic="force-dynamic";
export default async function EarningsCalendarPage() {
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const dates=[...new Set((await readSchedules()).map(s=>s.date))].sort();
  return <EarningsCalendar initialDate={dates.find(d=>d>=today)??dates.at(-1)??today} />;
}
