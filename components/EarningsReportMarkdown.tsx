import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { isSafeSourceUrl } from "@/lib/news-filter";
export default function EarningsReportMarkdown({markdown}:{markdown:string}) {
  return <div className="ec-markdown"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm,remarkBreaks]} components={{
    a:({href,children})=>href&&isSafeSourceUrl(href)?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
    img:({alt})=><span>{alt}</span>,
    table:({children})=><div className="ec-table-scroll"><table>{children}</table></div>,
  }}>{markdown}</ReactMarkdown></div>;
}
