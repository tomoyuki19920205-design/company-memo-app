import assert from "node:assert/strict";
import test from "node:test";
import { fetchEvents } from "./queries";

type RecordedCall =
  | { method: "eq"; column: string; value: unknown }
  | { method: "in"; column: string; values: unknown[] }
  | { method: "not"; column: string; operator: string; value: string }
  | { method: "or"; condition: string };

class FakeQuery {
  readonly calls: RecordedCall[] = [];
  private bounds: [number, number] | null = null;
  constructor(private readonly rows: unknown[] = []) {}

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  range(start: number, end: number) { this.bounds = [start, end]; return this; }
  not(column: string, operator: string, value: string) {
    this.calls.push({ method: "not", column, operator, value });
    return this;
  }
  gte() { return this; }
  lt() { return this; }
  in(column: string, values: unknown[]) {
    this.calls.push({ method: "in", column, values });
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push({ method: "eq", column, value });
    return this;
  }

  or(condition: string) {
    this.calls.push({ method: "or", condition });
    return this;
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const rows = this.bounds ? this.rows.slice(this.bounds[0], this.bounds[1] + 1) : this.rows;
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

async function captureSearchCalls(search: string): Promise<RecordedCall[]> {
  const query = new FakeQuery();
  const supabase = { from: () => query };

  await fetchEvents(supabase as never, { userId: "test-user", search });
  return query.calls;
}

test("a busy selected day includes every card and bounds related UUID lookups", async () => {
  const rows = Array.from({ length: 2501 }, (_, i) => ({
    id: `event-${i}`, headline: "業績予想の修正", event_type: "forecast",
    ticker: "1234", raw_payload: {}, disclosed_at: "2026-11-13T07:00:00Z",
  }));
  const relatedQueries: FakeQuery[] = [];
  const supabase = { from: (table: string) => {
    const query = new FakeQuery(table === "tdnet_events" ? rows : []);
    if (table.startsWith("tdnet_event_")) relatedQueries.push(query);
    return query;
  }};
  const result = await fetchEvents(supabase as never, { userId: "test-user", selectedDate: "2026-11-13", limit: 1000 });
  assert.equal(result.length, 2501);
  assert.equal(new Set(result.map(row => row.id)).size, 2501);
  for (const query of relatedQueries) {
    for (const call of query.calls) if (call.method === "in") assert.ok(call.values.length <= 100);
  }
});

test("production suspension preserves ordinary earnings and never reads acceleration tables", async () => {
  const event = { id: "ordinary", ticker: "1234", event_type: "earnings", headline: "決算短信", raw_payload: {} };
  const tables: string[] = [];
  const supabase = { from: (table: string) => {
    tables.push(table);
    assert.ok(!table.startsWith("op_acceleration"));
    return new FakeQuery(table === "tdnet_events" ? [event] : []);
  }};
  const rows = await fetchEvents(supabase as never, { userId: "user", selectedDate: "2026-11-13" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "ordinary");
  assert.equal(rows[0].acceleration, undefined);
  const before = tables.length;
  assert.deepEqual(await fetchEvents(supabase as never, { userId: "user", accelerationOnly: true }), []);
  assert.equal(tables.length, before);
});

function hasTickerCondition(calls: RecordedCall[], ticker: string): boolean {
  return calls.some((call) =>
    (call.method === "eq" && call.column === "ticker" && call.value === ticker)
    || (call.method === "or" && call.condition.includes(`ticker.eq.${ticker}`)),
  );
}

test("a missing financial ticker does not interrupt other earnings enrichment", async () => {
  const event = { id: "missing-financial", headline: "決算短信", event_type: "earnings", ticker: "2990",
    raw_payload: { extracted: { fiscal_period: "2027-03-31", quarter: "2Q", sales_current: 1000000 } },
    disclosed_at: "2026-11-13T07:00:00Z" };
  const supabase = { from: (table: string) => new FakeQuery(table === "tdnet_events" ? [event] : table === "financials"
    ? [{ ticker: "1111", period: "2027-03-31", quarter: "2Q", sales: 1, operating_profit: 1 }] : []) };
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const rows = await fetchEvents(supabase as never, { userId: "test-user", selectedDate: "2026-11-13" });
    assert.equal(rows.length, 1);
    assert.equal(warnings.length, 0);
  } finally { console.warn = original; }
});

function searchCondition(calls: RecordedCall[]): string | undefined {
  return calls.find((call) => call.method === "or")?.condition;
}

test("source exclusions and profit concepts survive legacy financial enrichment", async () => {
  for (const extra of [{ has_yoy: false }, { ordinary_profit_current: 2000000 }, { profit_before_tax_current: 2000000 }]) {
    const ext = { fiscal_period: "2027-03-31", quarter: "2Q", sales_current: 1000000, op_current: null, sales_yoy: null, op_yoy: null, ...extra };
    const event = { id: "source-semantics", headline: "決算短信", event_type: "earnings", ticker: "3719", raw_payload: { extracted: ext }, disclosed_at: "2026-11-13T12:00:00Z" };
    const financials = [{ ticker: "3719", period: "2027-03-31", quarter: "2Q", sales: 1, operating_profit: 2 }, { ticker: "3719", period: "2026-03-31", quarter: "2Q", sales: 0.5, operating_profit: 1 }];
    const supabase = { from: (table: string) => new FakeQuery(table === "tdnet_events" ? [event] : table === "financials" ? financials : []) };
    const rows = await fetchEvents(supabase as never, { userId: "test-user", selectedDate: "2026-11-13" });
    assert.deepEqual((rows[0].raw_payload as any).extracted, ext);
    assert.equal((rows[0].raw_payload as any).extracted.op_current, null);
    assert.equal((rows[0].raw_payload as any).extracted.sales_yoy, null);
  }
});

test("searches an uppercase alpha ticker by exact ticker", async () => {
  const calls = await captureSearchCalls("581A");
  assert.equal(hasTickerCondition(calls, "581A"), true);
});

test("normalizes a lowercase alpha ticker before exact ticker search", async () => {
  const calls = await captureSearchCalls("581a");
  assert.equal(hasTickerCondition(calls, "581A"), true);
});

test("keeps four-digit ticker search", async () => {
  const calls = await captureSearchCalls("5810");
  assert.equal(hasTickerCondition(calls, "5810"), true);
});

test("keeps three-digit input on the general search fallback", async () => {
  const calls = await captureSearchCalls("581");
  assert.equal(hasTickerCondition(calls, "581"), false);
  assert.match(searchCondition(calls) ?? "", /company_name\.ilike\.\%581\%/);
});

test("keeps leading-alpha input on the general search fallback", async () => {
  const calls = await captureSearchCalls("A581");
  assert.equal(hasTickerCondition(calls, "A581"), false);
});

test("keeps company-name search on the general search fallback", async () => {
  const calls = await captureSearchCalls("Ｇ－ＧＯ");
  assert.equal(hasTickerCondition(calls, "Ｇ－ＧＯ"), false);
  assert.match(searchCondition(calls) ?? "", /company_name\.ilike\.\%Ｇ－ＧＯ\%/);
});

test("includes viewer-only earnings materials in the earnings filter", async () => {
  const query = new FakeQuery();
  const supabase = { from: () => query };
  await fetchEvents(supabase as never, { userId: "test-user", eventType: "earnings" });
  assert.deepEqual(
    query.calls.find((call) => call.method === "in" && call.column === "event_type"),
    { method: "in", column: "event_type", values: ["earnings", "earnings_material", "company_ir_material", "company_ir_video"] },
  );
});

test("returns a metadata-only material even when text extraction is empty", async () => {
  const material = {
    id: "material-1",
    created_at: "2026-08-31T04:00:00Z",
    detected_at: "2026-08-31T04:00:00Z",
    disclosed_at: "2026-08-31T04:00:00Z",
    ticker: "3928",
    company_name: "マイネット",
    market: null,
    event_type: "earnings_material",
    event_subtype: "pdf_only",
    headline: "2026年12月期 第２四半期 決算説明会 エグゼクティブサマリー",
    source_title: null,
    source_url: "https://www.release.tdnet.info/inbs/140120260831528661.pdf",
    pdf_url: "https://www.release.tdnet.info/inbs/140120260831528661.pdf",
    strength_score: null,
    priority_rank: 40,
    primary_metric_name: null,
    primary_metric_value: null,
    primary_metric_yoy: null,
    display_title: "2026年12月期 第２四半期 決算説明会 エグゼクティブサマリー",
    display_summary: "2Q決算説明会 要約",
    sort_key: null,
    dedupe_key: "doc-specific",
    notify_to_discord: false,
    discord_sent_at: null,
    archived_at: null,
    status: "active",
    schema_version: 1,
    raw_payload: { text_extract_status: "empty", extracted: { url_validated: true } },
  };
  const supabase = {
    from: (table: string) => new FakeQuery(table === "tdnet_events" ? [material] : []),
  };
  const result = await fetchEvents(supabase as never, { userId: "test-user", selectedDate: "2026-08-31" });
  assert.equal(result.length, 1);
  assert.equal(result[0].headline, material.headline);
  assert.equal(result[0].pdf_url, material.pdf_url);
});

test("filters management strategy independently", async () => {
  const query = new FakeQuery();
  const supabase = { from: () => query };
  await fetchEvents(supabase as never, { userId: "test-user", eventType: "management_strategy" });
  assert.deepEqual(
    query.calls.find((call) => call.method === "eq" && call.column === "event_type" && call.value === "management_strategy"),
    { method: "eq", column: "event_type", value: "management_strategy" },
  );
});

test("applies correction exclusions server-side for every list route", async () => {
  const scenarios = [
    {},
    { search: "3538" },
    { eventType: "earnings" },
    { eventType: "forecast" },
    { unreadOnly: true },
    { selectedDate: "2026-08-27" },
  ];

  for (const scenario of scenarios) {
    const query = new FakeQuery();
    const supabase = { from: () => query };
    await fetchEvents(supabase as never, { userId: "test-user", ...scenario });
    const exclusions = query.calls.filter((call) => call.method === "not");
    assert.ok(exclusions.some((call) => call.value === "%訂正%"));
    assert.ok(exclusions.some((call) => call.value === "%一部変更%"));
    assert.ok(!exclusions.some((call) => call.value.includes("修正")));
  }
});

test("omits stored result cards while preserving a decision card and its read lookup", async () => {
  const title = "自己株式立会外買付取引（ToSTNeT-3）による自己株式の取得結果に関するお知らせ";
  const rows = [
    { id: "7ced180f-0ace-4018-a972-458c51c00dc9", event_type: "buyback", event_subtype: "tostnet", headline: title, raw_payload: { extracted: { event_type: "buyback_result" } } },
    { id: "17bcf838-7a87-4200-9557-81b35f258937", event_type: "buyback", event_subtype: "tostnet", headline: title, raw_payload: { extracted: { event_type: "buyback_result" } } },
    { id: "decision", event_type: "buyback", event_subtype: "new_program", headline: "自己株式の取得及び取得結果の公表に関するお知らせ", raw_payload: { extracted: { event_type: "buyback_decision" } } },
  ];
  const queries = new Map<string, FakeQuery>();
  const supabase = { from: (table: string) => {
    const query = new FakeQuery(table === "tdnet_events" ? rows : []);
    queries.set(table, query);
    return query;
  } };
  const result = await fetchEvents(supabase as never, { userId: "test-user", selectedDate: "2026-10-13", skipClientSort: true });
  assert.deepEqual(result.map((event) => event.id), ["decision"]);
  assert.deepEqual(
    queries.get("tdnet_event_reads")?.calls.find((call) => call.method === "in" && call.column === "event_id"),
    { method: "in", column: "event_id", values: ["decision"] },
  );
});
