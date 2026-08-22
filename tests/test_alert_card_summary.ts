import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactEarningsCardLine } from "../lib/tdnet-alerts/card-summary-presentation";

const cases: Array<[string, string]> = [
  ["売上（YOY+9.9%） 営利（YOY+12.3%） 1Q", "売 Y+9.9% 営 Y+12.3% 1Q"],
  ["売上（YOY-4.2%） 営利（YOY-18.0%） 2Q", "売 Y-4.2% 営 Y-18.0% 2Q"],
  ["売上（YOY+9.9%） 営利（赤字継続） 1Q", "売 Y+9.9% 営 Y赤継 1Q"],
  ["売上（YOY-2.0%） 営利（赤字転落） 3Q", "売 Y-2.0% 営 Y赤転 3Q"],
  ["売上（YOY+5.0%） 営利（黒字転換） 通期", "売 Y+5.0% 営 Y黒転 通期"],
  ["売上（YOY+20.0%） 営利（YOY+10%） 通期予想", "売 Y+20.0% 営 Y+10% 通予"],
  ["売上(YOY+3.0％) 営利(黒字継続) 上期予想", "売 Y+3.0％ 営 Y黒継 上予"],
  ["売上（YOY-1.0%） 営利（赤転） 下期予想", "売 Y-1.0% 営 Y赤転 下予"],
  ["売上（YOY+1.0%） 営利（黒転） 2Q予想", "売 Y+1.0% 営 Y黒転 2Q予"],
  ["売上（YOY+1.0%） 営利（赤字縮小） 来期FY予想", "売 Y+1.0% 営 Y赤縮 来FY予"],
  ["売上（YOY-1.0%） 営利（赤字拡大） 3Q", "売 Y-1.0% 営 Y赤拡 3Q"],
  ["売上（YOY-） 経常（YOY-5.0%） FY", "売 Y- 経 Y-5.0% FY"],
  ["売上（YOY+4.0%） 親会社株主に帰属する当期純利益（YOY+8.0%） 3Q", "売 Y+4.0% 純 Y+8.0% 3Q"],
];

test("earnings card presentation shortens metrics, YoY states, and periods", () => {
  for (const [input, expected] of cases) {
    assert.equal(formatCompactEarningsCardLine(input), expected, input);
  }
});

test("non-financial notification text remains unchanged", () => {
  const input = "受注高 YOY+12.0% 取得期間: 2026-08-01〜2026-08-31";
  assert.equal(formatCompactEarningsCardLine(input), input);
});
