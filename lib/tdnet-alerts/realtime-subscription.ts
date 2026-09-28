import type { RealtimeChannel } from "@supabase/supabase-js";
import type { TdnetEvent } from "./types";
import { isNotificationEventVisible } from "./notification-policy";

export function subscribeToAlertChanges(
  channel: RealtimeChannel,
  callbacks: { onInsert: (event: TdnetEvent) => void; onUpdate: () => void }
) {
  return channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tdnet_events" },
      (payload) => {
        const event = payload.new as TdnetEvent;
        if (isNotificationEventVisible(event)) callbacks.onInsert(event);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tdnet_events" },
      () => {
        // An existing ID can enter or leave the current date/filter. Refetch
        // with the user's read/star state instead of fabricating an unread row.
        callbacks.onUpdate();
      }
    );
}
