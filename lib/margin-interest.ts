export const MARGIN_SECTORS = [
  { code: "0050", name: "水産・農林業" }, { code: "1050", name: "鉱業" },
  { code: "2050", name: "建設業" }, { code: "3050", name: "食料品" },
  { code: "3100", name: "繊維製品" }, { code: "3150", name: "パルプ・紙" },
  { code: "3200", name: "化学" }, { code: "3250", name: "医薬品" },
  { code: "3300", name: "石油･石炭製品" }, { code: "3350", name: "ゴム製品" },
  { code: "3400", name: "ガラス･土石製品" }, { code: "3450", name: "鉄鋼" },
  { code: "3500", name: "非鉄金属" }, { code: "3550", name: "金属製品" },
  { code: "3600", name: "機械" }, { code: "3650", name: "電気機器" },
  { code: "3700", name: "輸送用機器" }, { code: "3750", name: "精密機器" },
  { code: "3800", name: "その他製品" }, { code: "4050", name: "電気･ガス業" },
  { code: "5050", name: "陸運業" }, { code: "5100", name: "海運業" },
  { code: "5150", name: "空運業" }, { code: "5200", name: "倉庫･運輸関連業" },
  { code: "5250", name: "情報･通信業" }, { code: "6050", name: "卸売業" },
  { code: "6100", name: "小売業" }, { code: "7050", name: "銀行業" },
  { code: "7100", name: "証券･商品先物取引業" }, { code: "7150", name: "保険業" },
  { code: "7200", name: "その他金融業" }, { code: "8050", name: "不動産業" },
  { code: "9050", name: "サービス業" },
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

export function initialMarginPeriod(now = new Date()): { from: string; to: string } {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear(), month = jst.getUTCMonth(), day = jst.getUTCDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const priorLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = new Date(Date.UTC(year, month - 1, Math.min(day, priorLastDay))).toISOString().slice(0, 10);
  return { from, to };
}
