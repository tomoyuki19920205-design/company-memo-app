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
  constructor(private readonly rows: unknown[] = []) {}

  select() { return this; }
  order() { return this; }
  limit() { return this; }
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
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

async function captureSearchCalls(search: string): Promise<RecordedCall[]> {
  const query = new FakeQuery();
  const supabase = { from: () => query };

  await fetchEvents(supabase as never, { userId: "test-user", search });
  return query.calls;
}

function hasTickerCondition(calls: RecordedCall[], ticker: string): boolean {
  return calls.some((call) =>
    (call.method === "eq" && call.column === "ticker" && call.value === ticker)
    || (call.method === "or" && call.condition.includes(`ticker.eq.${ticker}`)),
  );
}

function searchCondition(calls: RecordedCall[]): string | undefined {
  return calls.find((call) => call.method === "or")?.condition;
}

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
