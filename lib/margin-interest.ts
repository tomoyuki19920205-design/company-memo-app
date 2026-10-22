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
};

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

/** Rounded only at display, from integer yen and the saved exact decimal close. */
export function formatMarginRatio(yen: string | number | null | undefined,
                                  close: string | number | null | undefined): string {
  if (yen === null || yen === undefined || yen === "" || close === null || close === undefined || close === "") return "—";
  const money = String(yen), points = String(close);
  if (!/^\d+$/.test(money) || !/^\d+(?:\.\d+)?$/.test(points)) return "—";
  const [whole, fraction = ""] = points.split(".");
  const scaledClose = BigInt(whole + fraction);
  if (scaledClose <= BigInt(0)) return "—";
  const denominator = BigInt(100_000_000) * scaledClose;
  const numerator = BigInt(money) * BigInt(10_000) * BigInt(10) ** BigInt(fraction.length);
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
