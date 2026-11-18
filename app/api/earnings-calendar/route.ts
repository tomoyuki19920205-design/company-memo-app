import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { readForecast, readForecastIndex, readSchedules, readComparisonContexts, readRegistry } from "@/lib/earnings-calendar-store";
import {countMonth,daySchedules,overviewOf} from '@/lib/earnings-schedules';
import {extractForecastTargets,forecastTargetsCsv,forecastTargetsFilename} from '@/lib/earnings-targets';
import {loadCalendarBatches} from '@/lib/earnings-calendar-batch';
import { latestForecast, previousQuarter, relevantVersions, emptyGrowth } from "@/lib/earnings-calendar";
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
    const registry=await readRegistry(),overview=overviewOf(registry);
    if(p.get('mode')==='unresolved') return reply({companies:registry?.unresolved??[],overview});
    if (month) {
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return reply({error:"月の形式が不正です"},400);
      const days=countMonth(schedules,month);
      const counts=Object.fromEntries(Object.entries(days).map(([d,v])=>[d,v.count]));
      return reply({counts,days,overview});
    }
    if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) return reply({error:"日付の形式が不正です"},400);
    const scheduled=daySchedules(schedules,date);
    const index=await readForecastIndex();
    if(p.get('mode')==='targets') {
      const targets=extractForecastTargets(date,schedules,index,registry?.companies??[]);
      if(p.get('format')!=='csv')return reply(targets);
      return new NextResponse(forecastTargetsCsv(targets),{headers:{
        'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${forecastTargetsFilename(date)}"`,
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(code) {
      const company=scheduled.find(s=>s.code===code);
      if(!company) return reply({error:"この日の予定企業ではありません"},404);
      const versions=company.financialLinkStatus==='hold'?[]:[code,...(company.codeAliases??[])].flatMap(c=>relevantVersions(index,c,date,company.target));
      const selected=version?versions.find(v=>v.id===version):latestForecast(versions);
      if(version&&!selected) return reply({error:"予測バージョンが見つかりません"},404);
      const saved=selected?await readForecast(selected.id):null;
      return reply({versions,detail:saved?{...saved,preAnnouncement:selected!.preAnnouncement}:null});
    }
    if(!scheduled.length) return reply({rows:[],date,overview,coverage:'uncollected'});
    const codes=scheduled.filter(s=>s.financialLinkStatus!=='hold').map(s=>s.code);
    let financeError:string|undefined;
    let data=new Map(); let provenance:Awaited<ReturnType<typeof loadFinancialProvenance>>|undefined;
    const industries=new Map<string,string>();
    let financialErrors=new Map<string,string>();
    try {
      const from=`${Math.min(...scheduled.map(s=>Number(s.target?.fiscalYearEnd.slice(0,4)??date.slice(0,4))))-2}-01-01`;
      // The common loader/calculation stays unchanged; only calendar request scheduling differs.
      provenance=[];
      const loaded=await loadCalendarBatches(codes,async group=>{
          const [financials,meta,companies]=await Promise.all([loadFinancialsBatch(supabase,group),loadFinancialProvenance(supabase,group,from),supabase.from('companies').select('ticker_code,industry').in('ticker_code',group)]);
          if(companies.error)throw new Error('業種情報の取得に失敗しました');
          return {financials,meta,companies:companies.data??[]};
      });
      financialErrors=loaded.errors;
      if(financialErrors.size)financeError=`${financialErrors.size}社の財務取得が未了です。各社の比較条件を確認してください。`;
        for(const {value:result} of loaded.results) {
          for(const [ticker,records] of result.financials)data.set(ticker,records);
          provenance.push(...result.meta);
          for(const c of result.companies)industries.set(c.ticker_code,c.industry);
        }
    } catch(e) { financeError=e instanceof Error?e.message:"財務取得エラー";for(const code of codes)financialErrors.set(code,financeError); }
    const contexts=await readComparisonContexts();
    const metaByTicker=new Map<string,NonNullable<typeof provenance>>();
    for(const m of provenance??[]) {const group=metaByTicker.get(m.ticker)??[];group.push(m);metaByTicker.set(m.ticker,group);}
    const rows:CalendarRow[]=scheduled.map(s=>{
      const held=s.financialLinkStatus==='hold';
      const forecast=held?null:latestForecast([s.code,...(s.codeAliases??[])].flatMap(c=>relevantVersions(index,c,date,s.target)));
      let rowError=financialErrors.get(s.code);
      let previous:CalendarRow['previous']={target:null,current:null,previousYear:null,revenueYoY:emptyGrowth(),profitYoY:emptyGrowth(),notes:['対象決算年が未確認のため前Q比較を保留']};
      try {
        if(held)previous.notes=[s.financialLinkNote??'企業対応未確認のため財務連動を保留'];
        else if(s.target)previous=previousQuarter(data.get(s.code)??[],s.target,date,industries.get(s.code),provenance?metaByTicker.get(s.code)??[]:undefined,contexts[forecast?.id??""]??[]);
        if(s.targetConfirmed===false)previous.notes.push('対象年は期末日とQ表記の暦対応。決算期変更の有無は未照合');
      } catch(e) {rowError=`前Q比較未了: ${e instanceof Error?e.message:'比較条件エラー'}`;}
      return {...s,forecast,previous,
      financialsAvailable:held?false:financialErrors.has(s.code)?null:(data.get(s.code)?.length??0)>0,financeError:rowError};});
    return reply({rows,date,financeError,overview,coverage:'partial'});
  } catch(e) {
    console.error("[earnings-calendar]",e instanceof Error?e.message:e);
    return reply({error:"カレンダーデータを取得できませんでした"},500);
  }
}
