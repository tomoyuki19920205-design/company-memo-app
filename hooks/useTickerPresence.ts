"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface PresenceUser {
    email: string;
    displayName: string;
    userId: string;
    joinedAt: string;
}

interface UseTickerPresenceResult {
    /** 同じtickerを閲覧中の他ユーザー一覧 */
    viewers: PresenceUser[];
    /** 自分含む全閲覧者数 */
    totalCount: number;
}

/**
 * Supabase Realtime Presence で ticker ごとの同時閲覧ユーザーを管理する。
 * ticker 変更時は前チャネルから自動 leave、unmount 時もクリーンアップ。
 */
export function useTickerPresence(
    ticker: string,
    userEmail?: string | null,
    userId?: string
): UseTickerPresenceResult {
    const [viewers, setViewers] = useState<PresenceUser[]>([]);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const supabaseRef = useRef(createSupabaseBrowser());

    const getDisplayName = useCallback((email: string) => {
        if (!email) return "Unknown";
        const atIdx = email.indexOf("@");
        return atIdx > 0 ? email.substring(0, atIdx) : email;
    }, []);

    useEffect(() => {
        // ticker がなければ何もしない
        if (!ticker || !userEmail) {
            setViewers([]);
            return;
        }

        const supabase = supabaseRef.current;
        const channelName = `viewer:ticker:${ticker}`;

        // 前チャネルのクリーンアップ
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        const channel = supabase.channel(channelName, {
            config: { presence: { key: userId || userEmail } },
        });

        const myPresence = {
            email: userEmail,
            displayName: getDisplayName(userEmail),
            userId: userId || "",
            joinedAt: new Date().toISOString(),
        };

        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState();
                const users: PresenceUser[] = [];
                const seen = new Set<string>();

                for (const key of Object.keys(state)) {
                    const presences = state[key];
                    for (const p of presences) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const data = p as any;
                        const email = data.email || "";
                        if (email && !seen.has(email) && email !== userEmail) {
                            seen.add(email);
                            users.push({
                                email,
                                displayName: data.displayName || getDisplayName(email),
                                userId: data.userId || "",
                                joinedAt: data.joinedAt || "",
                            });
                        }
                    }
                }

                setViewers(users);
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    await channel.track(myPresence);
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
            setViewers([]);
        };
    }, [ticker, userEmail, userId, getDisplayName]);

    return {
        viewers,
        totalCount: viewers.length + 1, // 自分含む
    };
}
