import type { TdnetEvent } from "./types";

type CapitalEvent = Pick<TdnetEvent, "event_type" | "event_subtype" | "raw_payload">;

function payload(event: CapitalEvent): Record<string, unknown> {
  const raw = typeof event.raw_payload === "string"
    ? (() => { try { return JSON.parse(event.raw_payload) as Record<string, unknown>; } catch { return {}; } })()
    : event.raw_payload ?? {};
  return raw.extracted && typeof raw.extracted === "object"
    ? raw.extracted as Record<string, unknown>
    : {};
}

const shares = (value: unknown): string => `${Number(value).toLocaleString("ja-JP")}株`;
const pct = (value: unknown): string => `${Number(value).toFixed(2)}%`;
const yen = (value: unknown): string => `${Number(value).toLocaleString("ja-JP")}円`;

export function formatCapitalActionCard(event: CapitalEvent): string | null {
  if (event.event_type !== "capital_action") return null;
  const ext = payload(event);
  const actions = Array.isArray(ext.actions) ? ext.actions.map(String) : [];
  const actionLabels = [
    actions.includes("capital_increase") ? "増資" : null,
    actions.includes("share_offering") ? "株式売出し" : null,
    actions.includes("off_exchange_distribution") ? "立会外分売" : null,
  ].filter(Boolean);
  const statusLabel: Record<string, string> = {
    conditions_decided: "更新", implemented: "更新", completed: "終了",
    corrected: "訂正", cancelled: "中止",
  };
  const prefix = statusLabel[event.event_subtype ?? ""];
  const statusDetail = typeof ext.status_detail === "string" ? ext.status_detail : "";
  const heading = prefix && statusDetail ? `${prefix}：${statusDetail}` : `${prefix ? `${prefix}：` : ""}${actionLabels.join("・") || "資本・株式需給"}`;
  const lines = [`【${heading}】`];

  if (actions.includes("capital_increase")) {
    if (ext.new_shares != null) lines.push(`新規発行株数：${shares(ext.new_shares)}`);
    if (ext.new_shares_ratio != null) lines.push(`増資前発行済株式数比：${pct(ext.new_shares_ratio)}`);
    if (ext.additional_new_shares != null && ext.max_new_shares != null) {
      lines.push(`追加発行分を含む最大発行株数：${shares(ext.max_new_shares)}`);
    }
    if (ext.max_new_shares_ratio != null && ext.additional_new_shares != null) lines.push(`最大発行株数比率：${pct(ext.max_new_shares_ratio)}`);
  }
  if (actions.includes("share_offering")) {
    if (ext.offering_shares != null) lines.push(`売出株数：${shares(ext.offering_shares)}`);
    if (ext.offering_ratio != null) lines.push(`発行済株式数比：${pct(ext.offering_ratio)}`);
    if (ext.offering_oa_shares != null && ext.offering_max_shares != null) lines.push(`OA含む最大売出株数：${shares(ext.offering_max_shares)}`);
    if (ext.offering_max_ratio != null && ext.offering_oa_shares != null) lines.push(`OA含む最大比率：${pct(ext.offering_max_ratio)}`);
  }
  if (actions.includes("off_exchange_distribution") && ext.distribution_shares != null) {
    lines.push(`分売株数：${shares(ext.distribution_shares)}`);
  }
  if (ext.ratio_unavailable_reason && !actions.includes("off_exchange_distribution")) {
    lines.push(`比率：算出不可（${String(ext.ratio_unavailable_reason)}）`);
  }

  const dates: [string, unknown][] = [
    ["価格決定期間", ext.price_decision_date_or_period], ["申込期間", ext.application_period],
    ["払込期日", ext.payment_date], ["割当日", ext.allotment_date], ["効力発生日", ext.effective_date],
    ["受渡期日", ext.delivery_date], ["分売予定期間", ext.distribution_planned_period],
    ["分売実施日", ext.distribution_date],
  ];
  for (const [label, value] of dates) if (value) lines.push(`${label}：${String(value)}`);
  if (ext.distribution_price_yen != null) lines.push(`分売価格：${yen(ext.distribution_price_yen)}`);
  if (ext.distribution_purchase_limit_shares != null) lines.push(`買付申込数量限度：${shares(ext.distribution_purchase_limit_shares)}`);
  return lines.join("\n");
}
