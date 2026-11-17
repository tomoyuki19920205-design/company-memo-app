import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { readForecast, readForecastIndex, readSchedules, readComparisonContexts } from "@/lib/earnings-calendar-store";
import { latestForecast, previousQuarter, relevantVersions } from "@/lib/earnings-calendar";
import { loadFinancialsBatch, loadFinancialProvenance } from "@/lib/financial-loader";
import type { CalendarRow } from "@/types/earnings-calendar";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:NextRequest) {
  const cookieStore=await cookies();
  const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    cookies:{getAll:()=>cookieStore.getAll(),setAll:()=>undefined}});
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user) return reply({error:"ログインが必要です"},401);
  const p=request.nextUrl.searchParams;
  const month=p.get("month"),date=p.get("date"),code=p.get("code"),version=p.get("version");
  try {
    const schedules=await readSchedules();
    if (month) {
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return reply({error:"月の形式が不正です"},400);
      const counts:Record<string,number>={};
      for(const row of schedules.filter(s=>s.date.startsWith(month+"-"))) counts[row.date]=(counts[row.date]??0)+1;
      return reply({counts});
    }
    if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) return reply({error:"日付の形式が不正です"},400);
    const scheduled=schedules.filter(s=>s.date===date);
    const index=await readForecastIndex();
    if(code) {
      const company=scheduled.find(s=>s.code===code);
      if(!company) return reply({error:"この日の予定企業ではありません"},404);
      const versions=relevantVersions(index,code,date,company.target);
      const selected=version?versions.find(v=>v.id===version):latestForecast(versions);
      if(version&&!selected) return reply({error:"予測バージョンが見つかりません"},404);
      return reply({versions,detail:selected?await readForecast(selected.id):null});
    }
    if(!scheduled.length) return reply({rows:[],date});
    const codes=scheduled.map(s=>s.code);
    let financeError:string|undefined;
    let data=new Map(); let provenance:Awaited<ReturnType<typeof loadFinancialProvenance>>|undefined;
    const industries=new Map<string,string>();
    try {
      data=await loadFinancialsBatch(supabase,codes);
      const from=`${Math.min(...scheduled.map(s=>Number(s.target?.fiscalYearEnd.slice(0,4)??date.slice(0,4))))-2}-01-01`;
      const [meta,companies]=await Promise.all([loadFinancialProvenance(supabase,codes,from),supabase.from("companies").select("ticker_code,industry").in("ticker_code",codes)]);
      provenance=meta;
      for(const c of companies.data??[]) industries.set(c.ticker_code,c.industry);
    } catch(e) { financeError=e instanceof Error?e.message:"財務取得エラー"; }
    const contexts=await readComparisonContexts();
    const rows:CalendarRow[]=scheduled.map(s=>{
      const forecast=latestForecast(relevantVersions(index,s.code,date,s.target));
      return {...s,forecast,previous:previousQuarter(data.get(s.code)??[],s.target,date,industries.get(s.code),provenance,contexts[forecast?.id??""]??[]),
      financialsAvailable:financeError?null:(data.get(s.code)?.length??0)>0,financeError};});
    return reply({rows,date,financeError});
  } catch(e) {
    console.error("[earnings-calendar]",e instanceof Error?e.message:e);
    return reply({error:"カレンダーデータを取得できませんでした"},500);
  }
}
