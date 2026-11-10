import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccelerationReport {
  logical_key: string; event_id: string | null; ticker: string; company_name: string;
  fiscal_year_end: string; quarter: number; business_date: string;
  state: string; decision: string; reason: string | null; title: string | null;
  previous_yoy: string | number | null; current_yoy: string | number | null;
  acceleration_pt: string | number | null; version: number; published_at: string | null;
  updated_at: string; last_error: string | null; read_version?: number;
}
export const REPORT_COLUMNS = 'logical_key,event_id,ticker,company_name,fiscal_year_end,quarter,business_date,state,decision,reason,title,previous_yoy,current_yoy,acceleration_pt,version,published_at,updated_at,last_error';

export async function enrichAcceleration(supabase: SupabaseClient, ids: string[], userId: string) {
  const reports: AccelerationReport[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('op_acceleration_reports').select(REPORT_COLUMNS).in('event_id', ids.slice(i, i + 100));
    if (error) throw error;
    reports.push(...(data || []) as AccelerationReport[]);
  }
  const { data: reads, error } = await supabase.from('op_acceleration_reads').select('logical_key,version').eq('user_id', userId);
  if (error) throw error;
  const versions = new Map((reads || []).map(r => [r.logical_key, r.version]));
  return new Map(reports.map(r => [r.event_id, { ...r, read_version: versions.get(r.logical_key) || 0 }]));
}

export const reportStateLabel = (r: AccelerationReport) => ({
  completed: '営利YoY加速', queued: 'レポート生成待ち', processing: 'レポート生成中',
  generated: 'レポート公開待ち', retry: '生成再試行待ち', failed: 'レポート生成失敗',
  data_wait: 'データ待ち', incomparable: '比較不可', withdrawn: '訂正により抽出対象外',
}[r.state] || '判定中');
