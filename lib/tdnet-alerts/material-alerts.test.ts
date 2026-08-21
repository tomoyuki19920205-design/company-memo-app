import assert from "node:assert/strict";
import test from "node:test";
import { getPdfOnlyMaterialLabel, isCompanyIrEvent, isPdfOnlyMaterialEvent } from "./material-alerts.ts";

test("recognizes all viewer-only material types", () => {
  assert.equal(isPdfOnlyMaterialEvent("earnings_material"), true);
  assert.equal(isPdfOnlyMaterialEvent("monthly_update"), true);
  assert.equal(isPdfOnlyMaterialEvent("management_strategy"), true);
  assert.equal(isPdfOnlyMaterialEvent("earnings"), false);
});

test("recognizes only company IR material and video events", () => {
  assert.equal(isCompanyIrEvent("company_ir_material"), true);
  assert.equal(isCompanyIrEvent("company_ir_video"), true);
  assert.equal(isCompanyIrEvent("earnings_material"), false);
});

test("uses the backend display label from raw payload", () => {
  const label = getPdfOnlyMaterialLabel({
    event_type: "monthly_update",
    display_summary: "月次",
    raw_payload: { extracted: { display_label: "7月月次" } },
  });
  assert.equal(label, "7月月次");
});

test("falls back to display summary and then a deterministic type label", () => {
  assert.equal(getPdfOnlyMaterialLabel({ event_type: "earnings_material", display_summary: "1Q決算説明資料", raw_payload: {} }), "1Q決算説明資料");
  assert.equal(getPdfOnlyMaterialLabel({ event_type: "monthly_update", display_summary: "", raw_payload: {} }), "月次");
  assert.equal(getPdfOnlyMaterialLabel({ event_type: "management_strategy", display_summary: "", raw_payload: {} }), "中期経営・戦略");
});
