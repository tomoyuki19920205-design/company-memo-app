import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ用 Supabase クライアント (認証セッション連携)
 * @supabase/ssr の createBrowserClient はブラウザCookieで
 * セッションを自動管理する。
 */
export function createSupabaseBrowser() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
