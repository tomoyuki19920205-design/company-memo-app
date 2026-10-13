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

function isNewBuybackDecisionTitle(title: string): boolean {
  return /取得に係る事項(?:の決定)?|取得枠(?:の)?(?:設定|拡大|増額)|自己株式(?:の)?取得(?:の)?決定|自己株式の取得及び取得結果の公表|取得実施の決定/u.test(title);
}

function isBuybackProgressTitle(title: string): boolean {
  return /取得(?:の)?(?:状況|進捗|結果|終了|完了)|月次(?:進捗|報告)|買付(?:け)?(?:の)?結果|取得が(?:終了|完了)/u.test(title);
}

/** Keep old rows intact while excluding buyback progress from the alert list. */
type VisibilityEvent = Pick<TdnetEvent, "headline"> & {
  event_type?: string;
  event_subtype?: string | null;
  raw_payload?: unknown;
};

export function isBuybackProgressEvent(event: VisibilityEvent): boolean {
  if (event.event_type !== "buyback") return false;
  const title = normalizeNotificationTitle(event.headline).replace(/\s+/gu, "");
  if (isNewBuybackDecisionTitle(title)) return false;
  const raw = typeof event.raw_payload === "string"
    ? (() => { try { return JSON.parse(event.raw_payload); } catch { return {}; } })()
    : event.raw_payload;
  const extracted = raw && typeof raw === "object" ? (raw as Record<string, unknown>).extracted : null;
  const extractedType = extracted && typeof extracted === "object"
    ? (extracted as Record<string, unknown>).event_type : null;
  return isBuybackProgressTitle(title)
    || ["buyback_status", "buyback_result"].includes(String(extractedType ?? ""))
    || ["status", "result"].includes(event.event_subtype ?? "");
}

export function isNotificationEventVisible(
  event: VisibilityEvent,
): boolean {
  return !isCorrectionDisclosureTitle(event.headline) && !isBuybackProgressEvent(event);
}

/** Apply the same exclusion to PostgREST before limit/date/search pagination. */
export function applyNotificationTitleExclusions<T extends {
  not(column: string, operator: string, value: string): T;
}>(query: T): T {
  return query
    .not("headline", "ilike", "%訂正%")
    .not("headline", "ilike", "%一部変更%");
}
