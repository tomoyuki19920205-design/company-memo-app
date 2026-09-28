"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import type { TdnetEvent } from "./types";
import { audioManager } from "./audio";
import { subscribeToAlertChanges } from "./realtime-subscription";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseRealtimeAlertsOptions {
  onNewEvent?: (event: TdnetEvent) => void;
  onUpdatedEvent?: () => void;
}

export function useRealtimeAlerts(opts: UseRealtimeAlertsOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onNewEventRef = useRef(opts.onNewEvent);
  onNewEventRef.current = opts.onNewEvent;
  const onUpdatedEventRef = useRef(opts.onUpdatedEvent);
  onUpdatedEventRef.current = opts.onUpdatedEvent;

  const subscribe = useCallback(() => {
    const supabase = createSupabaseBrowser();
    setStatus("connecting");

    const channel = subscribeToAlertChanges(
      supabase.channel("tdnet_events_realtime"),
      {
        onInsert: (newEvent) => {
          onNewEventRef.current?.(newEvent);
          // 音通知
          audioManager.playNotification(newEvent.id);
        },
        onUpdate: () => onUpdatedEventRef.current?.(),
      }
    )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setStatus("connected");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setStatus("disconnected");
        }
      });

    channelRef.current = channel;
  }, []);

  useEffect(() => {
    subscribe();

    return () => {
      if (channelRef.current) {
        const supabase = createSupabaseBrowser();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setStatus("disconnected");
    };
  }, [subscribe]);

  return { status };
}
