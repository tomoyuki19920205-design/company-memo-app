"use client";

import React, { useState, useEffect, useRef } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

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
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: finalEmail,
                password: finalPassword,
            });

            if (authError) {
                if (authError.message.includes("Invalid login")) {
                    setError("メールアドレスまたはパスワードが正しくありません");
                } else {
                    setError(authError.message);
                }
                setLoading(false);
                return;
            }

            // ログイン成功 → viewer へ
            window.location.href = "/";
        } catch {
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
