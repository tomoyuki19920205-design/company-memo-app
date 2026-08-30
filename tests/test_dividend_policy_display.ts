import assert from "node:assert/strict";
import test from "node:test";

import {
  getDividendCompositeBodyLabel,
  getDividendCompositeLabel,
  getDividendPolicyDisplay,
} from "../lib/tdnet-alerts/dividend-policy";

const event = (headline: string, extracted: Record<string, unknown>, event_subtype = "undecided") => ({
  headline,
  event_subtype,
  raw_payload: { extracted },
});

test("amount-only dividend revision remains 配当修正", () => {
  const row = event("配当予想の修正に関するお知らせ", {});
  assert.equal(getDividendCompositeLabel(row as never), "配当修正");
  assert.equal(getDividendPolicyDisplay(row as never).detected, false);
});

test("dividend policy change is appended without creating another event", () => {
  const row = event("配当方針の変更及び配当予想の修正", {
    policy_change_detected: true,
    policy_change_scope: "dividend_policy",
    policy_change_label: "配当方針変更",
    policy_change_summary: "DOE3%を導入",
  });
  assert.equal(getDividendCompositeLabel(row as never), "配当修正・配当方針変更");
  assert.equal(getDividendCompositeBodyLabel(row as never), "配当修正／配当方針変更");
  assert.equal(getDividendPolicyDisplay(row as never).summary, "DOE3%を導入");
});

test("shareholder return policy change uses 還元方針変更", () => {
  const row = event("株主還元方針の変更及び配当予想の修正", {
    policy_change_detected: true,
    policy_change_scope: "shareholder_return_policy",
  });
  assert.equal(getDividendCompositeLabel(row as never), "配当修正・還元方針変更");
});

test("245A title fallback still exposes the policy change if extraction is empty", () => {
  const row = event(
    "配当方針の変更及び2026年８月期配当予想の修正（初配）に関するお知らせ",
    {},
  );
  assert.equal(getDividendCompositeLabel(row as never), "配当修正・配当方針変更");
});
