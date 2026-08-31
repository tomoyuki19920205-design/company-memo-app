import type { TdnetEvent } from "./types";

export const PDF_ONLY_MATERIAL_EVENT_TYPES = ["earnings_material", "monthly_update", "management_strategy"] as const;
export const COMPANY_IR_EVENT_TYPES = ["company_ir_material", "company_ir_video"] as const;

export function isPdfOnlyMaterialEvent(eventType: string): boolean {
  return PDF_ONLY_MATERIAL_EVENT_TYPES.includes(
    String(eventType ?? "").trim().toLowerCase() as (typeof PDF_ONLY_MATERIAL_EVENT_TYPES)[number],
  );
}

export function isCompanyIrEvent(eventType: string): boolean {
  return COMPANY_IR_EVENT_TYPES.includes(
    String(eventType ?? "").trim().toLowerCase() as (typeof COMPANY_IR_EVENT_TYPES)[number],
  );
}

type LinkableMaterialEvent = Pick<TdnetEvent, "event_type" | "source_url" | "pdf_url" | "raw_payload">;

function parsedPayload(event: Pick<TdnetEvent, "raw_payload">): Record<string, unknown> {
  if (typeof event.raw_payload !== "string") return event.raw_payload ?? {};
  try { return JSON.parse(event.raw_payload) as Record<string, unknown>; }
  catch { return {}; }
}

export function getValidatedMaterialUrl(event: LinkableMaterialEvent): string {
  if (!isPdfOnlyMaterialEvent(event.event_type) && !isCompanyIrEvent(event.event_type)) return "";
  const raw = parsedPayload(event);
  const extracted = raw.extracted && typeof raw.extracted === "object"
    ? raw.extracted as Record<string, unknown>
    : {};
  if (extracted.url_validated === false) return "";

  const candidate = String(event.pdf_url || event.source_url || "").trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (!(["http:", "https:"].includes(url.protocol))) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) return "";
    if (event.event_type === "company_ir_video") return url.toString();
    const decoded = decodeURIComponent(`${url.pathname}${url.search}`).toLowerCase();
    const verifiedOfficialPage = extracted.url_validated === true && extracted.url_kind === "official_page";
    if (!/\.pdf(?:$|[?&#])/.test(decoded) && !verifiedOfficialPage) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function isLinkableMaterialEvent(event: LinkableMaterialEvent): boolean {
  return Boolean(getValidatedMaterialUrl(event));
}

type MaterialLabelEvent = Pick<TdnetEvent, "event_type" | "display_summary" | "raw_payload">;

export function getPdfOnlyMaterialLabel(event: MaterialLabelEvent): string {
  if (!isPdfOnlyMaterialEvent(event.event_type)) return "";

  const raw = typeof event.raw_payload === "string"
    ? (() => {
        try { return JSON.parse(event.raw_payload) as Record<string, unknown>; }
        catch { return {}; }
      })()
    : event.raw_payload;
  const extracted = raw && typeof raw === "object" && raw.extracted && typeof raw.extracted === "object"
    ? raw.extracted as Record<string, unknown>
    : {};
  const payloadLabel = typeof extracted.display_label === "string" ? extracted.display_label.trim() : "";
  if (payloadLabel) return payloadLabel;
  if (event.display_summary?.trim()) return event.display_summary.trim();
  if (event.event_type === "earnings_material") return "決算説明資料";
  if (event.event_type === "management_strategy") return "中期経営・戦略";
  return "月次";
}

type MaterialCardEvent = Pick<
  TdnetEvent,
  "event_type" | "headline" | "display_summary" | "source_url" | "pdf_url" | "raw_payload"
>;

/** Keep metadata-only cards useful even when extraction produced no body. */
export function getPdfOnlyMaterialCardContent(event: MaterialCardEvent): {
  label: string;
  title: string;
  url: string;
} {
  return {
    label: getPdfOnlyMaterialLabel(event),
    title: String(event.headline || "").trim(),
    url: getValidatedMaterialUrl(event),
  };
}
