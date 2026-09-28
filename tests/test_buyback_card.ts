import assert from "node:assert/strict";
import test from "node:test";
import { getBuybackCard } from "../lib/tdnet-alerts/buyback-card";
import type { EnrichedEvent } from "../lib/tdnet-alerts/types";

const event = (extracted: Record<string, unknown>, subtype = "tostnet") => ({
  event_type: "buyback", event_subtype: subtype, raw_payload: { extracted },
}) as unknown as EnrichedEvent;

test("current purchase limit and derived ratio stay paired", () => {
  const card = getBuybackCard(event({
    shares_limit: 560_000, shares_acquired_cumulative: 2_110_400,
    ratio_numerator_shares: 560_000, ratio_scope: "transaction_limit",
    ratio_to_outstanding: 1.2446, ratio_source: "calculated",
    ratio_denominator_shares: 44_994_705,
    ratio_denominator_as_of: "2026-09-28",
    ratio_denominator_base_as_of: "2026-06-30",
    ratio_denominator_adjustment_shares: 2_110_400,
  }));
  assert.match(card!.sharesLine, /今回の買付上限株数：56万株.*約1\.24%、算出値/);
  assert.match(card!.provenance, /44,994,705株.*2026-06-30公表値47,105,105株.*2,110,400株/);
});

test("disclosed program percentage remains disclosed", () => {
  const card = getBuybackCard(event({
    shares_limit: 4_000_000, ratio_numerator_shares: 4_000_000,
    ratio_scope: "program_limit", ratio_to_outstanding: 8.5,
    ratio_source: "disclosed",
  }, "resolution"));
  assert.match(card!.sharesLine, /取得枠の上限株数：400万株.*8\.50%、開示値/);
});

test("old program ratio cannot attach to this purchase", () => {
  const card = getBuybackCard(event({
    shares_limit: 560_000, shares_acquired_cumulative: 2_110_400,
    ratio_numerator_shares: 4_000_000, ratio_scope: "program_limit",
    ratio_to_outstanding: 8.5, ratio_source: "disclosed",
  }));
  assert.equal(card!.ratioLabel, "");
  assert.equal(card!.sharesLine, "今回の買付上限株数：56万株");
});

test("unknown denominator retains only count", () => {
  const card = getBuybackCard(event({ shares_limit: 560_000, ratio_scope: "transaction_limit" }));
  assert.equal(card!.sharesLine, "今回の買付上限株数：56万株");
});

test("legacy percentage needs evidence that it is a share ratio", () => {
  const marketCap = getBuybackCard(event({
    shares_limit: 200_000, ratio_to_outstanding: 0.98,
    extracted_json: { raw_ratio_text: "取得金額の時価総額比 0.98%" },
  }, "new_program"));
  assert.equal(marketCap!.ratioLabel, "");
  const issuedShares = getBuybackCard(event({
    shares_limit: 200_000, ratio_to_outstanding: 0.98,
    extracted_json: { raw_ratio_text: "発行済株式総数（自己株式を除く）に対する割合 0.98%" },
  }, "new_program"));
  assert.equal(issuedShares!.ratioLabel, "0.98%");
});
