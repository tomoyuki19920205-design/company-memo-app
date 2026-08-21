import assert from "node:assert/strict";
import test from "node:test";
import { fetchEvents } from "./queries.ts";

type RecordedCall =
  | { method: "eq"; column: string; value: unknown }
  | { method: "in"; column: string; values: unknown[] }
  | { method: "or"; condition: string };

class FakeQuery {
  readonly calls: RecordedCall[] = [];

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  not() { return this; }
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
    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
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

test("filters management strategy independently", async () => {
  const query = new FakeQuery();
  const supabase = { from: () => query };
  await fetchEvents(supabase as never, { userId: "test-user", eventType: "management_strategy" });
  assert.deepEqual(
    query.calls.find((call) => call.method === "eq" && call.column === "event_type" && call.value === "management_strategy"),
    { method: "eq", column: "event_type", value: "management_strategy" },
  );
});
