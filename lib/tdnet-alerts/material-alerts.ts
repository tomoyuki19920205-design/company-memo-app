import type { TdnetEvent } from "./types";

export const PDF_ONLY_MATERIAL_EVENT_TYPES = ["earnings_material", "monthly_update"] as const;

export function isPdfOnlyMaterialEvent(eventType: string): boolean {
  return PDF_ONLY_MATERIAL_EVENT_TYPES.includes(
    String(eventType ?? "").trim().toLowerCase() as (typeof PDF_ONLY_MATERIAL_EVENT_TYPES)[number],
  );
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
  return event.event_type === "earnings_material" ? "決算説明資料" : "月次";
}
