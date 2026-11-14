import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchEvents } from '../lib/tdnet-alerts/queries';
import { fetchCachedEventDetail } from '../lib/tdnet-alerts/detail-cache';
import { BoundedCache } from '../lib/bounded-cache';
import type { EnrichedEvent } from '../lib/tdnet-alerts/types';

test('bounded PL cache evicts the least recently used ticker only', () => {
  const cache = new BoundedCache<string, number>(2);
  cache.set('A', 1).set('B', 2); assert.equal(cache.get('A'), 1);
  cache.set('C', 3); assert.equal(cache.has('B'), false);
  assert.deepEqual([...cache.keys()], ['A', 'C']);
});

test('detail requests coalesce, isolate users, retry failures and invalidate on refreshed objects', async () => {
  let calls = 0; let fail = false;
  const client = { from() { calls++; return { select() { return this; }, eq() { return this; }, async single() {
    return { data: { summary: '本文', formatted_message: '全文', raw_payload: {} }, error: fail ? Error('retry') : null };
  } }; } };
  const event = { id: 'A' } as EnrichedEvent;
  await Promise.all([fetchCachedEventDetail(client as never, event, 'u'), fetchCachedEventDetail(client as never, event, 'u')]);
  assert.equal(calls, 1);
  await fetchCachedEventDetail(client as never, event, 'other'); assert.equal(calls, 2);
  await fetchCachedEventDetail(client as never, { ...event }, 'u'); assert.equal(calls, 3);
  const retryEvent = { ...event }; fail = true;
  await assert.rejects(fetchCachedEventDetail(client as never, retryEvent, 'u'));
  fail = false; await fetchCachedEventDetail(client as never, retryEvent, 'u'); assert.equal(calls, 5);
});

test('2501 mixed JSON/string payloads preserve IDs, read/star/comment state, and bounded concurrency', async () => {
  let inFlight = 0; let maxInFlight = 0;
  const payload = { extracted: { previous_dividend_per_share: 5, revised_dividend_per_share: 10 } };
  const rows = Array.from({ length: 2501 }, (_, i) => ({ id: `event-${i}`, ticker: '1234', headline: '配当のお知らせ', event_type: 'dividend', disclosed_at: '2026-11-13T07:00:00Z', raw_payload: i % 2 ? payload : JSON.stringify(payload) }));
  const tables: Record<string, any[]> = {
    tdnet_events: rows,
    tdnet_event_reads: [{ event_id: 'event-2500', user_id: 'u' }],
    tdnet_event_stars: [{ event_id: 'event-1800', user_id: 'u' }],
    tdnet_event_comments: Array.from({ length: 1201 }, () => ({ event_id: 'event-2500' })),
  };
  const client = { from(table: string) {
    let bounds = [0, 999]; let ids: string[] | null = null;
    const query = { select() { return this; }, order() { return this; }, limit() { return this; }, eq() { return this; }, not() { return this; }, gte() { return this; }, lt() { return this; },
      in(_column: string, value: string[]) { ids = value; assert.ok(value.length <= 100); return this; },
      range(start: number, end: number) { bounds = [start, end]; return this; },
      async then(resolve: (v: unknown) => void) {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 1));
        let data = tables[table] ?? []; if (ids) data = data.filter(r => ids!.includes(r.event_id));
        data = data.slice(bounds[0], bounds[1] + 1); inFlight--;
        resolve({ data, error: null });
      },
    }; return query;
  } };
  const result = await fetchEvents(client as never, { userId: 'u', selectedDate: '2026-11-13' });
  assert.equal(result.length, 2501); assert.equal(new Set(result.map(r => r.id)).size, 2501);
  assert.deepEqual(new Set(result.map(r => r.id)), new Set(rows.map(r => r.id)));
  assert.equal(result.find(r => r.id === 'event-2500')?.is_read, true);
  assert.equal(result.find(r => r.id === 'event-1800')?.is_starred, true);
  assert.equal(result.find(r => r.id === 'event-2500')?.comments_count, 1201);
  assert.equal((result[0].raw_payload.extracted as any).revised_dividend_per_share, 10);
  assert.ok(maxInFlight <= 6); assert.ok(maxInFlight > 1);
});

test('string payload preserves the existing buyback progress exclusion', async () => {
  const q: any = new Proxy({}, { get(_target, key) {
    if (key === 'then') return (resolve: (data: unknown) => void) => resolve({ data: [{ id: 'progress', headline: '自己株式について', event_type: 'buyback', raw_payload: JSON.stringify({ extracted: { event_type: 'buyback_status' } }) }], error: null });
    return () => q;
  } });
  assert.deepEqual(await fetchEvents({ from: () => q } as never, { userId: 'u', selectedDate: '2026-11-13' }), []);
});

test('an aborted date load cannot return a partial day', async () => {
  const abort = new AbortController(); abort.abort();
  const q: any = new Proxy({}, { get: () => () => q });
  await assert.rejects(fetchEvents({ from: () => q } as never, { userId: 'u', selectedDate: '2026-11-13', signal: abort.signal }), /abort/i);
});
