import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Middleware — 認証ガード
 *
 * - /login, /auth/callback, _next/*, favicon.ico はスルー
 * - それ以外はセッション確認 → 未認証なら /login へリダイレクト
 * - セッションリフレッシュも実行
 */
export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // セッション更新 (重要: getUser を呼ぶことでトークンリフレッシュ)
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // DEV BYPASS: 一時的にログインバイパス (確認後 revert)
    if (process.env.NODE_ENV === "development") {
        return supabaseResponse;
    }

    // 未認証 → /login へリダイレクト (公開ルートは除外)
    if (!user && !request.nextUrl.pathname.startsWith("/login") &&
        !request.nextUrl.pathname.startsWith("/auth")) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    // 認証済みで /login にアクセス → / へリダイレクト
    if (user && request.nextUrl.pathname.startsWith("/login")) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * 以下を除外:
         * - _next/static, _next/image
         * - favicon.ico, sitemap.xml, robots.txt
         */
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    ],
};
