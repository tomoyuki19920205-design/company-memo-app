"use client";
import React,{useEffect,useState} from 'react';
import {forecastTargetsFilename,type ForecastTargets} from '@/lib/earnings-targets';

const endpoint=(date:string,csv=false)=>`/api/earnings-calendar?${new URLSearchParams({mode:'targets',date,...(csv?{format:'csv'}:{})})}`;
export default function EarningsTargetsExport({date}:{date:string}) {
  const [targets,setTargets]=useState<ForecastTargets|null>(null),[error,setError]=useState('');
  const [downloading,setDownloading]=useState(false),[refresh,setRefresh]=useState(0);
  // The parent keys this component by date, so old responses/downloads cannot change the new day's controls.
  useEffect(()=>{
    const controller=new AbortController();setTargets(null);setError('');
    fetch(endpoint(date),{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(response.redirected || !response.headers.get('content-type')?.includes('application/json'))throw new Error('ログインが必要です');
      const body=await response.json();if(!response.ok)throw new Error(body.error??'予測対象の取得に失敗しました');
      setTargets(body);
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'予測対象の取得に失敗しました');});
    return ()=>controller.abort();
  },[date,refresh]);
  async function download() {
    if(!targets?.count || downloading)return;
    setDownloading(true);setError('');
    try {
      const response=await fetch(endpoint(date,true),{cache:'no-store'});
      if(response.redirected || !response.ok || !response.headers.get('content-type')?.includes('text/csv'))throw new Error(response.status===401||response.redirected?'ログインが必要です':'CSVの取得に失敗しました');
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');
      anchor.href=url;anchor.download=forecastTargetsFilename(date);document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setRefresh(v=>v+1);
    } catch(e){setError(e instanceof Error?e.message:'CSVの取得に失敗しました');}
    finally {setDownloading(false);}
  }
  return <div className="ec-target-export" aria-label="予測対象CSV出力">
    <div className="ec-target-actions">
      <button className="ec-target-button" disabled={!targets?.count||downloading} onClick={download}>{downloading?'CSV取得中…':`未予測 ${targets?targets.count:'…'}社 CSV出力`}</button>
      <button className="ec-target-refresh" onClick={()=>setRefresh(v=>v+1)} disabled={downloading} aria-label="未予測件数を再確認" title="取り込み後の件数を再確認">↻</button>
    </div>
    {error && <p role="alert" className="ec-target-error">{error}</p>}
    {targets && <details className="ec-target-details">
      <summary>出力対象の確認：{targets.count}社{targets.needsReview>0?`・照合要確認 ${targets.needsReview}社`:''}{targets.excluded.length>0?`・除外 ${targets.excluded.length}社`:''}</summary>
      <p>検索・並び順によらず選択日全体が対象です。予測値登録済み {targets.forecasted}社。照合要確認もCSVに含みます。分析前に対象決算期を確認してください。</p>
      <p>暫定日程：予定全体 {targets.scheduledProvisional}社／CSV {targets.provisional}社。財務連動保留と企業の同一性確認は別に判定します。</p>
      {targets.candidates.length>0 && <ul>{targets.candidates.map(row=><li key={row.code}>{row.code} {row.company_name}：{row.forecast_status}{row.schedule_status==='暫定'?'／暫定':''}{row.financial_link_status==='財務連動保留'?'／財務連動保留':''}</li>)}</ul>}
      {targets.excluded.length>0 && <ul>{targets.excluded.map(row=><li key={row.code}>除外：{row.code} {row.companyName} — {row.reason}</li>)}</ul>}
    </details>}
  </div>;
}
