import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase クライアント (認証セッション連携)
 *
 * すべてのDBアクセスはこのクライアント経由で行う。
 * createBrowserClient は Cookie ベースでセッションを管理するため、
 * ログイン済みユーザーの JWT が自動的にリクエストに付与される。
 * これにより RLS の auth.uid() / auth.jwt() が機能する。
 */
export const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
