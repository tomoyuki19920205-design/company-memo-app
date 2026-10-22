import assert from "node:assert/strict";
import test from "node:test";
import { MARGIN_SECTORS, buildMarginChartPoints, buildMarginViewRows, formatIndexClose, formatMarginOku, formatMarginRatio,
  indexDirection, initialMarginPeriod, jpxCorrectionDifference, marginRatioDirection, marginWeekStart,
  type MarginRow } from "../lib/margin-interest";

const dated = (day: string, yen = "100000000"): MarginRow => ({
  date: day, published_date: null, fetched_at: "2026-10-22T00:00:00Z",
  updated_at: "2026-10-22T00:00:00Z", row_count: 1,
  long_value_yen: yen, short_value_yen: "0", topix_close: "1000", nikkei_close: "10000",
  sector_long_yen: { "0050": yen }, sector_index_close: { "0040": "500" },
  outside_long_yen: "0", outside_count: 0, unknown_long_yen: "0", unknown_count: 0,
});

test("33 formal sectors are unique and ordered by code", () => {
  assert.equal(MARGIN_SECTORS.length, 33);
  const codes = MARGIN_SECTORS.map(({ code }) => code);
  assert.deepEqual(codes, [...codes].sort());
  assert.equal(new Set(codes).size, 33);
  assert.equal(MARGIN_SECTORS.find(({ code }) => code === "2050")?.name, "建設業");
  assert.equal(MARGIN_SECTORS[0].indexCode, "0040");
  assert.equal(MARGIN_SECTORS[32].indexCode, "0060");
  assert.equal(new Set(MARGIN_SECTORS.map(({ indexCode }) => indexCode)).size, 33);
});

test("ratio uses exact yen, exact same-date close, four decimal places, and keeps zero distinct", () => {
  assert.equal(formatMarginRatio("1234567890123", "1234.56"), "10.0001");
  assert.equal(formatMarginRatio("0", "1234.56"), "0.0000");
  assert.equal(formatMarginRatio(null, "1234.56"), "—");
  assert.equal(formatMarginRatio("100000000", null), "—");
  assert.equal(formatMarginRatio("100000000", "0"), "—");
  assert.equal(formatMarginRatio("100000000", "-1"), "—");
  assert.equal(formatMarginRatio("100000000", "2"), "0.5000");
});

test("arrows compare unrounded values and each ratio independently from its index", () => {
  assert.equal(formatMarginRatio("100000001", "1000"), formatMarginRatio("100000000", "1000"));
  assert.equal(marginRatioDirection("100000001", "1000", "100000000", "1000"), "up");
  assert.equal(marginRatioDirection("900", "2", "1000", "1"), "down");
  assert.equal(indexDirection("2", "1"), "up");
  assert.equal(indexDirection("1000.00", "1000"), null);
  assert.equal(marginRatioDirection("0", "1000", "0", "1000"), null);
  assert.equal(marginRatioDirection("100", "1000", null, "1000"), null);
  assert.equal(indexDirection("1000", null), null);
  assert.equal(indexDirection("0", "1000"), null);
});

test("daily comparisons use the immediate trading date including one before the requested range", () => {
  const rows = [dated("2026-10-19"), dated("2026-10-21")];
  const calendar = ["2026-10-19", "2026-10-20", "2026-10-21"];
  const view = buildMarginViewRows(rows, calendar, "2026-10-21", "2026-10-21", "daily", "2026-10-21");
  assert.deepEqual(view.map(({ date, comparisonDate, comparisonRow }) =>
    [date, comparisonDate, comparisonRow?.date ?? null]),
  [["2026-10-21", "2026-10-20", null]]);
  const complete = buildMarginViewRows([...rows, dated("2026-10-20")], calendar,
    "2026-10-21", "2026-10-21", "daily", "2026-10-21");
  assert.equal(complete[0].comparisonRow?.date, "2026-10-20");
});

test("weekly uses holiday-adjusted final day, flags missing finals and the latest provisional week", () => {
  assert.equal(marginWeekStart("2026-10-04"), "2026-09-28");
  const calendar = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
    "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09",
    "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16",
    "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  const rows = [dated("2026-10-01"), dated("2026-10-08"), dated("2026-10-16"), dated("2026-10-21")];
  const weekly = buildMarginViewRows(rows, calendar, "2026-09-28", "2026-10-22", "weekly", "2026-10-21");
  assert.deepEqual(weekly.map(({ date, provisional, missing, comparisonDate, comparisonRow }) =>
    [date, provisional, missing, comparisonDate, comparisonRow?.date ?? null]), [
    ["2026-10-21", true, false, "2026-10-16", "2026-10-16"],
    ["2026-10-16", false, false, "2026-10-09", null],
    ["2026-10-09", false, true, "2026-10-01", "2026-10-01"],
    ["2026-10-01", false, false, null, null],
  ]);
  const narrow = buildMarginViewRows(rows, calendar, "2026-10-20", "2026-10-21", "weekly", "2026-10-21");
  assert.deepEqual(narrow.map(({ date, comparisonDate }) => [date, comparisonDate]),
    [["2026-10-21", "2026-10-16"]]);
});

test("daily charts use exact balance date OHLC and distinguish missing money from zero", () => {
  const rows = [dated("2026-10-20", "0"), dated("2026-10-21")];
  const days = ["2026-10-20", "2026-10-21"];
  const view = buildMarginViewRows(rows, days, days[0], days[1], "daily", days[1]);
  const bars = {
    "2026-10-20": { "0040": { open: "10", high: "13", low: "9", close: "11" } },
    "2026-10-21": { "0040": { open: null, high: "14", low: "10", close: "12" } },
  };
  const points = buildMarginChartPoints(view, days, bars, "0050", "0040", "daily");
  assert.deepEqual(points.map(({ date, open, close, marginOku }) => [date, open, close, marginOku]), [
    [days[0], 10, 11, 0], [days[1], null, null, 1],
  ]);
  assert.equal(buildMarginChartPoints(view, days, bars, "1050", "0041", "daily")[0].marginOku, null);
});

test("weekly candle combines provider days through provisional balance date and uses final balance only", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  const view = buildMarginViewRows([dated(days[0], "200000000"), dated(days[2], "300000000")],
    days, days[0], days[2], "weekly", days[2]);
  const bars = {
    [days[0]]: { "0040": { open: "10", high: "12", low: "9", close: "11" } },
    [days[1]]: { "0040": { open: "11", high: "14", low: "10", close: "13" } },
    [days[2]]: { "0040": { open: "13", high: "15", low: "12", close: "14" } },
  };
  const [point] = buildMarginChartPoints(view, days, bars, "0050", "0040", "weekly");
  assert.deepEqual([point.date, point.open, point.high, point.low, point.close,
    point.marginOku, point.provisional], [days[2], 10, 15, 9, 14, 3, true]);
  delete (bars as Record<string, unknown>)[days[1]];
  assert.equal(buildMarginChartPoints(view, days, bars, "0050", "0040", "weekly")[0].open, null);
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
