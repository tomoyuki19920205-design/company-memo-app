"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import AlertsPage from "@/components/tdnet-alerts/AlertsPage";
import type { User } from "@supabase/supabase-js";

export default function TdnetAlertsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const supabase = createSupabaseBrowser();

        // 初回認証チェック
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) {
                router.replace("/login");
            } else {
                setUser(data.user);
            }
            setAuthLoading(false);
        });

        // セッション変化を監視
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" || !session?.user) {
                router.replace("/login");
            } else {
                setUser(session.user);
            }
        });

        return () => subscription.unsubscribe();
    }, [router]);

    if (authLoading) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                fontSize: "0.9rem",
                color: "var(--text-muted)",
            }}>
                認証中...
            </div>
        );
    }

    if (!user) return null;

    return <AlertsPage userId={user.id} userEmail={user.email ?? ""} />;
}
