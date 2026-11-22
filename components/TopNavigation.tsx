import React from "react";
import Link from "next/link";

type TopNavigationPage = "company" | "screening" | "news" | "margin" | "calendar";

const navigationItems: Array<{
  key: TopNavigationPage | "iv";
  href: string;
  label: string;
  external?: boolean;
}> = [
  { key: "company", href: "/tdnet-alerts", label: "COMPANY VIEWER" },
  { key: "screening", href: "/screening", label: "SCREENING" },
  { key: "news", href: "/news", label: "NEWS" },
  { key: "margin", href: "/margin-interest", label: "信用買い残" },
  { key: "calendar", href: "/earnings-calendar", label: "カレンダー" },
  { key: "iv", href: "https://nikkei-iv-snapshot-mikami.beautifulbiscuit16.chatgpt.site", label: "IV", external: true },
];

export default function TopNavigation({ active }: { active: TopNavigationPage }) {
  return (
    <nav className="top-navigation" aria-label="共通ナビゲーション">
      {navigationItems.map((item) => item.external ? (
        <a key={item.key} href={item.href} className="site-link">
          {item.label}
        </a>
      ) : (
        <Link
          key={item.key}
          href={item.href}
          className={`site-link${active === item.key ? " active" : ""}`}
          aria-current={active === item.key ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
