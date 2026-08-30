import { isSafeSourceUrl } from "@/lib/news-filter";

function inline(value: string) {
    const parts = value.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
    return parts.map((part, index) => {
        const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (!match || !isSafeSourceUrl(match[2])) return part;
        return <a href={match[2]} key={`${match[2]}-${index}`} target="_blank" rel="noopener noreferrer">{match[1]}</a>;
    });
}

export default function SectorReportMarkdown({ markdown }: { markdown: string }) {
    const blocks: React.ReactNode[] = [];
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    let bullets: string[] = [];
    const flush = () => {
        if (bullets.length) blocks.push(<ul key={`ul-${blocks.length}`}>{bullets.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
        bullets = [];
    };
    lines.forEach((raw) => {
        const line = raw.trim();
        if (!line) { flush(); return; }
        const bullet = line.match(/^(?:[-*・])\s*(.+)$/);
        if (bullet) { bullets.push(bullet[1]); return; }
        flush();
        if (line.startsWith("### ")) blocks.push(<h4 key={blocks.length}>{inline(line.slice(4))}</h4>);
        else if (line.startsWith("## ")) blocks.push(<h3 key={blocks.length}>{inline(line.slice(3))}</h3>);
        else if (line.startsWith("# ")) blocks.push(<h2 key={blocks.length}>{inline(line.slice(2))}</h2>);
        else blocks.push(<p key={blocks.length}>{inline(line.replace(/^\*\*(.+)\*\*$/, "$1"))}</p>);
    });
    flush();
    return <div className="sector-markdown">{blocks}</div>;
}
