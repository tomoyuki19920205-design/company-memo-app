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
