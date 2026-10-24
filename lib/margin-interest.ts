export const MARGIN_SECTORS = [
  { code: "0050", indexCode: "0040", name: "水産・農林業" }, { code: "1050", indexCode: "0041", name: "鉱業" },
  { code: "2050", indexCode: "0042", name: "建設業" }, { code: "3050", indexCode: "0043", name: "食料品" },
  { code: "3100", indexCode: "0044", name: "繊維製品" }, { code: "3150", indexCode: "0045", name: "パルプ・紙" },
  { code: "3200", indexCode: "0046", name: "化学" }, { code: "3250", indexCode: "0047", name: "医薬品" },
  { code: "3300", indexCode: "0048", name: "石油･石炭製品" }, { code: "3350", indexCode: "0049", name: "ゴム製品" },
  { code: "3400", indexCode: "004A", name: "ガラス･土石製品" }, { code: "3450", indexCode: "004B", name: "鉄鋼" },
  { code: "3500", indexCode: "004C", name: "非鉄金属" }, { code: "3550", indexCode: "004D", name: "金属製品" },
  { code: "3600", indexCode: "004E", name: "機械" }, { code: "3650", indexCode: "004F", name: "電気機器" },
  { code: "3700", indexCode: "0050", name: "輸送用機器" }, { code: "3750", indexCode: "0051", name: "精密機器" },
  { code: "3800", indexCode: "0052", name: "その他製品" }, { code: "4050", indexCode: "0053", name: "電気･ガス業" },
  { code: "5050", indexCode: "0054", name: "陸運業" }, { code: "5100", indexCode: "0055", name: "海運業" },
  { code: "5150", indexCode: "0056", name: "空運業" }, { code: "5200", indexCode: "0057", name: "倉庫･運輸関連業" },
  { code: "5250", indexCode: "0058", name: "情報･通信業" }, { code: "6050", indexCode: "0059", name: "卸売業" },
  { code: "6100", indexCode: "005A", name: "小売業" }, { code: "7050", indexCode: "005B", name: "銀行業" },
  { code: "7100", indexCode: "005C", name: "証券･商品先物取引業" }, { code: "7150", indexCode: "005D", name: "保険業" },
  { code: "7200", indexCode: "005E", name: "その他金融業" }, { code: "8050", indexCode: "005F", name: "不動産業" },
  { code: "9050", indexCode: "0060", name: "サービス業" },
] as const;

export type MarginRow = {
  date: string;
  published_date: string | null;
  fetched_at: string;
  updated_at: string;
  row_count: number;
  topix_close: string | number | null;
  nikkei_close: string | number | null;
  long_value_yen: string | number | null;
  short_value_yen: string | number | null;
  sector_long_yen: Record<string, string | number>;
  sector_index_close: Record<string, string | number>;
  outside_long_yen: string | number | null;
  outside_count: number;
  unknown_long_yen: string | number | null;
  unknown_count: number;
  source_frequency?: "weekly";
  long_volume?: string | number;
  sector_long_volume?: Record<string, string | number>;
  outside_long_volume?: string | number;
  unknown_long_volume?: string | number;
  money_reason?: string | null;
  money_source?: string | null;
  market_scope?: string;
  market_source_jpx_url?: string | null;
  market_source_nse_url?: string | null;
  market_source_unit_yen?: number | null;
};

export type MarginFrequency = "daily" | "weekly";
export type MarginViewRow = {
  date: string;
  row: MarginRow | null;
  comparisonDate: string | null;
  comparisonRow: MarginRow | null;
  provisional: boolean;
  missing: boolean;
};

export type MarginIndexBar = {
  open: string | number | null;
  high: string | number | null;
  low: string | number | null;
  close: string | number | null;
};
export type MarginIndexBars = Record<string, Record<string, MarginIndexBar>>;
export type MarginChartPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  marginOku: number | null;
  provisional: boolean;
  missing: boolean;
};

function shiftDate(day: string, offset: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

/** ISO calendar week, independent of the browser's time zone. */
export function marginWeekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDate(day, -(weekday === 0 ? 6 : weekday - 1));
}

/** Use the official trading calendar so missing dates never fall back silently. */
export function buildMarginViewRows(
  rows: MarginRow[], calendarDays: string[], from: string, to: string,
  frequency: MarginFrequency, latestDate: string | null,
): MarginViewRow[] {
  // The API sends saved weekly aggregates first, then daily rows. Daily values
  // take priority on overlapping dates; old weeks remain available to weekly mode.
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days = [...new Set(calendarDays)].sort();
  if (frequency === "daily") {
    const previous = new Map(days.map((day, index) => [day, days[index - 1] ?? null]));
    return rows.filter((row) => row.source_frequency !== "weekly" && from <= row.date && row.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row) => {
        const comparisonDate = previous.get(row.date) ?? null;
        return { date: row.date, row, comparisonDate,
          comparisonRow: comparisonDate ? byDate.get(comparisonDate) ?? null : null,
          provisional: false, missing: false };
      });
  }

  const finalByWeek = new Map<string, string>();
  for (const day of days) finalByWeek.set(marginWeekStart(day), day);
  const latestWeek = latestDate ? marginWeekStart(latestDate) : null;
  const weekly: MarginViewRow[] = [];
  for (const [weekStart, expectedFinal] of finalByWeek) {
    if (weekStart < marginWeekStart(from) || weekStart > marginWeekStart(to)) continue;
    const finalRow = byDate.get(expectedFinal) ?? null;
    const provisionalRow = weekStart === latestWeek && latestDate && latestDate <= to
      ? byDate.get(latestDate) ?? null : null;
    let date: string;
    let row: MarginRow | null;
    let provisional = false;
    let missing = false;
    if (finalRow) {
      date = expectedFinal;
      row = finalRow;
    } else if (provisionalRow && latestDate && latestDate < expectedFinal) {
      date = latestDate;
      row = provisionalRow;
      provisional = true;
    } else if (latestWeek && weekStart < latestWeek) {
      date = expectedFinal;
      row = null;
      missing = true;
    } else {
      continue;
    }
    if (date < from || date > to) continue;
    const comparisonDate = finalByWeek.get(shiftDate(weekStart, -7)) ?? null;
    weekly.push({ date, row, comparisonDate,
      comparisonRow: comparisonDate ? byDate.get(comparisonDate) ?? null : null,
      provisional, missing });
  }
  return weekly.sort((a, b) => b.date.localeCompare(a.date));
}

function chartNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function completeChartBar(value: MarginIndexBar | undefined) {
  if (!value) return null;
  const open = chartNumber(value.open), high = chartNumber(value.high);
  const low = chartNumber(value.low), close = chartNumber(value.close);
  if (open === null || high === null || low === null || close === null ||
      high < Math.max(open, close) || low > Math.min(open, close) || low > high) return null;
  return { open, high, low, close };
}

/** Index days extend independently; credit money is used only on its actual balance date. */
export function buildMarginChartPoints(
  viewRows: MarginViewRow[], calendarDays: string[], bars: MarginIndexBars,
  sectorCode: string, indexCode: string, frequency: MarginFrequency,
  weeklyBars: MarginIndexBars = {}, range?: { from: string; to: string },
): MarginChartPoint[] {
  return buildChartPoints(viewRows, calendarDays, bars, indexCode, frequency, weeklyBars,
    (row) => row.sector_long_yen?.[sectorCode], range);
}

/** Market money uses the same saved Tokyo-market amount as the normal table and ratio. */
export function buildMarginMarketChartPoints(
  viewRows: MarginViewRow[], calendarDays: string[], bars: MarginIndexBars,
  frequency: MarginFrequency, weeklyBars: MarginIndexBars = {},
  range?: { from: string; to: string },
): MarginChartPoint[] {
  return buildChartPoints(viewRows, calendarDays, bars, "TOPIX", frequency, weeklyBars,
    (row) => row.long_value_yen, range);
}

function buildChartPoints(
  viewRows: MarginViewRow[], calendarDays: string[], bars: MarginIndexBars,
  indexCode: string, frequency: MarginFrequency, weeklyBars: MarginIndexBars,
  moneyFor: (row: MarginRow) => string | number | null | undefined,
  range?: { from: string; to: string },
): MarginChartPoint[] {
  const days = [...new Set(calendarDays)].sort();
  const byDate = new Map(viewRows.map((item) => [item.date, item]));
  const chartDates = new Set(viewRows.map((item) => item.date));
  if (range) {
    const indexDates = Object.keys(bars).filter((day) =>
      range.from <= day && day <= range.to && completeChartBar(bars[day]?.[indexCode]));
    if (frequency === "daily") {
      for (const day of indexDates) chartDates.add(day);
    } else {
      // A new index day may follow the latest published balance in the same week.
      // Keep both actual dates so the newer index does not inherit old money.
      const latestByWeek = new Map<string, string>();
      for (const day of indexDates.sort()) latestByWeek.set(marginWeekStart(day), day);
      for (const day of latestByWeek.values()) chartDates.add(day);
      for (const day of Object.keys(weeklyBars)) {
        if (range.from <= day && day <= range.to && completeChartBar(weeklyBars[day]?.[indexCode])) {
          chartDates.add(day);
        }
      }
    }
  }
  return [...chartDates].sort().map((date) => {
    const item = byDate.get(date);
    const indexDays = frequency === "daily" ? [date] : days.filter((day) =>
      marginWeekStart(day) === marginWeekStart(date) && day <= date);
    const complete = indexDays.map((day) => completeChartBar(bars[day]?.[indexCode]));
    const savedWeekly = frequency === "weekly" ? completeChartBar(weeklyBars[date]?.[indexCode]) : null;
    const derived = indexDays.length && complete.every((bar) => bar !== null)
      ? { open: complete[0]!.open, high: Math.max(...complete.map((bar) => bar!.high)),
          low: Math.min(...complete.map((bar) => bar!.low)), close: complete[complete.length - 1]!.close }
      : null;
    const ohlc = savedWeekly ?? derived;
    const money = item?.row ? moneyFor(item.row) : null;
    const marginOku = money === null || money === undefined || money === "" ||
      !Number.isFinite(Number(money)) || Number(money) < 0 ? null : Number(money) / 100_000_000;
    return { date, open: ohlc?.open ?? null, high: ohlc?.high ?? null,
      low: ohlc?.low ?? null, close: ohlc?.close ?? null, marginOku,
      provisional: item?.provisional ?? false, missing: item?.missing ?? false };
  });
}

// JPX corrected its 19/20 October issue-level PDFs after their first release.
// The current J-Quants values match the original PDFs. Keep this reference
// visible until a J-Quants refresh agrees with the corrected official totals.
const JPX_CORRECTED_TOTALS: Record<string, { long: string; short: string; url: string }> = {
  "2026-10-19": {
    long: "6636732028331", short: "682230795708",
    url: "https://www.jpx.co.jp/markets/statistics-equities/margin/tvdivq0000001rnl-att/20261019_mtall_01.pdf",
  },
  "2026-10-20": {
    long: "6638310619200", short: "681297417711",
    url: "https://www.jpx.co.jp/markets/statistics-equities/margin/tvdivq0000001rnl-att/20261020_mtall_01.pdf",
  },
};

export function jpxCorrectionDifference(row: MarginRow): { long: bigint; short: bigint; url: string } | null {
  const reference = JPX_CORRECTED_TOTALS[row.date];
  if (!reference || row.long_value_yen === null || row.short_value_yen === null) return null;
  const long = BigInt(reference.long) - BigInt(row.long_value_yen);
  const short = BigInt(reference.short) - BigInt(row.short_value_yen);
  return long === BigInt(0) && short === BigInt(0) ? null : { long, short, url: reference.url };
}

const twoDecimals = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatMarginOku(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const yen = Number(value);
  return Number.isFinite(yen) ? twoDecimals.format(yen / 100_000_000) : "—";
}
export function formatIndexClose(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const points = Number(value);
  return Number.isFinite(points) ? twoDecimals.format(points) : "—";
}

type ExactDecimal = { integer: bigint; places: number };
function positiveClose(value: string | number | null | undefined): ExactDecimal | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const integer = BigInt(whole + fraction);
  return integer > BigInt(0) ? { integer, places: fraction.length } : null;
}

function nonnegativeYen(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined || value === "" || !/^\d+$/.test(String(value))) return null;
  return BigInt(String(value));
}

export type MarginDirection = "up" | "down" | null;
function direction(left: bigint, right: bigint): MarginDirection {
  return left > right ? "up" : left < right ? "down" : null;
}

export function indexDirection(current: string | number | null | undefined,
                               previous: string | number | null | undefined): MarginDirection {
  const a = positiveClose(current), b = positiveClose(previous);
  if (!a || !b) return null;
  return direction(a.integer * BigInt(10) ** BigInt(b.places),
                   b.integer * BigInt(10) ** BigInt(a.places));
}

/** Compare raw yen/points fractions; display rounding cannot change the arrow. */
export function marginRatioDirection(currentYen: string | number | null | undefined,
                                     currentClose: string | number | null | undefined,
                                     previousYen: string | number | null | undefined,
                                     previousClose: string | number | null | undefined): MarginDirection {
  const aYen = nonnegativeYen(currentYen), bYen = nonnegativeYen(previousYen);
  const aClose = positiveClose(currentClose), bClose = positiveClose(previousClose);
  if (aYen === null || bYen === null || !aClose || !bClose) return null;
  return direction(aYen * BigInt(10) ** BigInt(aClose.places) * bClose.integer,
                   bYen * BigInt(10) ** BigInt(bClose.places) * aClose.integer);
}

/** Rounded only at display, from integer yen and the saved exact decimal close. */
export function formatMarginRatio(yen: string | number | null | undefined,
                                  close: string | number | null | undefined): string {
  const money = nonnegativeYen(yen), points = positiveClose(close);
  if (money === null || !points) return "—";
  const denominator = BigInt(100_000_000) * points.integer;
  const numerator = money * BigInt(10_000) * BigInt(10) ** BigInt(points.places);
  const rounded = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  const integerPart = (rounded / BigInt(10_000)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${integerPart}.${(rounded % BigInt(10_000)).toString().padStart(4, "0")}`;
}

export function initialMarginPeriod(now = new Date()): { from: string; to: string } {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear(), month = jst.getUTCMonth(), day = jst.getUTCDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const priorLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = new Date(Date.UTC(year, month - 1, Math.min(day, priorLastDay))).toISOString().slice(0, 10);
  return { from, to };
}
