const NY_INDEX_LABELS = new Set(["SOX", "S&P 500", "Dow", "Nasdaq", "Russell 2000"]);

/** One percentage formatter for NY index chips and the displayed report body. */
export function formatNyIndexPercent(value: number): string {
    if (!Number.isFinite(value)) throw new Error("NY index change must be finite");
    const fixed = value.toFixed(2);
    if (Number(fixed) === 0) return "0.00%";
    return `${value > 0 ? "+" : ""}${fixed}%`;
}

/** Normalize the visible five-index section without changing the saved report. */
export function normalizeNyIndexMarkdown(markdown: string): string {
    let inFiveIndexes = false;
    return markdown.replace(/\r\n?/g, "\n").split("\n").map((line) => {
        const heading = line.match(/^#{1,6}[ \t]+(.+?)[ \t]*$/);
        if (heading) {
            inFiveIndexes = heading[1] === "5指数";
            return line;
        }
        if (!inFiveIndexes) return line;
        const indexLine = line.match(/^([ \t]*)(SOX|S&P 500|Dow|Nasdaq|Russell 2000)([ \t\u3000]+)([+-]?(?:\d+(?:\.\d*)?|\.\d+))%([ \t]*)$/);
        if (!indexLine || !NY_INDEX_LABELS.has(indexLine[2])) return line;
        return `${indexLine[1]}${indexLine[2]}${indexLine[3]}${formatNyIndexPercent(Number(indexLine[4]))}${indexLine[5]}`;
    }).join("\n");
}
