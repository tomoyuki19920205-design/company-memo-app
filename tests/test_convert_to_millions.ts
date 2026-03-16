/**
 * convertToMillions 回帰テスト
 *
 * 実行: npx tsx tests/test_convert_to_millions.ts
 *
 * jquants/tdnet 混在ケースの単位変換が正しいことを検証する。
 */

import { convertToMillions, formatMillions } from "../lib/format";

let pass = 0;
let fail = 0;

function assert(label: string, actual: unknown, expected: unknown) {
    if (actual === expected) {
        pass++;
    } else {
        fail++;
        console.error(`  ❌ FAIL: ${label}`);
        console.error(`     expected: ${expected}, got: ${actual}`);
    }
}

console.log("=== convertToMillions tests ===\n");

// -------------------------------------------------------
// 1. jquants (円単位) → ÷1,000,000
// -------------------------------------------------------
console.log("--- jquants (yen) ---");
assert(
    "jquants: Toyota 3Q sales 38兆 → 38,087,604",
    convertToMillions(38_087_604_000_000, "jquants"),
    38_087_604,
);
assert(
    "jquants: Toyota 1Q OP 1.17兆 → 1,166,141",
    convertToMillions(1_166_141_000_000, "jquants"),
    1_166_141,
);
assert(
    "jquants: small company sales 500M yen → 500",
    convertToMillions(500_000_000, "jquants"),
    500,
);
assert(
    "jquants: exact million boundary → 1",
    convertToMillions(1_000_000, "jquants"),
    1,
);
assert(
    "jquants: sub-million rounds to 0 → 0",
    convertToMillions(499_999, "jquants"),
    0,
);
assert(
    "jquants: negative value → -1,166,141",
    convertToMillions(-1_166_141_000_000, "jquants"),
    -1_166_141,
);

// -------------------------------------------------------
// 2. tdnet (百万円単位) → そのまま
// -------------------------------------------------------
console.log("--- tdnet (百万円) ---");
assert(
    "tdnet: Toyota FY forecast sales=490000 → 490,000",
    convertToMillions(490_000, "tdnet"),
    490_000,
);
assert(
    "tdnet: Toyota FY forecast OP=34000 → 34,000",
    convertToMillions(34_000, "tdnet"),
    34_000,
);
assert(
    "tdnet: small value → 5",
    convertToMillions(5, "tdnet"),
    5,
);
assert(
    "tdnet: zero → 0",
    convertToMillions(0, "tdnet"),
    0,
);

// -------------------------------------------------------
// 3. null / undefined / empty source
// -------------------------------------------------------
console.log("--- null / edge cases ---");
assert(
    "null value + jquants → null",
    convertToMillions(null, "jquants"),
    null,
);
assert(
    "null value + tdnet → null",
    convertToMillions(null, "tdnet"),
    null,
);
assert(
    "empty source → pass through (百万円想定)",
    convertToMillions(490_000, ""),
    490_000,
);
assert(
    "undefined source → pass through",
    convertToMillions(490_000, undefined),
    490_000,
);
assert(
    "null source → pass through",
    convertToMillions(490_000, null),
    490_000,
);
assert(
    "unknown source 'excel' → pass through",
    convertToMillions(490_000, "excel"),
    490_000,
);

// -------------------------------------------------------
// 4. 混在ケース: 同じ period で jquants 行と tdnet 行が混ざる
// -------------------------------------------------------
console.log("--- mixed source scenario ---");
const rows = [
    { sales: 12_253_326_000_000, source: "jquants", quarter: "1Q" },
    { sales: 24_630_753_000_000, source: "jquants", quarter: "2Q" },
    { sales: 38_087_604_000_000, source: "jquants", quarter: "3Q" },
    { sales: 490_000, source: "tdnet", quarter: "FY" },
];

const converted = rows.map((r) => ({
    quarter: r.quarter,
    sales: convertToMillions(r.sales, r.source),
}));

assert("1Q → 12,253,326", converted[0].sales, 12_253_326);
assert("2Q → 24,630,753", converted[1].sales, 24_630_753);
assert("3Q → 38,087,604", converted[2].sales, 38_087_604);
assert("FY → 490,000 (tdnet, no conversion)", converted[3].sales, 490_000);

// -------------------------------------------------------
// 5. formatMillions 表示確認
// -------------------------------------------------------
console.log("--- formatMillions display ---");
assert("formatMillions(12253326) → '12,253,326'", formatMillions(12_253_326), "12,253,326");
assert("formatMillions(490000) → '490,000'", formatMillions(490_000), "490,000");
assert("formatMillions(null) → '–'", formatMillions(null), "–");
assert("formatMillions(0) → '0'", formatMillions(0), "0");

// -------------------------------------------------------
// Summary
// -------------------------------------------------------
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
    process.exit(1);
} else {
    console.log("✅ All tests passed!");
}
