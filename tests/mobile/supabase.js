// Deterministic browser fixtures. No live credentials or backend writes are used.
import financials from '../fixtures/alphanumeric-pl-viewer.json';
const date = '2026-09-06T01:00:00Z';
const user = { id: 'mobile-test', email: 'mobile@example.test' };
const tables = {
  companies: [{ ticker_code: '418A', name_ja: 'モバイル検証株式会社' }],
  api_latest_financials_canonical: financials['418A'],
  api_latest_segments: Array.from({ length: 8 }, (_, i) => ({ ticker: '418A', period: '2026-11-30', quarter: '2Q', segment_name: `Business ${i}`, sales: 12345, profit: 1234, source: 'xbrl', source_priority: 0 })),
  per_share_data: [{ ticker: '418A', period: '2025-11-30', quarter: 'FY', eps: 12, bps: 100, dividend_annual: 5 }],
  order_kpis: ['orders_received', 'order_backlog', 'carried_forward_construction'].map((name, i) => ({ id: i, ticker: '418A', canonical_kpi_name: name, normalized_value: 123456789012, fiscal_year: '2026年11月期', quarter: '2Q', review_status: 'auto_accepted', confidence_score: 1 })),
  edinet_order_data: [{ ticker: '418A', period: '2025-11-30', fiscal_year: 2025, orders_received: 123456, order_backlog: 234567, construction_carryover: 345678, completed_construction: 456789, rpo: 567890, confidence: 'high', source_unit: 'million_yen' }],
  monthly_data: [{ ticker: '418A', month: '2026-08', metric_name: '月次売上', metric_value: 12345, unit: '百万円', yoy_pct: 10 }],
  kpi_data: [{ ticker: '418A', period: '2026-11-30', metric_name: '店舗数', metric_value: 1234, table_title: '各種KPIの検証' }],
  forecast_revision: [{ ticker: '418A', disclosed_date: '2026-09-01', title: '業績予想修正の検証', metric_name: '営業利益', before_value: 100, after_value: 200, delta_value: 100, delta_pct: 100 }],
  api_latest_news_stream: Array.from({ length: 20 }, (_, i) => ({ stream_id: `news-${i}`, report_type: 'sector_weekly', title: `業種レポート ${i}`, sort_at: date, created_at: date, period_start: date, period_end: date, sector_code: '01', sector_name: '検証業種', category: 'weekly', direction: 'positive', importance: 'A', summary_bullets: ['一覧の概要'], full_report_md: '# 全文レポート\n\n' + '詳しいニュース本文です。\n\n'.repeat(50), sources: [], watchlist_companies: [], next_week_watchpoints: [], missed_candidates: [] })),
  tdnet_events: Array.from({ length: 20 }, (_, i) => ({ id: `event-${i}`, ticker: '418A', company_name: 'モバイル検証株式会社', event_type: 'dividend', event_subtype: 'increase', headline: `増配のお知らせ ${i}`, detected_at: date, disclosed_at: date, created_at: date, priority_rank: 10, status: 'active', notify_to_discord: true, raw_payload: { extracted: { previous_dividend_per_share: 5, revised_dividend_per_share: 10 } } })),
};
function query(table) {
  let single = false;
  const proxy = new Proxy({}, { get(_, key) {
    if (key === 'then') return (resolve) => resolve({ data: single ? (tables[table]?.[0] ?? null) : (tables[table] ?? []), error: null });
    return () => { if (key === 'maybeSingle' || key === 'single') single = true; return proxy; };
  } });
  return proxy;
}
const channel = { on() { return this; }, subscribe() { return this; }, track: async () => {}, untrack: async () => {}, unsubscribe() {}, presenceState: () => ({}) };
const client = { from: query, rpc: () => query('empty'), channel: () => channel, removeChannel() {}, auth: { getUser: async () => {
  const delay = Number(new URLSearchParams(location.search).get('delayAuth') || 0);
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  return { data: { user } };
}, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: { user } } }) } };
export const createSupabaseBrowser = () => client;
