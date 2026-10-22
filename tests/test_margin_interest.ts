import assert from "node:assert/strict";
import test from "node:test";
import { MARGIN_SECTORS, formatIndexClose, formatMarginOku, initialMarginPeriod, jpxCorrectionDifference, type MarginRow } from "../lib/margin-interest";

test("33 formal sectors are unique and ordered by code", () => {
  assert.equal(MARGIN_SECTORS.length, 33);
  const codes = MARGIN_SECTORS.map(({ code }) => code);
  assert.deepEqual(codes, [...codes].sort());
  assert.equal(new Set(codes).size, 33);
  assert.equal(MARGIN_SECTORS.find(({ code }) => code === "2050")?.name, "建設業");
});

test("missing values remain distinct from actual zero and yen remain precise until rendering", () => {
  assert.equal(formatMarginOku(null), "—");
  assert.equal(formatMarginOku(0), "0.00");
  assert.equal(formatMarginOku("1234567890"), "12.35");
  assert.equal(formatIndexClose(null), "—");
  assert.equal(formatIndexClose("64621.24"), "64,621.24");
});

test("JST calendar month initial range clamps month end", () => {
  assert.deepEqual(initialMarginPeriod(new Date("2026-10-22T09:00:00Z")),
    { from: "2026-09-22", to: "2026-10-22" });
  assert.deepEqual(initialMarginPeriod(new Date("2026-03-31T00:00:00Z")),
    { from: "2026-02-28", to: "2026-03-31" });
});

test("known JPX correction warning disappears when the saved total catches up", () => {
  const row = { date: "2026-10-20", long_value_yen: "4702399017881", short_value_yen: "488441704442" } as MarginRow;
  assert.equal(jpxCorrectionDifference(row)?.long, BigInt("1935911601319"));
  assert.equal(jpxCorrectionDifference(row)?.short, BigInt("192855713269"));
  assert.equal(jpxCorrectionDifference({ ...row, long_value_yen: "6638310619200", short_value_yen: "681297417711" }), null);
});
