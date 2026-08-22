const COMPACT_YOY_STATUS: Record<string, string> = {
  "赤字継続": "Y赤継",
  "赤字転落": "Y赤転",
  "赤転": "Y赤転",
  "黒字転換": "Y黒転",
  "黒転": "Y黒転",
  "黒字継続": "Y黒継",
  "赤字縮小": "Y赤縮",
  "赤字拡大": "Y赤拡",
};

/**
 * 決算通知カードの業績行だけを短縮するpresentation formatter。
 * DB値やformatCardSummaryの内部表現は変更しない。
 */
export const formatCompactEarningsCardLine = (text: string): string => {
  if (!text) return text;

  return text
    .replace(/親会社株主(?:に帰属する)?(?:当期)?純利益|親会社株主帰属利益|当期純利益|純利益|純利/g, "純")
    .replace(/営業利益|営業益|営利/g, "営")
    .replace(/経常利益|経常/g, "経")
    .replace(/売上高|売上/g, "売")
    .replace(
      /[（(]\s*(?:YOY|前年比)\s*([+-]?\d+(?:\.\d+)?[%％]|-)\s*[）)]/gi,
      (_match, value: string) => ` Y${value}`,
    )
    .replace(
      /[（(]\s*(赤字継続|赤字転落|赤転|黒字転換|黒転|黒字継続|赤字縮小|赤字拡大)\s*[）)]/g,
      (_match, status: string) => ` ${COMPACT_YOY_STATUS[status]}`,
    )
    .replace(/来期FY予想/g, "来FY予")
    .replace(/通期予想/g, "通予")
    .replace(/上期予想/g, "上予")
    .replace(/下期予想/g, "下予")
    .replace(/([123])Q予想/g, "$1Q予")
    .replace(/\s+/g, " ")
    .trim();
};
