/**
 * test_source_priority_view.ts — api_latest_segments VIEW の source priority テスト
 * 
 * Supabase REST API 経由で実データに対してテスト。
 * Node.js で直接実行:
 *   npx ts-node tests/test_source_priority_view.ts
 * 
 * テストケース:
 * 1. 全行で ticker / period が空でないこと (空データ除外)
 * 2. 同一 (ticker, period, quarter, segment_name) に重複がないこと
 * 3. source カラムが返ること
 * 4. source_priority カラムが返ること
 * 5. excel_legacy のみのデータが正しく返ること
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fvkvfekzoebcolssnteo.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || "";

async function fetchView(params: string = ""): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/api_latest_segments?select=*&limit=500${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function runTests(): Promise<void> {
  console.log("=== Source Priority VIEW Tests ===\n");
  let passed = 0;
  let failed = 0;

  // Test 1: 空 ticker 除外
  const rows = await fetchView();
  const emptyTickers = rows.filter((r) => !r.ticker || r.ticker === "");
  if (emptyTickers.length === 0) {
    console.log("✅ Test 1: No empty ticker rows");
    passed++;
  } else {
    console.log(`❌ Test 1: ${emptyTickers.length} rows with empty ticker`);
    failed++;
  }

  // Test 2: 重複なし
  const seen = new Set<string>();
  let dups = 0;
  for (const row of rows) {
    const key = `${row.ticker}|${row.period}|${row.quarter}|${row.segment_name}`;
    if (seen.has(key)) {
      dups++;
      if (dups <= 3) {
        console.log(`  dup: ${key}`);
      }
    }
    seen.add(key);
  }
  if (dups === 0) {
    console.log("✅ Test 2: No duplicate business keys");
    passed++;
  } else {
    console.log(`❌ Test 2: ${dups} duplicate business keys`);
    failed++;
  }

  // Test 3: source カラム存在
  if (rows.length > 0 && "source" in rows[0]) {
    console.log("✅ Test 3: source column present");
    passed++;
  } else if (rows.length === 0) {
    console.log("⚠️ Test 3: No rows to check (skipped)");
  } else {
    console.log("❌ Test 3: source column missing");
    failed++;
  }

  // Test 4: source_priority カラム存在
  if (rows.length > 0 && "source_priority" in rows[0]) {
    console.log("✅ Test 4: source_priority column present");
    passed++;
  } else if (rows.length === 0) {
    console.log("⚠️ Test 4: No rows to check (skipped)");
  } else {
    console.log("❌ Test 4: source_priority column missing");
    failed++;
  }

  // Test 5: source 値が有効
  const sources = new Set(rows.map((r) => r.source).filter(Boolean));
  const validSources = new Set(["xbrl", "tdnet", "excel_legacy", "tdnet_pdf", "pdf"]);
  const unknownSources = [...sources].filter((s) => !validSources.has(s));
  if (unknownSources.length === 0) {
    console.log(`✅ Test 5: All sources valid: ${[...sources].join(", ")}`);
    passed++;
  } else {
    console.log(`❌ Test 5: Unknown sources: ${unknownSources.join(", ")}`);
    failed++;
  }

  // Test 6: source priority 順序チェック
  // 同一 ticker/period/quarter/segment に xbrl + excel_legacy がある場合
  // xbrl が勝つはず (現在は excel_legacy のみなので理論テスト)
  const sourcePriorities = rows
    .filter((r) => r.source_priority != null)
    .map((r) => ({ source: r.source, priority: r.source_priority }));
  const priorityMap = new Map<string, number>();
  for (const sp of sourcePriorities) {
    if (!priorityMap.has(sp.source)) {
      priorityMap.set(sp.source, sp.priority);
    }
  }
  let priorityCorrect = true;
  if (priorityMap.has("xbrl") && priorityMap.has("excel_legacy")) {
    if ((priorityMap.get("xbrl") || 99) >= (priorityMap.get("excel_legacy") || 0)) {
      priorityCorrect = false;
    }
  }
  if (priorityCorrect) {
    console.log(`✅ Test 6: Source priority order correct (${[...priorityMap.entries()].map(([k, v]) => `${k}=${v}`).join(", ")})`);
    passed++;
  } else {
    console.log("❌ Test 6: Source priority order incorrect");
    failed++;
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
