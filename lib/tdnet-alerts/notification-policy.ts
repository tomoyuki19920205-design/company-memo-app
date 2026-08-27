import type { TdnetEvent } from "./types";

/** Normalize harmless TDNET title variants before notification classification. */
export function normalizeNotificationTitle(title: string | null | undefined): string {
  return String(title ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Correction disclosures stay in the source/canonical data but are not cards.
 * ``修正`` is deliberately not matched because forecast/dividend revisions are
 * normal important notifications.
 */
export function isCorrectionDisclosureTitle(title: string | null | undefined): boolean {
  const normalized = normalizeNotificationTitle(title);
  return normalized.includes("訂正") || normalized.includes("一部変更");
}

export function isNotificationEventVisible(
  event: Pick<TdnetEvent, "headline">,
): boolean {
  return !isCorrectionDisclosureTitle(event.headline);
}

/** Apply the same exclusion to PostgREST before limit/date/search pagination. */
export function applyNotificationTitleExclusions<T extends {
  not(column: string, operator: string, value: string): T;
}>(query: T): T {
  return query
    .not("headline", "ilike", "%訂正%")
    .not("headline", "ilike", "%一部変更%");
}
