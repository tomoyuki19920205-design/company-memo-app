"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { countTodayPublished, jstDayWindow, uniqueCards, validDetail, type AnalysisSummary, type AnalysisDetail, type DisclosureNotice } from "@/lib/opacc-v2";
import { verifiedPDFLink } from "@/lib/opacc-pdf-links";

export function AccelerationCard({ card, open }: { card: AnalysisSummary; open: () => void }) {
  const calc = card.calculation;
  return <article style={{padding:12, margin:8, border:"1px solid #8196ac", borderRadius:8}}>
    <button onClick={open} style={{textAlign:"left", width:"100%", background:"transparent", color:"inherit", border:0, cursor:"pointer"}}>
      <strong>{card.company_name}（{card.ticker}）</strong><br />
      {card.period.fy_end}期 第{card.period.quarter}四半期 · 営業利益YoY加速<br />
      加速幅 {Number(calc.verified_acceleration_pt).toFixed(2)} pt ／ 利益前年差の改善額 {(Number(calc.profit_yoy_change_improvement_yen)/1000000).toFixed(3)} 百万円<br />
      <small>{calc.classification} · {card.verification}</small><br />
      {card.factor}<br /><small>考察完成：{new Date(card.completed_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} JST</small>
    </button>
  </article>;
}
type PDFStatus = "idle" | "checking" | "available" | "unavailable";
const pdfChecks = new Map<string, {at: number; request: Promise<boolean>}>();
function checkPDF(sha: string): Promise<boolean> {
  const cached=pdfChecks.get(sha);
  if(cached && Date.now()-cached.at<15000) return cached.request;
  const request=fetch(`/api/opacc-pdf?sha=${encodeURIComponent(sha)}`,{cache:"no-store",signal:AbortSignal.timeout(9000)})
    .then(async r=>r.ok && (await r.json()).available===true).catch(()=>false);
  pdfChecks.set(sha,{at:Date.now(),request});return request;
}
export function CitationPDF({source,page,quote}: {source: AnalysisDetail["source_index"][number] | undefined;page:number;quote:string}) {
  const [status,setStatus]=useState<PDFStatus>("idle");
  const current=useRef(0);
  const url=source ? verifiedPDFLink(source,page) : undefined;
  useEffect(()=>()=>{current.current++;},[]);
  const check=async()=>{
    const id=++current.current;
    if(!source || !url){setStatus("unavailable");return;}
    setStatus("checking");const available=await checkPDF(source.sha256);
    if(id===current.current)setStatus(available?"available":"unavailable");
  };
  return <details onToggle={e=>{if(e.currentTarget.open)void check();}}>
    <summary>{source?.id} p.{page} — {source?.title}</summary>
    {status==="available" && url ? <><a href={url} target="_blank" rel="noopener noreferrer">原本PDFを開く</a><small>（IR BANK掲載・保存原本と同一PDF）</small></>
      : status==="unavailable" ? <p role="status">この引用のPDFは現在利用不可です。引用原文は以下で確認できます。<button onClick={()=>void check()}>再確認</button></p>
      : <p role="status">原本PDFを確認中...</p>}
    <blockquote style={{whiteSpace:"pre-wrap"}}>{quote}</blockquote>
  </details>;
}
export function AccelerationDetail({ detail, onOpenPL }: { detail: AnalysisDetail; onOpenPL?: (ticker: string) => void }) {
  return <div>
    <h3>{detail.company_name}（{detail.ticker}）</h3>
    {onOpenPL && <button onClick={() => onOpenPL(detail.ticker)}>この企業のPLを表示</button>}
    <p>{detail.calculation.classification_scope}</p><p>{detail.calculation.classification_note}</p>
    <h4>原本照合済みの企業PL・単独四半期</h4><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{detail.pl}</pre>
    {detail.analysis.sections.map((s,i) => <section key={i}><h4>{s.heading}</h4>{s.paragraphs.map((p,j)=><p key={j}>{p}</p>)}</section>)}
    <h4>検証上の制約</h4><ul>{detail.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>
    <h4>引用原文</h4>{detail.analysis.evidence.map((e,i)=><CitationPDF key={i} source={detail.source_index.find(s=>s.id===e.source_id)} page={e.page} quote={e.quote}/>)}
  </div>;
}
function Feed({onOpenPL}: {onOpenPL?: (ticker: string) => void}) {
  const enabled=process.env.NEXT_PUBLIC_OPACC_V2_DISPLAY_ENABLED === "1";
  const [cards,setCards]=useState<AnalysisSummary[]>([]);
  const [expanded,setExpanded]=useState(false);
  const panelId=useId();
  const [notices,setNotices]=useState<DisclosureNotice[]>([]);
  const [now,setNow]=useState(()=>Date.now());
  const [detail,setDetail]=useState<AnalysisDetail|null>(null);
  const requestId=useRef(0);
  const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if (!enabled) return;
    let alive=true;let inFlight=false;
    const load=async()=>{
      if(inFlight)return;
      inFlight=true;const checkedAt=Date.now();setNow(checkedAt);
      try {
        const client=createSupabaseBrowser();const summaries:unknown[]=[];
        for(let offset=0;;offset+=100){
          const {data,error}=await client.from("opacc_v2_cards").select("summary").order("completed_at",{ascending:false}).order("card_id").range(offset,offset+99);
          if(error)throw error;
          summaries.push(...(data??[]).map(x=>x.summary));
          if((data??[]).length<100)break;
        }
        const published=uniqueCards(summaries);
        if(!alive)return;
        setCards(published);setError("");
        // Independent of the normal notification pane's date, search and category filters.
        const tickers=[...new Set(published.filter(c=>/^\d{14}$/.test(c.disclosure_id??"")).map(c=>c.ticker))];
        const day=jstDayWindow(checkedAt);const today:DisclosureNotice[]=[];
        try {
          for(let i=0;i<tickers.length;i+=50){
            for(let offset=0;;offset+=100){
              const {data,error}=await client.from("tdnet_events").select("ticker,disclosed_at,pdf_url,source_url")
                .in("ticker",tickers.slice(i,i+50)).gte("disclosed_at",new Date(day.start).toISOString()).lt("disclosed_at",new Date(day.end).toISOString())
                .order("disclosed_at",{ascending:false}).order("id").range(offset,offset+99);
              if(error)throw error;
              today.push(...(data??[]));if((data??[]).length<100)break;
            }
          }
          if(alive)setNotices(today);
        } catch {if(alive)setNotices([]);} // Unknown disclosure dates must not create a new badge.
      } catch { if (alive) {setNotices([]);setError("利益加速の分析情報を取得できません。通常の決算通知は利用できます。");} }
      finally {inFlight=false;}
    };
    const refresh=()=>{if(document.visibilityState==="visible")void load();};
    let dayTimer:ReturnType<typeof setTimeout>;
    const tickDay=()=>{const time=Date.now();setNow(time);dayTimer=setTimeout(tickDay,jstDayWindow(time).end-time+10);};
    tickDay();document.addEventListener("visibilitychange",refresh);
    void load();const timer=setInterval(()=>void load(),60000);
    return ()=>{alive=false;requestId.current++;clearInterval(timer);clearTimeout(dayTimer);document.removeEventListener("visibilitychange",refresh);};
  },[enabled]);
  if (!enabled) return null;
  const open=async(card: AnalysisSummary)=>{
    const current=++requestId.current;
    setLoading(true);setDetail(null);
    try {
      const {data,error}=await createSupabaseBrowser().from("opacc_v2_cards").select("payload").eq("card_id",card.card_id).eq("revision",card.revision).single();
      if (current!==requestId.current) return;
      if (error || !validDetail(data?.payload,card)) throw new Error("detail unavailable");
      setDetail(data.payload);setError("");
    } catch { if (current===requestId.current) setError("考察の取得・検証に失敗しました。カードの更新後に再度お試しください。"); }
    finally {if (current===requestId.current) setLoading(false);}
  };
  const newCount=countTodayPublished(cards,notices,now);
  const label=`営業利益YoY加速分析（${cards.length}件）${newCount>0 ? ` 新着あり ${newCount}件` : ""}`;
  return <section aria-label="営業利益YoY加速の分析" style={{minWidth:0,flexShrink:0}}>
    <button type="button" aria-expanded={expanded} aria-controls={panelId} aria-label={label} title={label}
      onClick={()=>{setExpanded(v=>!v);if(expanded){requestId.current++;setDetail(null);setLoading(false);}}}
      style={{display:"flex",alignItems:"center",gap:5,width:"100%",minWidth:0,boxSizing:"border-box",padding:"8px 10px",border:0,borderBottom:"1px solid var(--border,#8196ac)",background:"var(--card-bg,transparent)",color:"inherit",fontSize:12,lineHeight:"18px",textAlign:"left",cursor:"pointer"}}>
      <span aria-hidden="true" style={{flexShrink:0}}>{expanded ? "▼" : "▶"}</span>
      <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>営業利益YoY加速分析</span>
      <span style={{flexShrink:0,whiteSpace:"nowrap"}}>（{cards.length}件）</span>
      {newCount>0 && <span style={{marginLeft:"auto",flexShrink:0,whiteSpace:"nowrap",fontSize:11,color:"var(--warning,#b45309)"}}>● 新着あり {newCount}件</span>}
    </button>
    <div id={panelId} hidden={!expanded} style={{maxHeight:"min(42vh,420px)",overflowY:"auto",overscrollBehavior:"contain"}}>
    {error && <p role="status">{error}</p>}{loading && <p role="status">考察を読み込み中...</p>}
    {cards.map(card=><AccelerationCard key={card.card_id} card={card} open={()=>void open(card)} />)}
    </div>
    {detail && <dialog open aria-label="営業利益加速の考察全文" style={{position:"fixed",inset:24,zIndex:1100,maxWidth:960,width:"90vw",maxHeight:"90vh",overflowY:"auto",background:"var(--bg-primary,white)",color:"var(--text-primary,#172a3c)"}}>
      <button onClick={()=>{requestId.current++;setDetail(null);}}>閉じる</button><AccelerationDetail detail={detail} onOpenPL={onOpenPL ? ticker=>{requestId.current++;setDetail(null);onOpenPL(ticker);} : undefined}/>
    </dialog>}
  </section>;
}
class FeedBoundary extends React.Component<{children: React.ReactNode},{failed:boolean}> {
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <p role="status">利益加速分析の表示を保留しています。</p> : this.props.children;}
}
export default function AccelerationFeed({onOpenPL}: {onOpenPL?: (ticker: string) => void}){return <FeedBoundary><Feed onOpenPL={onOpenPL}/></FeedBoundary>;}
