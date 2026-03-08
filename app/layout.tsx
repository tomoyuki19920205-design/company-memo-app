import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Company Viewer",
    description: "企業詳細Web Viewer — PL・修正開示・月次・KPI・メモ",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ja">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
