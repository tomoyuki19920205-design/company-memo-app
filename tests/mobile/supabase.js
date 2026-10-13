// Deterministic browser fixtures. No live credentials or backend writes are used.
import financials from '../fixtures/alphanumeric-pl-viewer.json';
import reasonEvents from '../fixtures/forecast_reason_events.json';
import { fullMemo, longCompanyName } from './focus-fixtures.mjs';
const params = new URLSearchParams(location.search);
const ticker = params.get('fixtureTicker') || '418A';
const companyName = params.has('longName') ? longCompanyName : ticker === '7203' ? 'トヨタ自動車' : 'モバイル検証株式会社';
const date = '2026-09-06T01:00:00Z';
const user = { id: 'mobile-test', email: 'mobile@example.test' };
const tables = {
  companies: [{ ticker_code: ticker, name_ja: companyName }],
  company_memo_grids: [{ ticker, period: '__manual_pl_cum__', quarter: 'MANUAL', grid_json: [[fullMemo]], updated_at: date }],
  market_data: [{ ticker, date: '2026-09-04', close: 3000, market_cap: 40000000000000, shares_outstanding: 13000000000 }],
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
const pinFixture = params.has('pinFixture');
if (params.has('reasonFixture')) {
  tables.tdnet_events = reasonEvents;
  tables.companies = reasonEvents.map(row => ({ ticker_code: row.ticker, name_ja: row.company_name }));
  tables.tdnet_event_reads = [];
  tables.tdnet_event_stars = [];
}
const pinListeners = [];
if (pinFixture) {
  tables.tdnet_events = ['418A', '7203', '7512'].map((code, i) => ({
    ...tables.tdnet_events[i], id: `pin-${i}`, ticker: code, company_name: `固定検証 ${code}`,
    pdf_url: 'https://www.release.tdnet.info/inbs/140120260928541194.pdf',
    raw_payload: { extracted: { previous_dividend_per_share: 5, revised_dividend_per_share: 10 } },
  }));
  tables.companies = tables.tdnet_events.map(row => ({ ticker_code: row.ticker, name_ja: row.company_name }));
  tables.tdnet_event_reads = [];
  tables.tdnet_event_stars = [];
}
export function emitPinFixtureUpdate() {
  tables.tdnet_events = tables.tdnet_events.slice().reverse().map((row, i) => ({
    ...row, company_name: `更新済 ${row.ticker}`, disclosed_at: new Date(Date.now() - i * 60_000).toISOString(),
  }));
  for (const listener of pinListeners) if (listener.event === 'UPDATE') listener.callback({ new: tables.tdnet_events[0] });
}
export function emitPinFixtureInsert() {
  const row = { ...tables.tdnet_events[0], id: 'pin-new', ticker: '8904', company_name: '新規通知', disclosed_at: new Date().toISOString() };
  tables.tdnet_events = [row, ...tables.tdnet_events.filter(item => item.id !== row.id)];
  for (const listener of pinListeners) if (listener.event === 'INSERT') listener.callback({ new: row });
}
function query(table) {
  let single = false;
  const predicates = [];
  let operation = null;
  let payload;
  const proxy = new Proxy({}, { get(_, key) {
    if (key === 'then') return (resolve) => {
      let rows = tables[table] ?? [];
      if (pinFixture) {
        if (operation === 'upsert') tables[table] = rows = [...rows.filter(row => row.event_id !== payload.event_id), payload];
        if (operation === 'delete') tables[table] = rows = rows.filter(row => !predicates.every(predicate => predicate(row)));
        rows = rows.filter(row => predicates.every(predicate => predicate(row)));
      }
      resolve({ data: single ? (rows[0] ?? null) : rows, error: null });
    };
    return (...args) => {
      if (key === 'maybeSingle' || key === 'single') single = true;
      if (pinFixture && ['tdnet_events', 'tdnet_event_reads', 'tdnet_event_stars', 'companies'].includes(table)) {
        if (key === 'eq') predicates.push(row => row[args[0]] === args[1]);
        if (key === 'in') predicates.push(row => args[1].includes(row[args[0]]));
        if (key === 'or') {
          const code = args[0].match(/ticker\.eq\.([^,]+)/)?.[1];
          if (code) predicates.push(row => row.ticker === code);
        }
        if (key === 'upsert') { operation = 'upsert'; payload = args[0]; }
        if (key === 'delete') operation = 'delete';
      }
      return proxy;
    };
  } });
  return proxy;
}
const channel = { on() { return this; }, subscribe() { return this; }, track: async () => {}, untrack: async () => {}, unsubscribe() {}, presenceState: () => ({}) };
function fixtureChannel() {
  const owned = [];
  return {
    ...channel,
    on(_kind, filter, callback) { const listener = { event: filter.event, callback }; owned.push(listener); pinListeners.push(listener); return this; },
    subscribe(callback) { callback?.('SUBSCRIBED'); return this; },
    unsubscribe() { for (const listener of owned) { const i = pinListeners.indexOf(listener); if (i >= 0) pinListeners.splice(i, 1); } },
  };
}
const client = { from: query, rpc: () => query('empty'), channel: () => pinFixture ? fixtureChannel() : channel, removeChannel(ch) { if (pinFixture) ch.unsubscribe(); }, auth: { getUser: async () => {
  const delay = Number(new URLSearchParams(location.search).get('delayAuth') || 0);
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  return { data: { user } };
}, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: { user } } }) } };
export const createSupabaseBrowser = () => client;
