import type { EnrichedEvent } from "./types";

type BuybackCard = {
  sharesLine: string;
  ratioLabel: string;
  provenance: string;
  sourceUrl: string;
  adjustmentUrl: string;
};

function count(value: unknown): number | null {
  const n = Number(value);
  return value == null || !Number.isSafeInteger(n) || n <= 0 ? null : n;
}

function extracted(event: EnrichedEvent): Record<string, unknown> {
  const raw = typeof event.raw_payload === "string"
    ? (() => { try { return JSON.parse(event.raw_payload); } catch { return {}; } })()
    : event.raw_payload;
  return raw && typeof raw === "object" && "extracted" in raw && raw.extracted && typeof raw.extracted === "object"
    ? raw.extracted as Record<string, unknown> : {};
}

const sharesText = (n: number): string => n % 10_000 === 0
  ? `${(n / 10_000).toLocaleString("ja-JP")}万株`
  : `${n.toLocaleString("ja-JP")}株`;

export function getBuybackCard(event: EnrichedEvent): BuybackCard | null {
  if (event.event_type !== "buyback") return null;
  const ext = extracted(event);
  const scope = String(ext.ratio_scope || "");
  const limit = count(ext.shares_limit);
  const acquired = count(ext.shares_acquired);
  const isTostnet = event.event_subtype === "tostnet" || scope === "transaction_limit";
  const shares = scope === "transaction_acquired" || scope === "period_acquired"
    ? acquired : (limit ?? acquired);
  const label = shares === limit
    ? (isTostnet ? "今回の買付上限株数" : "取得枠の上限株数")
    : "今回の取得株数";
  const ratio = Number(ext.ratio_to_outstanding);
  const numerator = count(ext.ratio_numerator_shares);
  const ratioSnippet = ext.extracted_json && typeof ext.extracted_json === "object"
    ? String((ext.extracted_json as Record<string, unknown>).raw_ratio_text || "") : "";
  // A legacy ratio can be paired with the sole stated limit. Otherwise require
  // the saved numerator to prove that the percentage describes these shares.
  const matching = shares != null && (numerator === shares ||
    (numerator == null && limit === shares && acquired == null));
  const shareRatioEvidence = ext.ratio_source === "calculated" || ext.ratio_source === "disclosed"
    || ratioSnippet.includes("発行済株式");
  const hasRatio = matching && shareRatioEvidence && ext.ratio_to_outstanding != null
    && Number.isFinite(ratio) && ratio >= 0;
  const calculated = ext.ratio_source === "calculated";
  const ratioLabel = hasRatio ? `${calculated ? "約" : ""}${ratio.toFixed(2)}%` : "";
  const sharesLine = shares == null ? "取得株数：開示から確認できません" :
    `${label}：${sharesText(shares)}${hasRatio ? `（自己株式を除く発行済株式数の${ratioLabel}、${calculated ? "算出値" : "開示値"}）` : ""}`;
  const denominator = count(ext.ratio_denominator_shares);
  const asOf = String(ext.ratio_denominator_as_of || "");
  const baseAsOf = String(ext.ratio_denominator_base_as_of || asOf);
  const adjustment = count(ext.ratio_denominator_adjustment_shares);
  const adjustmentAsOf = String(ext.ratio_denominator_adjustment_as_of || asOf);
  const beforeAcquisition = ext.ratio_denominator_timing === "before_acquisition";
  const baseShares = denominator && adjustment ? denominator + adjustment : denominator;
  const provenance = hasRatio && calculated && denominator && asOf
    ? `分母：${denominator.toLocaleString("ja-JP")}株（${asOf}${beforeAcquisition ? "の今回の取得前" : "時点"}、自己株式を除く発行済株式数。${baseAsOf}公表値${baseShares?.toLocaleString("ja-JP")}株${adjustment ? `から${adjustmentAsOf}までの累計取得${adjustment.toLocaleString("ja-JP")}株を控除` : ""}）`
    : "";
  return {
    sharesLine, ratioLabel, provenance,
    sourceUrl: typeof ext.ratio_denominator_source_url === "string" ? ext.ratio_denominator_source_url : "",
    adjustmentUrl: typeof ext.ratio_denominator_adjustment_source_url === "string" ? ext.ratio_denominator_adjustment_source_url : "",
  };
}
