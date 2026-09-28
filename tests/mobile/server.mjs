import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const bundle = await build({ entryPoints: ['tests/mobile/entry.jsx'], bundle: true, write: false, jsx: 'automatic', platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'test-boundaries', setup(b) {
  b.onResolve({ filter: /supabase-browser$/ }, () => ({ path: path.join(root, 'tests/mobile/supabase.js') }));
  b.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: 'next-mock' }));
  b.onLoad({ filter: /.*/, namespace: 'next-mock' }, ({ path }) => ({ contents: path.endsWith('link') ? 'import React from "react"; export default function Link(p) { return React.createElement("a", p); }' : 'export const useRouter = () => ({ replace() {}, push() {} }); export const useSearchParams = () => new URLSearchParams(location.search); export const usePathname = () => location.pathname;', resolveDir: root }));
} }] });
const css = readFileSync('app/globals.css');
createServer((req, res) => {
  if (req.url.startsWith('/bundle.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (req.url.startsWith('/style.css')) { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else if (req.url.startsWith('/api/screener')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url.includes('mode=options') ? { markets: [], sectors17: [], sectors33: [] } : { rows: [{ ticker: '418A', company_name: '検証株式会社', name: '検証株式会社', stock_price: 1234 }], count: 1, page: 1 })); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
}).listen(4173, '127.0.0.1');
