import assert from "node:assert/strict";
import test from "node:test";
import { getPdfOnlyMaterialCardContent, getPdfOnlyMaterialLabel, getValidatedMaterialUrl, isCompanyIrEvent, isLinkableMaterialEvent, isPdfOnlyMaterialEvent } from "./material-alerts";

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

test("keeps only externally linkable material URLs", () => {
  const valid = {
    event_type: "earnings_material",
    source_url: null,
    pdf_url: "https://www.release.tdnet.info/inbs/140120260825525465.pdf",
    raw_payload: { extracted: { url_validated: true } },
  } as any;
  assert.match(getValidatedMaterialUrl(valid), /^https:\/\//);
  assert.equal(isLinkableMaterialEvent(valid), true);
  assert.equal(isLinkableMaterialEvent({ ...valid, pdf_url: null }), false);
  assert.equal(isLinkableMaterialEvent({ ...valid, pdf_url: "/documents/guessed.pdf" }), false);
  assert.equal(isLinkableMaterialEvent({ ...valid, pdf_url: "https://example.com/not-found" }), false);
  assert.equal(isLinkableMaterialEvent({
    ...valid,
    raw_payload: { extracted: { url_validated: false } },
  }), false);
});

test("metadata-only card keeps the complete title, label, and PDF URL", () => {
  const event = {
    event_type: "earnings_material",
    headline: "2026年12月期 第２四半期 決算説明会 書き起こし要約",
    display_summary: "2Q決算説明会 書き起こし",
    source_url: "https://www.release.tdnet.info/inbs/140120260831528656.pdf",
    pdf_url: "https://www.release.tdnet.info/inbs/140120260831528656.pdf",
    raw_payload: {
      text_extract_status: "empty",
      extracted: { display_label: "2Q決算説明会 書き起こし", url_validated: true },
    },
  } as any;
  assert.deepEqual(getPdfOnlyMaterialCardContent(event), {
    label: "2Q決算説明会 書き起こし",
    title: event.headline,
    url: event.pdf_url,
  });
});
