import assert from "node:assert/strict";
import test from "node:test";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { TdnetEvent } from "./types";
import { subscribeToAlertChanges } from "./realtime-subscription";

function fixture() {
  const handlers = new Map<string, (payload: { new: unknown }) => void>();
  const inserted: TdnetEvent[] = [];
  let refreshes = 0;
  const channel = {
    on(_type: string, filter: { event: string }, handler: (payload: { new: unknown }) => void) {
      handlers.set(filter.event, handler);
      return this;
    },
  };
  subscribeToAlertChanges(channel as unknown as RealtimeChannel, {
    onInsert: (event) => inserted.push(event),
    onUpdate: () => refreshes++,
  });
  return {
    emit: (type: string, row: unknown) => {
      assert.ok(handlers.has(type), `Missing ${type} subscription`);
      handlers.get(type)!({ new: row });
    },
    inserted,
    refreshes: () => refreshes,
  };
}

test("an existing ID moved into today's date requests a fresh filtered list", () => {
  const f = fixture();
  f.emit("UPDATE", { id: "existing-forecast", disclosed_at: "2026-09-28T06:30:00Z", headline: "業績予想の修正に関するお知らせ", status: "active" });
  assert.equal(f.refreshes(), 1);
  assert.equal(f.inserted.length, 0, "updates must not fabricate unread/new notifications");
});

test("updates that become hidden also refresh the list", () => {
  const f = fixture();
  f.emit("UPDATE", { id: "existing", headline: "決算短信の一部訂正", status: "inactive" });
  assert.equal(f.refreshes(), 1);
  assert.equal(f.inserted.length, 0);
});

test("inserts still apply the existing correction policy", () => {
  const f = fixture();
  f.emit("INSERT", { id: "correction", headline: "決算短信の一部訂正" });
  f.emit("INSERT", { id: "forecast", headline: "業績予想の修正に関するお知らせ" });
  assert.deepEqual(f.inserted.map((e) => e.id), ["forecast"]);
  assert.equal(f.refreshes(), 0);
});
