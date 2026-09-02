import assert from "node:assert/strict";
import test from "node:test";
import { formatCapitalActionCard } from "./capital-actions";

const event = (extracted: Record<string, unknown>, subtype = "announced") => ({
  event_type: "capital_action", event_subtype: subtype, raw_payload: { extracted },
});

test("formats a combined capital increase and OA offering", () => {
  const text = formatCapitalActionCard(event({
    actions: ["capital_increase", "share_offering"], new_shares: 2_000_000,
    new_shares_ratio: 5, additional_new_shares: 300_000, max_new_shares: 2_300_000,
    max_new_shares_ratio: 5.75, offering_shares: 1_000_000, offering_ratio: 2.5,
    offering_oa_shares: 150_000, offering_max_shares: 1_150_000, offering_max_ratio: 2.875,
  }));
  assert.match(text ?? "", /【増資・株式売出し】/);
  assert.match(text ?? "", /増資前発行済株式数比：5\.00%/);
  assert.match(text ?? "", /OA含む最大比率：2\.88%/);
});

test("distribution never displays a ratio", () => {
  const text = formatCapitalActionCard(event({
    actions: ["off_exchange_distribution"], distribution_shares: 200_000,
    issued_shares_before: 10_000_000, distribution_date: "2026/09/09",
    distribution_price_yen: 1245, distribution_purchase_limit_shares: 500,
  })) ?? "";
  assert.match(text, /分売株数：200,000株/);
  assert.doesNotMatch(text, /比率|発行済株式数比/);
});

test("formats update and unavailable ratio reason", () => {
  const text = formatCapitalActionCard(event({
    actions: ["capital_increase"], new_shares: 2_000_000,
    ratio_unavailable_reason: "発行済株式数を確認できず",
  }, "corrected")) ?? "";
  assert.match(text, /【訂正：増資】/);
  assert.match(text, /比率：算出不可/);
});
