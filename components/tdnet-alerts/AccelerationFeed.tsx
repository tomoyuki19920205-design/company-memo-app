"use client";
import React, { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { uniqueCards, safeSourceURL, validDetail, type AnalysisSummary, type AnalysisDetail } from "@/lib/opacc-v2";

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
export function AccelerationDetail({ detail }: { detail: AnalysisDetail }) {
  return <div>
    <h3>{detail.company_name}（{detail.ticker}）</h3>
    <p>{detail.calculation.classification_scope}</p><p>{detail.calculation.classification_note}</p>
    <h4>原本照合済みの企業PL・単独四半期</h4><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{detail.pl}</pre>
    {detail.analysis.sections.map((s,i) => <section key={i}><h4>{s.heading}</h4>{s.paragraphs.map((p,j)=><p key={j}>{p}</p>)}</section>)}
    <h4>検証上の制約</h4><ul>{detail.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>
    <h4>引用原文</h4>{detail.analysis.evidence.map((e,i)=>{
      const source=detail.source_index.find(s=>s.id===e.source_id);const url=source ? safeSourceURL(source.url) : undefined;
      return <details key={i}><summary>{e.source_id} p.{e.page} — {source?.title}</summary>
        {url && <a href={`${url.split("#")[0]}#page=${e.page}`} target="_blank" rel="noopener noreferrer">原本PDFを開く</a>}
        <blockquote style={{whiteSpace:"pre-wrap"}}>{e.quote}</blockquote></details>;
    })}
  </div>;
}
function Feed() {
  const enabled=process.env.NEXT_PUBLIC_OPACC_V2_DISPLAY_ENABLED === "1";
  const [cards,setCards]=useState<AnalysisSummary[]>([]);
  const [detail,setDetail]=useState<AnalysisDetail|null>(null);
  const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if (!enabled) return;
    let alive=true;
    const load=async()=>{
      try {
        const {data,error}=await createSupabaseBrowser().from("opacc_v2_cards").select("summary").order("completed_at",{ascending:false}).limit(30);
        if (error) throw error;
        if (alive) { setCards(uniqueCards((data??[]).map(x=>x.summary)));setError(""); }
      } catch { if (alive) setError("利益加速の分析情報を取得できません。通常の決算通知は利用できます。"); }
    };
    void load();const timer=setInterval(()=>void load(),60000);
    return ()=>{alive=false;clearInterval(timer);};
  },[enabled]);
  if (!enabled) return null;
  const open=async(card: AnalysisSummary)=>{
    setLoading(true);setDetail(null);
    try {
      const {data,error}=await createSupabaseBrowser().from("opacc_v2_cards").select("payload").eq("card_id",card.card_id).eq("revision",card.revision).single();
      if (error || !validDetail(data?.payload,card)) throw new Error("detail unavailable");
      setDetail(data.payload);setError("");
    } catch { setError("考察の取得・検証に失敗しました。カードの更新後に再度お試しください。"); }
    finally {setLoading(false);}
  };
  return <section aria-label="営業利益YoY加速の分析" style={{maxHeight:"48vh",overflowY:"auto"}}>
    <h3 style={{margin:12}}>営業利益YoY加速の分析</h3>
    {error && <p role="status">{error}</p>}{loading && <p role="status">考察を読み込み中...</p>}
    {cards.map(card=><AccelerationCard key={card.card_id} card={card} open={()=>void open(card)} />)}
    {detail && <dialog open aria-label="営業利益加速の考察全文" style={{position:"fixed",inset:24,zIndex:1100,maxWidth:960,width:"90vw",maxHeight:"90vh",overflowY:"auto",background:"var(--bg-primary,white)",color:"var(--text-primary,#172a3c)"}}>
      <button onClick={()=>setDetail(null)}>閉じる</button><AccelerationDetail detail={detail}/>
    </dialog>}
  </section>;
}
class FeedBoundary extends React.Component<{children: React.ReactNode},{failed:boolean}> {
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <p role="status">利益加速分析の表示を保留しています。</p> : this.props.children;}
}
export default function AccelerationFeed(){return <FeedBoundary><Feed/></FeedBoundary>;}
