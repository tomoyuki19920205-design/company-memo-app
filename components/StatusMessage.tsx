"use client";

import React from "react";

interface StatusMessageProps {
    type: "loading" | "error" | "empty";
    message?: string;
}

export default function StatusMessage({ type, message }: StatusMessageProps) {
    const defaultMessages = {
        loading: "読込中...",
        error: "読み込みに失敗しました",
        empty: "該当なし",
    };

    const text = message || defaultMessages[type];
    const className = `status-message status-${type}`;

    return <div className={className}>{text}</div>;
}
