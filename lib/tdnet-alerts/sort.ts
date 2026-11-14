type SortableAlert = {
  disclosed_at: string | null;
  detected_at: string;
  ticker: unknown;
};

const TICKER_PATTERN = /^[0-9]+(?:[A-Z][A-Z0-9]*)?$/;

function disclosureMinute(event: SortableAlert): number {
  const timestamp = event.disclosed_at || event.detected_at;
  const milliseconds = new Date(timestamp).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 60_000) : Number.NEGATIVE_INFINITY;
}

function normalizedTicker(ticker: unknown): string | null {
  if (typeof ticker !== "string") return null;
  const normalized = ticker.trim().toUpperCase();
  return normalized && TICKER_PATTERN.test(normalized) ? normalized : null;
}

function compareDigitTokens(a: string, b: string): number {
  const normalizedA = a.replace(/^0+(?=\d)/, "");
  const normalizedB = b.replace(/^0+(?=\d)/, "");
  if (normalizedA.length !== normalizedB.length) return normalizedA.length - normalizedB.length;
  const lexical = normalizedA.localeCompare(normalizedB);
  return lexical || a.length - b.length;
}

function compareTickers(tokensA: string[] | null, tokensB: string[] | null): number {
  if (tokensA === null || tokensB === null) {
    if (tokensA === tokensB) return 0;
    return tokensA === null ? 1 : -1;
  }
  for (let index = 0; index < Math.max(tokensA.length, tokensB.length); index += 1) {
    const tokenA = tokensA[index];
    const tokenB = tokensB[index];
    if (tokenA === undefined || tokenB === undefined) return tokenA === undefined ? -1 : 1;
    if (tokenA === tokenB) continue;

    const aIsDigits = /^\d+$/.test(tokenA);
    const bIsDigits = /^\d+$/.test(tokenB);
    if (aIsDigits && bIsDigits) return compareDigitTokens(tokenA, tokenB);
    if (aIsDigits !== bIsDigits) return aIsDigits ? -1 : 1;
    return tokenA.localeCompare(tokenB);
  }
  return 0;
}

/**
 * Alert list order: displayed disclosure minute desc, ticker asc, then input order.
 * The decorated index makes the existing deterministic DB/client order the final tie-breaker.
 */
export function sortAlertsByDisclosureTimeAndTicker<T extends SortableAlert>(events: readonly T[]): T[] {
  return events
    // Date parsing and ticker tokenization happen once per row, not per comparison.
    .map((event, index) => ({ event, index, minute: disclosureMinute(event), tokens: normalizedTicker(event.ticker)?.match(/\d+|[A-Z]+/g) ?? null }))
    .sort((a, b) => {
      const timeComparison = b.minute - a.minute;
      if (timeComparison !== 0) return timeComparison;

      const tickerComparison = compareTickers(a.tokens, b.tokens);
      return tickerComparison || a.index - b.index;
    })
    .map(({ event }) => event);
}
