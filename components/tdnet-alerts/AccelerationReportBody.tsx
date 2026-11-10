"use client";
import SectorReportMarkdown from '@/components/SectorReportMarkdown';
import React, { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { reportStateLabel, type AccelerationReport } from '@/lib/tdnet-alerts/acceleration';
import type { EnrichedEvent, TdnetEventComment } from '@/lib/tdnet-alerts/types';
import { fetchComments, addComment } from '@/lib/tdnet-alerts/queries';

const safeUrl = (url: string) => { try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
export default function AccelerationReportBody({ report, event, userId, onRead }: {
  report: AccelerationReport; event: EnrichedEvent; userId: string; onRead: (key: string, version: number) => void;
}) {
  const client = useRef(createSupabaseBrowser());
  const [body, setBody] = useState(''); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [original, setOriginal] = useState(''); const [comments, setComments] = useState<TdnetEventComment[]>([]);
  const [memo, setMemo] = useState(''); const [saving, setSaving] = useState(false);
  const onReadRef = useRef(onRead); onReadRef.current = onRead;
  useEffect(() => {
    let current = true; setBody(''); setError(''); setOriginal(''); setComments([]);
    const load = async () => {
      setLoading(true);
      try {
        const [detail, commentRows] = await Promise.all([
          client.current.from('tdnet_events').select('id,formatted_message,summary').eq('id', event.id).single(),
          fetchComments(client.current, event.id),
        ]);
        if (!current) return;
        if (detail.error) throw detail.error;
        setOriginal(detail.data.formatted_message || detail.data.summary || ''); setComments(commentRows);
        if (report.state !== 'completed') return;
        const { data, error } = await client.current.from('op_acceleration_versions')
          .select('logical_key,version,body_markdown,report').eq('logical_key', report.logical_key).eq('version', report.version).single();
        if (!current) return;
        if (error) throw error;
        if (data.logical_key !== report.logical_key || data.version !== report.version || !data.body_markdown) throw new Error('レポートの版を確認できません');
        setBody(data.body_markdown);
        const read = await client.current.rpc('mark_op_acceleration_read', { p_key: report.logical_key, p_version: report.version });
        if (read.error) throw read.error;
        if (current) onReadRef.current(report.logical_key, report.version);
      } catch (e) { if (current) setError(e instanceof Error ? e.message : 'レポートを取得できませんでした'); }
      finally { if (current) setLoading(false); }
    };
    void load(); return () => { current = false; };
  }, [event.id, report.logical_key, report.version, report.state, retry, userId]);
  const saveMemo = async () => {
    if (!memo.trim()) return; setSaving(true);
    try { await addComment(client.current, event.id, userId, memo.trim()); setMemo(''); setComments(await fetchComments(client.current, event.id)); }
    catch { setError('メモを保存できませんでした'); } finally { setSaving(false); }
  };
  return <section className="acceleration-report" aria-label="営利YoY加速レポート本文" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    {loading && <p role="status">レポートを読み込んでいます…</p>}
    {report.state !== 'completed' && <p role="status">{reportStateLabel(report)}{report.last_error && `：${report.last_error}`}</p>}
    {error && <p role="alert">{error} <button onClick={() => setRetry(v => v + 1)}>再取得</button></p>}
    {body && <SectorReportMarkdown markdown={body} reportType="op_acceleration" />}
    <details><summary>元の開示・既存コメント</summary>
      <p>{event.source_title || event.headline}</p>
      {safeUrl(event.source_url || event.pdf_url || '') && <a href={safeUrl(event.source_url || event.pdf_url || '')!} target="_blank" rel="noopener noreferrer">開示資料</a>}
      <p style={{ whiteSpace: 'pre-wrap' }}>{original}</p>
      {comments.map(c => <p key={c.id} style={{ whiteSpace: 'pre-wrap' }}>{c.comment}</p>)}
      <textarea aria-label="ユーザーメモ" value={memo} onChange={e => setMemo(e.target.value)} />
      <button disabled={saving || !memo.trim()} onClick={saveMemo}>メモを保存</button>
    </details>
  </section>;
}
