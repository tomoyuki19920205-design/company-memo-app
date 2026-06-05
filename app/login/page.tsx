"use client";

import React, { useState, useEffect, useRef } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [isInIframe, setIsInIframe] = useState(false);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // iframe内か検出（third-party Cookie制限でログイン不可の場合に警告表示）
    useEffect(() => {
        try {
            const inFrame = window.self !== window.top;
            setIsInIframe(inFrame);
            console.log("[login] isInIframe:", inFrame);
        } catch {
            // cross-origin iframeで window.top へのアクセスがブロックされた → iframe内確定
            setIsInIframe(true);
            console.log("[login] isInIframe: true (cross-origin blocked)");
        }
    }, []);

    // --- ブラウザ autofill 対策 ---
    // autofill は onChange を発火しないことがある。
    // フォーム submit 前に DOM の value を state に反映する。
    useEffect(() => {
        // autofill 検出: 短い間隔で DOM の value をチェック
        const timer = setInterval(() => {
            const emailVal = emailRef.current?.value || "";
            const passVal = passwordRef.current?.value || "";
            if (emailVal && emailVal !== email) setEmail(emailVal);
            if (passVal && passVal !== password) setPassword(passVal);
        }, 500);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // submit 直前に DOM の value を再取得 (autofill 最終保証)
        const finalEmail = emailRef.current?.value || email;
        const finalPassword = passwordRef.current?.value || password;

        if (!finalEmail || !finalPassword) {
            setError("メールアドレスとパスワードを入力してください");
            return;
        }

        setLoading(true);

        try {
            const supabase = createSupabaseBrowser();
            console.log("[login] signInWithPassword start, email:", finalEmail, "inIframe:", isInIframe);
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: finalEmail,
                password: finalPassword,
            });
            console.log("[login] signInWithPassword result:", { session: data.session?.access_token?.slice(0, 20), authError });

            if (authError) {
                console.error("[login] authError:", authError);
                if (authError.message.includes("Invalid login")) {
                    setError("メールアドレスまたはパスワードが正しくありません");
                } else {
                    setError(authError.message);
                }
                setLoading(false);
                return;
            }

            // ログイン成功 → viewer へ
            console.log("[login] success, redirecting to /");
            window.location.href = "/";
        } catch (err) {
            console.error("[login] exception:", err);
            setError("ログイン処理中にエラーが発生しました");
            setLoading(false);
        }
    };

    // ボタンの disabled 判定は loading のみ。
    // email/password の空チェックは submit handler で行う。
    // これにより autofill で state が未反映でもボタンは押せる。
    const isDisabled = loading;

    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">Company Viewer</h1>
                <p className="login-subtitle">企業詳細 Web Viewer — ログイン</p>

                {/* iframe内警告バナー */}
                {isInIframe && (
                    <div style={{
                        margin: "0 0 16px 0",
                        padding: "12px 14px",
                        background: "#fef3c7",
                        border: "1px solid #f59e0b",
                        borderRadius: 8,
                        fontSize: "0.82rem",
                        color: "#92400e",
                        lineHeight: 1.6,
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            ⚠️ 埋め込み表示中はログインできません
                        </div>
                        <div style={{ marginBottom: 10 }}>
                            ブラウザのセキュリティ設定により、iframe内での認証情報の保存が制限されています。<br />
                            新しいタブで開いてログインしてください。
                        </div>
                        <a
                            href={window.location.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "inline-block",
                                padding: "7px 14px",
                                background: "#f59e0b",
                                color: "white",
                                borderRadius: 6,
                                fontWeight: 700,
                                textDecoration: "none",
                                fontSize: "0.85rem",
                            }}
                        >
                            🔗 新しいタブでログインする
                        </a>
                    </div>
                )}

                <form onSubmit={handleLogin} className="login-form">
                    <div className="form-group">
                        <label htmlFor="email">メールアドレス</label>
                        <input
                            ref={emailRef}
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            autoFocus
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">パスワード</label>
                        <input
                            ref={passwordRef}
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="パスワード"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <button
                        type="submit"
                        className="btn-login"
                        disabled={isDisabled}
                    >
                        {loading ? "ログイン中..." : "ログイン"}
                    </button>
                </form>

                {/* デバッグ表示 (本番前に削除) */}
                <div style={{ marginTop: 16, padding: 8, background: "#f3f4f6", borderRadius: 6, fontSize: "0.75rem", color: "#6b7280" }}>
                    <div>📧 email: {email ? `"${email}"` : "(empty)"}</div>
                    <div>🔑 password length: {password.length}</div>
                    <div>⏳ loading: {String(loading)}</div>
                    <div>🔒 disabled: {String(isDisabled)}</div>
                </div>

                <p className="login-note">
                    招待されたユーザーのみ利用可能です
                </p>
            </div>
        </div>
    );
}
