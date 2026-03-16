const fs = require("fs");
const path = require("path");
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
    const match = line.trim().match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
}
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function formatMillions(val) {
    if (val === null || val === undefined) return "-";
    return Math.round(val).toLocaleString("ja-JP");
}

async function main() {
    var passed = 0;
    var failed = 0;

    console.log("=== Phase 2 完了検証: 全件 million_yen 統一確認 ===\n");

    // Test 1: source カラム存在確認
    console.log("--- Test 1: source カラム存在確認 ---");
    var r1 = await supabase.from("api_latest_financials").select("source").limit(1);
    if (r1.error) {
        console.log("  FAIL: source カラムが存在しない: " + r1.error.message);
        failed++;
        return;
    }
    console.log("  PASS: source カラムが存在");
    passed++;

    // Test 2: unit が全件 million_yen であること
    console.log("\n--- Test 2: unit カラム一貫性確認 ---");
    var r2 = await supabase.from("financials").select("unit").neq("unit", "million_yen").limit(5);
    if (r2.error) {
        console.log("  FAIL: unit カラムクエリ失敗: " + r2.error.message);
        failed++;
    } else if (r2.data && r2.data.length > 0) {
        console.log("  FAIL: unit != 'million_yen' の行が " + r2.data.length + " 件");
        failed++;
    } else {
        console.log("  PASS: 全件 unit='million_yen'");
        passed++;
    }

    // Test 3: jquants / tdnet の値が百万円妥当桁数であること
    console.log("\n--- Test 3: 値の桁数妥当性 (百万円) ---");
    var tickers = ["7203", "1301", "6758"];
    for (var t = 0; t < tickers.length; t++) {
        var ticker = tickers[t];
        var r = await supabase.from("api_latest_financials")
            .select("ticker,period,quarter,sales,source")
            .eq("ticker", ticker)
            .order("period", { ascending: false })
            .limit(4);
        if (r.data) {
            console.log("\n  ticker=" + ticker + ":");
            for (var j = 0; j < r.data.length; j++) {
                var row = r.data[j];
                var disp = formatMillions(row.sales);
                // 百万円なら sales は通常 1 〜 100,000,000 の範囲
                var ok = row.sales === null || (Math.abs(row.sales) < 100000000);
                var status = ok ? "PASS" : "CHECK";
                console.log("    " + status + " p=" + row.period + " q=" + row.quarter + " src=" + row.source + " sales=" + row.sales + " disp=" + disp);
                if (ok) passed++; else failed++;
            }
        }
    }

    // Test 4: financials 直読みと view の一致確認
    console.log("\n--- Test 4: financials 直読み vs ビュー一致確認 ---");
    var rv = await supabase.from("api_latest_financials").select("ticker,period,quarter,sales,source").eq("ticker","7203").order("period",{ascending:false}).limit(3);
    var rt = await supabase.from("financials").select("ticker,period,quarter,sales,source").eq("ticker","7203").order("period",{ascending:false}).limit(3);
    if (rv.data && rt.data) {
        var match = true;
        for (var i = 0; i < Math.min(rv.data.length, rt.data.length); i++) {
            if (rv.data[i].sales !== rt.data[i].sales || rv.data[i].source !== rt.data[i].source) {
                console.log("  MISMATCH at q=" + rv.data[i].quarter + ": view.sales=" + rv.data[i].sales + " table.sales=" + rt.data[i].sales);
                match = false;
            }
        }
        if (match) {
            console.log("  PASS: view と table の sales/source は一致");
            passed++;
        } else {
            failed++;
        }
    }

    // Test 5: convertToMillions 不在確認
    console.log("\n--- Test 5: convertToMillions 関数が削除されていること ---");
    var formatPath = path.resolve(__dirname, "../lib/format.ts");
    var formatContent = fs.readFileSync(formatPath, "utf8");
    if (formatContent.includes("convertToMillions")) {
        console.log("  FAIL: format.ts にまだ convertToMillions が残っている");
        failed++;
    } else {
        console.log("  PASS: format.ts から convertToMillions 削除済み");
        passed++;
    }

    // Test 6: viewer-api.ts に convertToMillions import がないこと
    console.log("\n--- Test 6: viewer-api.ts から変換ロジック除去確認 ---");
    var apiPath = path.resolve(__dirname, "../lib/viewer-api.ts");
    var apiContent = fs.readFileSync(apiPath, "utf8");
    if (apiContent.includes("convertToMillions")) {
        console.log("  FAIL: viewer-api.ts にまだ convertToMillions がある");
        failed++;
    } else {
        console.log("  PASS: viewer-api.ts から convertToMillions 除去済み");
        passed++;
    }

    console.log("\n=== 結果: PASS=" + passed + " FAIL=" + failed + " ===");
    if (failed === 0) {
        console.log("ALL TESTS PASSED — Phase 2 完了 ✅");
    } else {
        console.log("SOME TESTS FAILED — 修正が必要");
    }
}

main().catch(console.error);
