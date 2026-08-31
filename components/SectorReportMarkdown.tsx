import React from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { isSafeSourceUrl } from "@/lib/news-filter";

export default function SectorReportMarkdown({ markdown }: { markdown: string }) {
    const normalized = markdown.replace(/\r\n?/g, "\n");

    return <div className="sector-markdown">
        <ReactMarkdown
            remarkPlugins={[remarkBreaks]}
            components={{
                h1: ({ children }) => <h2>{children}</h2>,
                h2: ({ children }) => <h3>{children}</h3>,
                h3: ({ children }) => <h4>{children}</h4>,
                a: ({ href, children }) => href && isSafeSourceUrl(href)
                    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    : <span>{children}</span>,
            }}
        >
            {normalized}
        </ReactMarkdown>
    </div>;
}
