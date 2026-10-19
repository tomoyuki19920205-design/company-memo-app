import type { TdnetEvent } from "./types";

export type ForecastReasonSection = {
  heading: string;
  context: string[];
  text: string;
  page_start: number;
  page_end: number;
};

export type ForecastReasonStatus = "available" | "not_present" | "source_unavailable" | "extraction_failed" | "scope_unverified" | "environment_error" | "unavailable";

export function getForecastReason(event: TdnetEvent): { url: string | null; sections: ForecastReasonSection[]; status: ForecastReasonStatus } {
  const url = [event.pdf_url, event.source_url].find(value => {
    try { return value && new URL(value).protocol === "https:"; } catch { return false; }
  }) || null;
  let payload: unknown = event.raw_payload;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { return { url, sections: [], status: "unavailable" }; }
  }
  const extracted = (payload as { extracted?: Record<string, unknown> } | null)?.extracted;
  const reason = extracted?.revision_reason as { version?: number; status?: string; source_url?: string; sections?: unknown } | undefined;
  const failureStatuses: ForecastReasonStatus[] = ["not_present", "source_unavailable", "extraction_failed", "scope_unverified", "environment_error"];
  if (reason?.version === 1 && (reason.source_url || null) === url &&
      failureStatuses.includes(reason.status as ForecastReasonStatus)) {
    return { url, sections: [], status: reason.status as ForecastReasonStatus };
  }
  // Only render native text tied to this exact disclosure, never generic summaries.
  if (!url || reason?.version !== 1 || reason.status !== "available" || reason.source_url !== url || !Array.isArray(reason.sections)) {
    return { url, sections: [], status: "unavailable" };
  }
  const valid = reason.sections.every((s: ForecastReasonSection) => s && typeof s.heading === "string" &&
    Array.isArray(s.context) && s.context.every(v => typeof v === "string") &&
    typeof s.text === "string" && s.text.trim().length > 0 && Number.isInteger(s.page_start) && s.page_start >= 1 &&
    Number.isInteger(s.page_end) && s.page_end >= s.page_start);
  return { url, sections: valid ? reason.sections : [], status: valid ? "available" : "unavailable" };
}
