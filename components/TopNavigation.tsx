import Link from "next/link";

type TopNavigationPage = "company" | "screening" | "news";

const navigationItems: Array<{
  key: TopNavigationPage;
  href: string;
  label: string;
}> = [
  { key: "company", href: "/tdnet-alerts", label: "COMPANY VIEWER" },
  { key: "screening", href: "/screening", label: "SCREENING" },
  { key: "news", href: "/news", label: "NEWS" },
];

export default function TopNavigation({ active }: { active: TopNavigationPage }) {
  return (
    <nav className="top-navigation" aria-label="共通ナビゲーション">
      {navigationItems.map((item) => (
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
