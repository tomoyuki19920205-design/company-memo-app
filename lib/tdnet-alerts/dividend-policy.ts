import type { TdnetEvent } from "./types";

export interface DividendPolicyDisplay {
  detected: boolean;
  label: "配当方針変更" | "還元方針変更" | "";
  summary: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function getDividendPolicyDisplay(
  event: Pick<TdnetEvent, "headline" | "raw_payload">,
): DividendPolicyDisplay {
  const raw = asObject(event.raw_payload);
  const extracted = asObject(raw.extracted);
  const headline = String(event.headline || "");
  const titleDetected = /(?:配当方針|株主還元方針|利益還元方針)(?:の)?(?:変更|見直し|改定|導入|撤廃|廃止)/.test(headline);
  const detected = extracted.policy_change_detected === true || titleDetected;
  if (!detected) return { detected: false, label: "", summary: "" };

  const storedLabel = String(extracted.policy_change_label || "");
  const returnScope = extracted.policy_change_scope === "shareholder_return_policy"
    || /(?:株主|利益)還元方針/.test(headline);
  const label = storedLabel === "還元方針変更" || returnScope
    ? "還元方針変更"
    : "配当方針変更";
  const summary = String(extracted.policy_change_summary || "").trim();
  return { detected: true, label, summary };
}

export function getDividendBaseLabel(eventSubtype: string | null | undefined): string {
  if (eventSubtype === "increase") return "増配";
  if (eventSubtype === "decrease") return "減配";
  return "配当修正";
}

export function getDividendCompositeLabel(
  event: Pick<TdnetEvent, "event_subtype" | "headline" | "raw_payload">,
): string {
  const base = getDividendBaseLabel(event.event_subtype);
  const policy = getDividendPolicyDisplay(event);
  return policy.detected ? `${base}・${policy.label}` : base;
}

export function getDividendCompositeBodyLabel(
  event: Pick<TdnetEvent, "event_subtype" | "headline" | "raw_payload">,
): string {
  const base = getDividendBaseLabel(event.event_subtype);
  const policy = getDividendPolicyDisplay(event);
  return policy.detected ? `${base}／${policy.label}` : base;
}
