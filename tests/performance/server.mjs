// Offline only: no secrets, no production connections, no Next application route.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const source = path.resolve(process.env.PERF_SOURCE || root);
const dataDir = path.resolve(process.env.PERF_DATA || '../data');
const harness = path.join(root, 'tests/performance');
const fixtureTables = {};
for (const day of ['2026-11-09', '2026-11-13']) {
  const file = path.join(dataDir, day + '.json');
  fixtureTables[day] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : Array.from({ length: day.endsWith('13') ? 2501 : 40 }, (_, i) => ({ id: `event-${day}-${i}`, ticker: String(1000 + i % 8000), company_name: `検証会社 ${i}`, headline: '配当のお知らせ', event_type: 'dividend', status: 'active', priority_rank: 10, created_at: day+'T06:00:00Z', detected_at: day+'T06:00:00Z', disclosed_at: day+'T06:00:00Z', raw_payload: { extracted: { previous_dividend_per_share: 5, revised_dividend_per_share: 10 } } }));
}
const bundle = await build({ absWorkingDir: source, stdin: { contents: `import React, { Profiler } from 'react'; import { createRoot } from 'react-dom/client'; import AlertsPage from ${JSON.stringify(path.join(source, 'components/tdnet-alerts/AlertsPage.tsx'))}; window.__commits=[]; window.__errors=[]; window.addEventListener('error', e=>window.__errors.push(e.message)); createRoot(document.getElementById('root')).render(<Profiler id="alerts" onRender={(id,phase,duration)=>window.__commits.push({phase,duration,at:performance.now()})}><AlertsPage userId="perf-user" userEmail="offline@example.test" /></Profiler>);`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, minify: true, jsx: 'automatic', platform: 'browser', nodePaths: [path.join(root, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-boundaries', setup(b) {
  b.onResolve({ filter: /supabase-browser$/ }, () => ({ path: path.join(harness, 'supabase.js') }));
  b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: path.join(root, 'node_modules/react-dom/profiling.js') }));
  b.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: 'next-mock' }));
  b.onLoad({ filter: /.*/, namespace: 'next-mock' }, ({ path }) => ({ contents: path.endsWith('link') ? 'import React from "react"; export default function Link(p) { return React.createElement("a", p); }' : 'export const useRouter = () => ({ replace() {}, push() {} }); export const useSearchParams = () => new URLSearchParams(location.search); export const usePathname = () => location.pathname;', resolveDir: root }));
} }] });
const css = readFileSync(path.join(source, 'app/globals.css'));
const financials = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/alphanumeric-pl-viewer.json')))['418A'];
const sessions = new Map();
function query({ table, calls, session }) {
  if (!sessions.has(session)) sessions.set(session, { tdnet_events: Object.values(fixtureTables).flat(), tdnet_event_reads: [], tdnet_event_stars: [], tdnet_event_comments: [] });
  const db = sessions.get(session);
  let rows = db[table] || [];
  const ticker = calls.find(c=>c[0]==='eq' && ['ticker','ticker_code'].includes(c[1]))?.[2] || '418A';
  if (table==='companies') rows = [{ticker_code:ticker,name_ja:db.tdnet_events.find(e=>e.ticker===ticker)?.company_name || '検証会社'}];
  if (table==='api_latest_financials_canonical') rows = financials.map(r=>({...r,ticker}));
  const like = (value, pattern) => String(value ?? '').toUpperCase().includes(pattern.replaceAll('%','').toUpperCase());
  const match = (row, [op,col,val,extra]) => {
    if (op==='eq') return row[col]===val;
    if (op==='in') return val.includes(row[col]);
    if (op==='gte') return row[col]>=val;
    if (op==='lte') return row[col]<=val;
    if (op==='lt') return row[col]<val;
    if (op==='not') return val==='ilike' ? !like(row[col],extra) : true;
    if (op==='or') return col.split(',').some(s=>{const [k,o,...v]=s.split('.');return o==='eq'?row[k]===v.join('.'):like(row[k],v.join('.'));});
    return true;
  };
  const upsert = calls.find(c=>c[0]==='upsert');
  if(upsert) { if(!['tdnet_event_reads','tdnet_event_stars'].includes(table)) throw Error('Unexpected fixture write'); rows=db[table]=[...rows.filter(r=>r.event_id!==upsert[1].event_id),upsert[1]]; }
  const filters = calls.filter(c=>['eq','in','gte','lte','lt','not','or'].includes(c[0]));
  if(calls.some(c=>c[0]==='delete')) { if(!['tdnet_event_reads','tdnet_event_stars'].includes(table)) throw Error('Unexpected fixture delete'); db[table]=rows.filter(r=>!filters.every(c=>match(r,c))); return {data:[],error:null}; }
  rows=rows.filter(r=>filters.every(c=>match(r,c)));
  const order=calls.filter(c=>c[0]==='order');
  rows=rows.slice().sort((a,b)=>{for(const [,k,o] of order){if(a[k]===b[k])continue;if(a[k]==null)return o?.nullsFirst?-1:1;if(b[k]==null)return o?.nullsFirst?1:-1;return (a[k]<b[k]?-1:1)*(o?.ascending===false?-1:1);}return 0;});
  const range=calls.findLast(c=>c[0]==='range'); const limit=calls.findLast(c=>c[0]==='limit');
  rows=range?rows.slice(range[1],range[2]+1):rows.slice(0,Math.min(limit?.[1] || 1000,1000));
  const select=calls.find(c=>c[0]==='select')?.[1];
  if(select && select!=='*') rows=rows.map(row=>Object.fromEntries(select.split(',').map(x=>{x=x.trim();if(x.includes(':raw_payload->')){const [alias,k]=x.split(':raw_payload->');return [alias,row.raw_payload?.[k]??null];}return [x,row[x]];})));
  return {data:calls.some(c=>['single','maybeSingle'].includes(c[0]))?rows[0]??null:rows,error:null};
}
const server=createServer(async (req,res)=>{
  if(req.url.startsWith('/bundle.js')){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].contents);}
  if(req.url.startsWith('/style.css')){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(req.url==='/fixture-query') { let body=''; for await(const chunk of req) body+=chunk; const input=JSON.parse(body); res.setHeader('Content-Type','application/json'); try { const result=query(input); if(input.delay) await new Promise(r=>setTimeout(r,Math.min(input.delay,300))); return res.end(JSON.stringify(result)); }catch(e){res.statusCode=500;return res.end(JSON.stringify({error:String(e)}));} }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
server.listen(Number(process.env.PORT||4175),'127.0.0.1',()=>console.log('Offline benchmark ready',source));
