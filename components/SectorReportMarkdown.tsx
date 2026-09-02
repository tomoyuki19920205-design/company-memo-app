import React from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { isSafeSourceUrl } from "@/lib/news-filter";

const MATERIAL_LABELS = new Set([
    "確認できた事実",
    "日本企業への波及",
    "利益への影響",
    "株価への織り込み",
    "反対材料・注意点",
    "業績方向",
    "試算",
    "推計",
    "仮説",
]);

function nodeText(node: React.ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(nodeText).join("");
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
    return "";
}

function materialHeadingClass(children: React.ReactNode): string | undefined {
    return /^材料\d+[:：]/u.test(nodeText(children).trim())
        ? "sector-material-heading"
        : undefined;
}

function materialLabelClass(children: React.ReactNode): string | undefined {
    return MATERIAL_LABELS.has(nodeText(children).trim())
        ? "sector-material-label"
        : undefined;
}

type ReportMarkdownType = "sector_weekly" | "ny_market_daily";

export default function SectorReportMarkdown({ markdown, reportType }: { markdown: string; reportType: ReportMarkdownType }) {
    const normalized = markdown.replace(/\r\n?/g, "\n");
    const isSectorWeekly = reportType === "sector_weekly";

    return <div className="sector-markdown" data-report-type={reportType}>
        <ReactMarkdown
            remarkPlugins={[remarkBreaks]}
            components={{
                h1: ({ children }) => <h2>{children}</h2>,
                h2: ({ children }) => <h3>{children}</h3>,
                h3: ({ children }) => <h4 className={isSectorWeekly ? materialHeadingClass(children) : undefined}>{children}</h4>,
                p: ({ children }) => <p className={isSectorWeekly ? materialLabelClass(children) : undefined}>{children}</p>,
                a: ({ href, children }) => href && isSafeSourceUrl(href)
                    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    : <span>{children}</span>,
            }}
        >
            {normalized}
        </ReactMarkdown>
    </div>;
}
