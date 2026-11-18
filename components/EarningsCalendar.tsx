"use client";
import React,{useEffect,useMemo,useRef,useState} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import TopNavigation from "./TopNavigation";
import CompanyViewer,{type CompanyViewerHandle} from "./CompanyViewer";
import EarningsReportMarkdown from "./EarningsReportMarkdown";
import EarningsTargetsExport from "./EarningsTargetsExport";
import type {CalendarRow,ForecastDetail,ForecastVersion,Growth,ScheduleOverview,DayScheduleCount,UnresolvedCompany} from "@/types/earnings-calendar";
import {scheduleLabels,sortCalendarRows,resizeCalendar,type CalendarSort} from "@/lib/earnings-calendar";

const api="/api/earnings-calendar";
async function read<T>(params:Record<string,string>,signal?:AbortSignal):Promise<T> {
  const response=await fetch(`${api}?${new URLSearchParams(params)}`,{signal,cache:"no-store"});
  if(response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw new Error("ログインが必要です");
  const body=await response.json();
  if(!response.ok) throw new Error(body.error??"取得に失敗しました"); return body;
}
const dateLabel=(date:string)=>new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",timeZone:"Asia/Tokyo"}).format(new Date(date+"T00:00:00+09:00"));
function GrowthCell({value,missing=false}:{value?:Growth,missing?:boolean}) {
  return <span className={`ec-growth ${value?.tone??"neutral"}`} title={value?.note}>{missing?"未予測":value?.label??"—"}</span>;
}
function DataTable({rows}:{rows:Record<string,string>[]}) {
  if(!rows.length) return <p className="ec-muted">登録なし</p>;
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  return <div className="ec-table-scroll"><table><thead><tr>{keys.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{keys.map(k=><td key={k}>{row[k]}</td>)}</tr>)}</tbody></table></div>;
}
export default function EarningsCalendar({initialDate}:{initialDate:string}) {
  const [date,setDate]=useState(initialDate),[month,setMonth]=useState(initialDate.slice(0,7));
  const [open,setOpen]=useState(false),[counts,setCounts]=useState<Record<string,number>>({});
  const [monthError,setMonthError]=useState("");
  const [dayCounts,setDayCounts]=useState<Record<string,DayScheduleCount>>({}),[overview,setOverview]=useState<ScheduleOverview|null>(null);
  const [unresolved,setUnresolved]=useState<UnresolvedCompany[]|null>(null),[unknownSearch,setUnknownSearch]=useState(''),[unknownError,setUnknownError]=useState('');
  const [rows,setRows]=useState<CalendarRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [selected,setSelected]=useState(""),[search,setSearch]=useState("");
  const [sort,setSort]=useState<CalendarSort>("code"),[ascending,setAscending]=useState(true);
  const [detail,setDetail]=useState<ForecastDetail|null>(null),[versions,setVersions]=useState<ForecastVersion[]>([]);
  const [version,setVersion]=useState(""),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState("");
  const [tab,setTab]=useState("forecast"),[panes,setPanes]=useState([.38,.34,.28]);
  const [dragging,setDragging]=useState<number|null>(null);
  const layoutRef=useRef<HTMLDivElement>(null),listRef=useRef<HTMLDivElement>(null),reportRef=useRef<HTMLElement>(null);
  const viewerRef=useRef<CompanyViewerHandle>(null),restored=useRef(false);
  const current=rows.find(r=>r.code===selected);
  useEffect(()=>{
    const p=new URLSearchParams(window.location.search),requested=p.get("date");
    if(requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)&&!Number.isNaN(Date.parse(requested))) {setDate(requested);setMonth(requested.slice(0,7));}
    setSelected(p.get("code")??"");
    try {const saved=JSON.parse(localStorage.getItem("earnings-calendar-panes")??"null"); if(Array.isArray(saved)&&saved.length===3&&saved.every(v=>typeof v==="number"&&v>=.17)&&Math.abs(saved.reduce((a,b)=>a+b,0)-1)<.001) setPanes(saved);} catch{}
    restored.current=true;
  },[]);
  useEffect(()=>{
    if(!restored.current) return;
    const u=new URL(window.location.href); u.searchParams.set("date",date); if(selected)u.searchParams.set("code",selected);else u.searchParams.delete("code");
    window.history.replaceState(null,"",u);
  },[date,selected]);
  useEffect(()=>{
    const controller=new AbortController(); setMonthError(""); setCounts({});setDayCounts({});
    read<{counts:Record<string,number>;days:Record<string,DayScheduleCount>;overview:ScheduleOverview|null}>({month},controller.signal).then(r=>{setCounts(r.counts);setDayCounts(r.days);setOverview(r.overview);}).catch(e=>{if(e.name!=="AbortError")setMonthError(e.message);});
    return ()=>controller.abort();
  },[month]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError("");setRows([]);setDetail(null);setVersions([]);
    read<{rows:CalendarRow[]}>({date},controller.signal).then(r=>{
      setRows(r.rows);setSelected(old=>r.rows.some(x=>x.code===old)?old:r.rows[0]?.code??"");setLoading(false);
    }).catch(e=>{if(e.name!=="AbortError"){setError(e.message);setLoading(false);}});
    return ()=>controller.abort();
  },[date]);
  useEffect(()=>{setVersion("");setTab("forecast");reportRef.current?.scrollTo(0,0);},[selected,date]);
  useEffect(()=>{
    if(!selected || !rows.some(r=>r.code===selected)) return;
    const controller=new AbortController();setDetailLoading(true);setDetailError("");setDetail(null);
    read<{detail:ForecastDetail|null;versions:ForecastVersion[]}>({date,code:selected,...(version?{version}:{})},controller.signal)
      .then(r=>{setDetail(r.detail);setVersions(r.versions);setDetailLoading(false);})
      .catch(e=>{if(e.name!=="AbortError"){setDetailError(e.message);setDetailLoading(false);}});
    return ()=>controller.abort();
  },[selected,date,version,rows]);
  useEffect(()=>{if(selected && current?.financialsAvailable!==false) viewerRef.current?.loadTicker(selected);},[selected,current?.financialsAvailable]);
  const filtered=useMemo(()=>sortCalendarRows(rows.filter(r=>`${r.code} ${r.companyName}`.toLowerCase().includes(search.toLowerCase())),sort,ascending),[rows,search,sort,ascending]);
  const unknownFiltered=(unresolved??[]).filter(r=>`${r.code} ${r.companyName}`.toLowerCase().includes(unknownSearch.toLowerCase()));
  const unknownReason=(r:UnresolvedCompany)=>r.reason==='request_failed'?'取得失敗':r.reason==='not_checked'?'未取得':'対象期間の日程未掲載';
  const loadUnknown=()=>{if(unresolved)return;setUnknownError('');read<{companies:UnresolvedCompany[]}>({mode:'unresolved'}).then(r=>setUnresolved(r.companies)).catch(e=>setUnknownError(e.message));};
  const virtual=useVirtualizer({count:filtered.length,getScrollElement:()=>listRef.current,estimateSize:()=>82,overscan:8});
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const first=new Date(month+"-01T00:00:00Z");
  const days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const savePanes=(next:number[])=>{setPanes(next);try{localStorage.setItem("earnings-calendar-panes",JSON.stringify(next));}catch{}};
  const moveMonth=(delta:number)=>setMonth(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+delta,1)).toISOString().slice(0,7));
  const chooseDate=(next:string)=>{setDate(next);setMonth(next.slice(0,7));setOpen(false);setSearch("");setVersion("");};
  const sortBy=(key:CalendarSort)=>{if(sort===key)setAscending(!ascending);else{setSort(key);setAscending(false);}};
  const sortButton=(key:CalendarSort,text:string)=><button onClick={()=>sortBy(key)} aria-label={`${text}で並べ替え`}>{text}{sort===key?(ascending?" ↑":" ↓"):" ↕"}</button>;
  const splitter=(index:number)=><div className={`ec-splitter news-pane-splitter${dragging===index?" is-resizing":""}`} role="separator" tabIndex={0}
    aria-label={index===0?"一覧とレポートの幅を変更":"レポートとPLの幅を変更"} aria-orientation="vertical" aria-valuenow={Math.round(panes[index]*100)} aria-valuemin={17} aria-valuemax={Math.round((panes[index]+panes[index+1]-.17)*100)}
    onDoubleClick={()=>savePanes([.38,.34,.28])}
    onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();savePanes(resizeCalendar(panes,index,panes[index]+(e.key==="ArrowRight"?1:-1)*(e.shiftKey?.05:.01)));}if(e.key==="Home")savePanes([.38,.34,.28]);}}
    onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setDragging(index);e.preventDefault();}}
    onPointerMove={e=>{if(dragging!==index)return;const rect=layoutRef.current!.getBoundingClientRect();const available=rect.width-20;const before=index===0?0:panes[0]*available+10;savePanes(resizeCalendar(panes,index,(e.clientX-rect.left-before)/available));}}
    onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);setDragging(null);}}
    onLostPointerCapture={()=>setDragging(null)} />;
  return <main className="earnings-calendar">
    <header className="ec-header"><TopNavigation active="calendar"/><div className="ec-heading"><div><h1>決算カレンダー <span>業績予測</span></h1><p>発表予定から、予測の根拠と企業の財務を確認</p></div><span className="ec-mode">保存予測を閲覧</span></div></header>
    <div className="ec-layout" ref={layoutRef} style={{gridTemplateColumns:`minmax(0,${panes[0]}fr) 10px minmax(0,${panes[1]}fr) 10px minmax(0,${panes[2]}fr)`}}>
      <section className="ec-left" aria-label="決算予定企業一覧">
        <div className="ec-list-tools"><div className="ec-date-row"><button className="ec-date-button" aria-expanded={open} onClick={()=>setOpen(!open)}>📅 {dateLabel(date)} <span>▾</span></button><strong>{loading?'…':rows.length?`${rows.length}社`:'未登録'}</strong></div>
          <EarningsTargetsExport key={date} date={date}/>
          {open&&<div className="ec-month" role="dialog" aria-label="決算日を選択" onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}}><div className="ec-month-heading"><button aria-label="前月" onClick={()=>moveMonth(-1)}>‹</button><b>{month.replace("-","年 ")}月</b><button aria-label="翌月" onClick={()=>moveMonth(1)}>›</button><button onClick={()=>{setMonth(today.slice(0,7));}}>今日</button></div>
            {monthError&&<p role="alert">{monthError}</p>}<div className="ec-month-grid">{"日月火水木金土".split("").map(d=><span className="ec-weekday" key={d}>{d}</span>)}
              {Array.from({length:first.getUTCDay()},(_,i)=><span key={`blank${i}`}/>)}
              {Array.from({length:days},(_,i)=>{const day=month+"-"+String(i+1).padStart(2,"0"),entry=dayCounts[day];const label=counts[day]?`${counts[day]}社`:entry?.coverage==='confirmed_zero'?'0社確認済み':'未取得';return <button key={day} onClick={()=>chooseDate(day)} aria-label={`${day} ${label}`} title={entry?Object.entries(entry.statuses).map(([s,n])=>`${scheduleLabels[s as keyof typeof scheduleLabels]} ${n}社`).join(' / '):'日程未登録。0社と確認した日ではありません。'} aria-pressed={date===day} aria-current={today===day?"date":undefined} className={`${date===day?"selected":""} ${today===day?"today":""}`}><span>{i+1}</span><small>{label}</small></button>;})}</div><p className="ec-muted">登録企業を重複排除して集計。未取得は0社確認済みではありません。件数にカーソルを置くと内訳を表示。</p></div>}
          {overview&&<details className="ec-coverage" onToggle={e=>{if(e.currentTarget.open)loadUnknown();}}><summary>対象 {overview.stats.master.toLocaleString()}社 · 日程未確認 {overview.stats.unknown.toLocaleString()}社</summary>
            <p>対象期間 {overview.period.from} ～ {overview.period.to}<br/>予定登録 {overview.stats.registeredCompanies.toLocaleString()}社 / 確認済み {overview.stats.confirmedCompanies.toLocaleString()}社 / 暫定 {overview.stats.provisional}社<br/>取得失敗 {overview.stats.failed}社 / 未取得 {overview.stats.notChecked}社</p>
            <p>{overview.coverageNote}<br/>更新: {new Date(overview.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} JST</p>
            <input aria-label="日程未確認企業の検索" placeholder="未確認企業を検索" value={unknownSearch} onChange={e=>setUnknownSearch(e.target.value)}/>
            {unknownError?<p role="alert">{unknownError}</p>:!unresolved?<p>一覧を読み込み中…</p>:<><small>{unknownFiltered.length}社（先頭50社を表示・検索で絞り込み）</small><ul>{unknownFiltered.slice(0,50).map(r=><li key={r.code}>{r.code} {r.companyName}<small>{unknownReason(r)}</small></li>)}</ul></>}
            {overview.sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">取引所情報・原資料 ↗</a>)}
          </details>}
          <input aria-label="企業コード・企業名で絞り込み" value={search} onChange={e=>setSearch(e.target.value)} placeholder="企業コード・企業名で検索"/>
          <div className="ec-list-note"><span>単独四半期 / YoY</span><span>{filtered.length}社を表示</span></div>
          <p className="ec-schedule-note">{Object.entries(rows.reduce<Record<string,number>>((acc,r)=>{const label=scheduleLabels[r.status];acc[label]=(acc[label]??0)+1;return acc;},{})).map(([label,n])=>`${label} ${n}社`).join(' / ')||'この日は予定未登録・網羅確認前です'}</p>
        </div>
        <div className="ec-column-head" role="row"><div>{sortButton("code","企業")}</div><div>{sortButton("previousRevenue","前Q売上")}</div><div>{sortButton("previousProfit","前Q営利")}</div><div className="ec-forecast-column">{sortButton("forecastRevenue","予測売上")}</div><div className="ec-forecast-column">{sortButton("forecastProfit","予測営利")}</div></div>
        <div className="ec-list-scroll" ref={listRef} data-testid="calendar-list-scroll">
          {loading&&<p className="ec-empty">予定企業・財務データを読み込み中…</p>}
          {error&&<div className="ec-empty" role="alert">{error} <a href="/login">ログイン</a></div>}
          {!loading&&!error&&!filtered.length&&<p className="ec-empty">{rows.length?'検索条件に一致する企業はありません':'この日の予定は未登録です。決算予定が0社と確認したものではありません。'}</p>}
          <div style={{height:virtual.getTotalSize(),position:"relative"}}>{virtual.getVirtualItems().map(item=>{const row=filtered[item.index];return <button key={row.code} className={`ec-company-row${selected===row.code?" selected":""}`} style={{position:"absolute",top:0,left:0,width:"100%",height:82,transform:`translateY(${item.start}px)`}} onClick={()=>{setSelected(row.code);setVersion("");}} aria-pressed={selected===row.code} aria-label={`${row.code} ${row.companyName}`} data-code={row.code}>
            <span className="ec-company"><b>{row.code}</b><span title={row.companyName}>{row.companyName}</span><small>{scheduleLabels[row.status]}</small></span>
            <span title={[`${row.previous.target?.fiscalYearEnd??"—"} Q${row.previous.target?.quarter??"—"}`,row.previous.revenueYoY.note,...row.previous.notes].join("\n")}><GrowthCell value={row.previous.revenueYoY}/>{row.previous.notes.length>0&&<small className="ec-comparison-note">比較条件注意</small>}</span>
            <GrowthCell value={row.previous.profitYoY}/><span className="ec-forecast-column"><GrowthCell value={row.forecast?.revenueYoY} missing={!row.forecast}/></span><span className="ec-forecast-column"><GrowthCell value={row.forecast?.profitYoY} missing={!row.forecast}/></span>
          </button>;})}</div>
        </div><footer className="ec-list-footer">赤字転換・縮小・拡大は率と分けて表示。未確認の比較条件は詳細を参照。</footer>
      </section>
      {splitter(0)}
      <section className="ec-report" ref={reportRef} aria-label="個別業績予測レポート" data-testid="calendar-report-scroll">
        {!current?<p className="ec-empty">左の一覧から企業を選択してください</p>:<>
          <div className="ec-report-heading"><small>FORECAST & REVIEW</small><h2>{current.code} {current.companyName}</h2><div className="ec-badges"><span>{scheduleLabels[current.status]}</span><span className="ec-quality">{detail?.quality??current.forecast?.quality??"未予測"}</span></div>
            <details className="ec-previous-detail"><summary>予定日の出典・変更履歴</summary><p>{current.date} {current.announcementTime??'時刻未確認'} / {scheduleLabels[current.confirmationStatus??current.status]}</p><p>対象: {current.target?.fiscalYearEnd??'決算年未確認'} Q{current.target?.quarter??current.quarter??'—'} {current.targetConfirmed===false?'（対象年未照合）':''}</p><p>確認: {current.checkedAt??current.updatedAt}<br/>資料更新: {current.sourcePublishedAt??'記載なし'}<br/>初回登録: {current.firstRegisteredAt??current.updatedAt}</p>{/^https?:\/\//.test(current.source)&&<a href={current.source} target="_blank" rel="noreferrer">原資料を開く ↗</a>}<p>{current.note}</p>{current.actualDate&&<p>実際の発表日: {current.actualDate}</p>}{current.history?.length?current.history.map((h,i)=><p key={i}>{h.changedAt} / 旧予定: {h.before.date||'日程未判明'} / {h.before.status?scheduleLabels[h.before.status]:''}</p>):<p>予定変更なし</p>}</details>
            <details className="ec-previous-detail"><summary>前Qの比較元・確認状態</summary><p>{current.previous.target?.fiscalYearEnd??"—"}期 Q{current.previous.target?.quarter??"—"} 単独 / 前年同四半期比較</p><p>売上: {current.previous.previousYear?.revenue??"—"} → {current.previous.current?.revenue??"—"} 百万円</p><p>営業利益: {current.previous.previousYear?.operatingProfit??"—"} → {current.previous.current?.operatingProfit??"—"} 百万円</p>{current.previous.notes.map(n=><p key={n}>{n}</p>)}{current.financeError&&<p role="alert">{current.financeError}</p>}<p>既存Company Viewerの最新PL・共通Q単体計算。予測作成当時のPLスナップショットとは区別しています。</p></details>
          </div>
          {versions.length>0&&<label className="ec-version">予測バージョン<select value={version||detail?.id||""} onChange={e=>setVersion(e.target.value)}>{!detail&&!version&&<option value="">発表前の有効な予測なし（参考版を選択）</option>}{versions.map(v=><option key={v.id} value={v.id}>{v.asOf} / {v.version}{!v.preAnnouncement?"（発表日以後・参考）":""}</option>)}</select></label>}
          {detailLoading?<p className="ec-empty">レポートを読み込み中…</p>:detailError?<p className="ec-empty" role="alert">{detailError}</p>:!detail?<p className="ec-empty">業績予測レポートは未作成です</p>:<>
            <dl className="ec-metadata"><dt>対象</dt><dd>{detail.target.fiscalYearEnd}期 Q{detail.target.quarter}単独</dd><dt>情報基準</dt><dd>{detail.asOf}</dd><dt>保存日時</dt><dd>{detail.savedAt}</dd><dt>独立レビュー</dt><dd>{detail.reviewExecuted?"実施済み":"未実施"} / {detail.reviewPassed?"通過":"未通過"}</dd></dl>
            {!detail.preAnnouncement&&<p className="ec-warning">発表日以後の版です。発表前予測とは分けて参照してください。</p>}
            <div className="ec-tabs" role="tablist" aria-label="予測と検証の切り替え">{[["forecast","予測本文"],["review","独立レビュー"],["issues","未解決事項"]].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
            <div role="tabpanel" className="ec-report-content">{tab==="forecast"?<EarningsReportMarkdown markdown={detail.markdown}/>:tab==="review"?<><EarningsReportMarkdown markdown={detail.reviewMarkdown}/><details><summary>重要仮定・感応度 ({detail.assumptions.length})</summary><DataTable rows={detail.assumptions}/></details><details><summary>会社予想との比較 ({detail.guidance.length})</summary><DataTable rows={detail.guidance}/></details></>:<><h3>未解決事項 ({detail.issues.length})</h3><DataTable rows={detail.issues}/><h3>発表日の照合</h3><DataTable rows={detail.scheduleCheck?[detail.scheduleCheck]:[]}/></>}</div>
          </>}
        </>}
      </section>
      {splitter(1)}
      <section className="ec-financial" aria-label="選択企業のCompany Viewer"><div className="ec-financial-heading"><span>COMPANY VIEWER</span><b>{selected||"—"}</b></div>
        {!current?<p className="ec-empty">企業を選択してください</p>:current.financialLinkStatus==='hold'?<p className="ec-empty">企業対応の確認待ちのためPL連動を保留しています。<br/>{current.financialLinkNote}</p>:current.financialsAvailable===false?<p className="ec-empty">財務データ未登録</p>:<div className="ec-viewer"><CompanyViewer ref={viewerRef}/></div>}
      </section>
    </div>
  </main>;
}
