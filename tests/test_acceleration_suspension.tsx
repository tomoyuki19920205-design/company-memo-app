import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AccelerationReportBody from '../components/tdnet-alerts/AccelerationReportBody';
// Keep the 2,501-card pagination and ordinary-card isolation checks in npm test.
import '../lib/tdnet-alerts/queries.test';

test('a previously loaded acceleration report renders no dedicated production UI', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
  try {
    const html = renderToStaticMarkup(<AccelerationReportBody
      report={{ logical_key: 'preserved', state: 'completed', version: 1 } as never}
      event={{ id: 'ordinary-card' } as never} userId="test-user"
      onRead={() => { throw new Error('read marker must not be changed'); }} />);
    assert.equal(html, '');
  } finally {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  }
});
