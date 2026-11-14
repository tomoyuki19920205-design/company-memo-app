import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichedEvent } from "./types";

type Detail = Pick<EnrichedEvent, "summary" | "formatted_message" | "raw_payload">;
// Object identity invalidates on a fresh list response; WeakMap releases old days.
// The nested key isolates auth contexts even if callers reuse an event object.
const cache = new WeakMap<EnrichedEvent, { userId: string; expires: number; value: Promise<Detail> }>();

export function fetchCachedEventDetail(client: SupabaseClient, event: EnrichedEvent, userId: string): Promise<Detail> {
  const hit = cache.get(event);
  if (hit && hit.userId === userId && hit.expires > Date.now()) return hit.value;
  const value = (async () => {
    const { data, error } = await client.from("tdnet_events")
      .select("summary, formatted_message, raw_payload").eq("id", event.id).single();
    if (error) throw error;
    return data as Detail;
  })();
  const entry = { userId, expires: Date.now() + 30_000, value };
  cache.set(event, entry);
  void value.catch(() => { if (cache.get(event) === entry) cache.delete(event); });
  return value;
}
