import { isTdnetSegmentSource } from "../lib/segment-normalize";
import type { SegmentRecord } from "../types/segment";

async function runTests() {
  console.log("=== Phase 9E: Source Filter Regression Tests ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`\u2705 ${msg}`);
      passed++;
    } else {
      console.log(`\u274c ${msg}`);
      failed++;
    }
  }

  // Dummy helper
  const makeSeg = (source: string, data_basis?: string): SegmentRecord => ({
    ticker: "9982",
    period: "2027-02-28",
    quarter: "1Q",
    segment_name: "Test Segment",
    segment_sales: 100,
    segment_profit: 10,
    source,
    data_basis
  } as any);

  // Test A: source="jquants", segSourceTab="tdnet" -> 表示対象になる
  const segJquants = makeSeg("jquants");
  assert(isTdnetSegmentSource(segJquants) === true, "Test A: J-Quants source is included in TDNET sources");

  // Test B: source="xbrl", segSourceTab="tdnet" -> 引き続き表示対象
  const segXbrl = makeSeg("xbrl");
  assert(isTdnetSegmentSource(segXbrl) === true, "Test B: XBRL source is included in TDNET sources");

  // Test C: 対象外source (edinet_xbrl, manual 等) -> 除外
  const segEdinet = makeSeg("edinet_xbrl");
  const segManual = makeSeg("manual");
  assert(isTdnetSegmentSource(segEdinet) === false, "Test C1: EDINET source is excluded from TDNET sources");
  assert(isTdnetSegmentSource(segManual) === false, "Test C2: Manual source is excluded from TDNET sources");

  // Test D: segSourceTab="all" 関連 (jquants や xbrl が filteredBySource に残る条件)
  const isIncludedInAll = (s: SegmentRecord) => isTdnetSegmentSource(s) || s.source === "edinet_xbrl";
  assert(isIncludedInAll(segJquants) === true, "Test D1: J-Quants is included in 'all' tab filter");
  assert(isIncludedInAll(segXbrl) === true, "Test D2: XBRL is included in 'all' tab filter");
  assert(isIncludedInAll(segEdinet) === true, "Test D3: EDINET is included in 'all' tab filter");
  assert(isIncludedInAll(segManual) === false, "Test D4: Manual is excluded from 'all' tab filter");

  // Test E & F: 9982相当 & 7601相当データ適合
  const seg9982 = makeSeg("jquants");
  const seg7601 = makeSeg("xbrl");
  assert(isTdnetSegmentSource(seg9982) === true, "Test E: 9982 equivalent segment (jquants) passes filter");
  assert(isTdnetSegmentSource(seg7601) === true, "Test F: 7601 equivalent segment (xbrl) passes filter");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
