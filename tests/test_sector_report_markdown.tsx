import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SectorReportMarkdown from "../components/SectorReportMarkdown";

function render(markdown: string, reportType: "sector_weekly" | "ny_market_daily" = "sector_weekly") {
    return renderToStaticMarkup(<SectorReportMarkdown markdown={markdown} reportType={reportType} />);
}

test("renders the Japanese reader labels as separate strong paragraphs", () => {
    const markdown = [
        "### 材料1：AI需要の利益波及",
        "",
        "**確認できた事実**",
        "",
        "対象週の事実。",
        "",
        "**日本企業への波及**",
        "",
        "日本企業への波及。",
        "",
        "**利益への影響**",
        "",
        "利益感応度。",
        "",
        "**株価への織り込み**",
        "",
        "織り込み評価。",
        "",
        "**反対材料・注意点**",
        "",
        "反証条件。",
        "",
        "**業績方向**",
        "",
        "mixed。",
        "",
        "**試算**",
        "",
        "10〜20億円。",
        "",
        "**推計**",
        "",
        "20〜30億円。",
        "",
        "**仮説**",
        "",
        "需給変化が続く。",
    ].join("\n");

    const html = render(markdown);
    for (const label of ["確認できた事実", "日本企業への波及", "利益への影響", "株価への織り込み", "反対材料・注意点", "業績方向", "試算", "推計", "仮説"]) {
        assert.match(html, new RegExp(`<p class="sector-material-label"><strong>${label}</strong></p>`));
    }
    assert.match(html, /<p class="sector-material-label"><strong>確認できた事実<\/strong><\/p>\n<p>対象週の事実。<\/p>/);
    assert.doesNotMatch(html, /\*Fact\*\*/);
    assert.match(html, /<h4 class="sector-material-heading">材料1：AI需要の利益波及<\/h4>/);
    assert.match(html, /data-report-type="sector_weekly"/);
});

test("marks every material heading including material 1 and multiple digits", () => {
    const html = render([
        "### 材料1：一つ目",
        "",
        "本文。",
        "",
        "",
        "",
        "### 材料12: 十二個目",
        "",
        "本文。",
        "",
        "",
        "",
        "### 市況：材料ではない見出し",
    ].join("\n"));
    assert.match(html, /<h4 class="sector-material-heading">材料1：一つ目<\/h4>/);
    assert.match(html, /<h4 class="sector-material-heading">材料12: 十二個目<\/h4>/);
    assert.match(html, /<h4>市況：材料ではない見出し<\/h4>/);
    assert.equal((html.match(/sector-material-heading/g) ?? []).length, 2);
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    assert.match(css, /\.sector-markdown h4\.sector-material-heading\s*\{\s*margin-block-start:3\.5rem;\s*margin-block-end:1\.125rem;/);
    assert.match(css, /\.sector-markdown p\.sector-material-label\s*\{\s*margin-block-start:2rem;\s*margin-block-end:\.625rem;/);
    assert.doesNotMatch(css, /sector-material-heading--continued/);
});

test("does not apply sector spacing markers to other report markdown", () => {
    const markdown = [
        "### 材料12：同じ文字列を含む別レポート",
        "",
        "**確認できた事実**",
    ].join("\n");
    const html = render(markdown, "ny_market_daily");

    assert.match(html, /data-report-type="ny_market_daily"/);
    assert.doesNotMatch(html, /sector-material-heading/);
    assert.doesNotMatch(html, /sector-material-label/);
});

test("renders a short overseas-company note and multi-market numbers as readable blocks", () => {
    const html = render([
        "※Glencore（グレンコア）：スイスに本拠を置く資源会社・資源商社。銅やコバルト市場に関係する。",
        "",
        "7月末の輸出価格は次のとおり。",
        "",
        "- 中国：1トン486ドル",
        "- インド・CIS：同515ドル",
        "- トルコ：同575ドル",
        "",
        "中国材の安さが日本企業の採算へ与える意味。",
    ].join("\n"));
    assert.match(html, /<p>※Glencore（グレンコア）：/);
    assert.equal((html.match(/<li>/g) ?? []).length, 3);
    assert.match(html, /<p>中国材の安さが日本企業の採算へ与える意味。<\/p>/);
});

test("handles bold at line starts, in list items, beside Japanese text and after headings", () => {
    const html = render([
        "**Fact**",
        "",
        "- **Fact** 内容",
        "* **Transmission** 内容",
        "",
        "## 見出し",
        "**Magnitude**：本文",
        "",
        "全角文字**Pricing-in**後文",
    ].join("\n"));

    assert.match(html, /<p><strong>Fact<\/strong><\/p>/);
    assert.doesNotMatch(html, /sector-material-label[^>]*><strong>Fact/);
    assert.match(html, /<li><strong>Fact<\/strong> 内容<\/li>/);
    assert.match(html, /<li><strong>Transmission<\/strong> 内容<\/li>/);
    assert.match(html, /<h3>見出し<\/h3>/);
    assert.match(html, /<strong>Magnitude<\/strong>：本文/);
    assert.match(html, /全角文字<strong>Pricing-in<\/strong>後文/);
});

test("preserves standard markdown constructs, links, citations, line breaks and CRLF", () => {
    const html = render([
        "# Heading",
        "",
        "1. ordered",
        "2. second",
        "",
        "- unordered",
        "",
        "[citation](https://example.com/source)**Fact** and *italic* with `inline code`  ",
        "next line",
    ].join("\r\n"));

    assert.match(html, /<h2>Heading<\/h2>/);
    assert.match(html, /<ol>/);
    assert.match(html, /<ul>/);
    assert.match(html, /href="https:\/\/example\.com\/source"/);
    assert.match(html, /<strong>Fact<\/strong>/);
    assert.match(html, /<em>italic<\/em>/);
    assert.match(html, /<code>inline code<\/code>/);
    assert.match(html, /<br\/?>(?:\n)?next line/);
});

test("keeps every notable-gainer paragraph inside one ordered-list item", () => {
    const blocks = Array.from({ length: 10 }, (_, offset) => {
        const rank = offset + 1;
        return [
            `${rank}. **会社${rank}（T${rank}）　+${rank}.00%** — 事業内容${rank}。`,
            "",
            `    **上昇理由・材料：** 材料${rank}。`,
            "",
            `    **材料確認結果：** 確認済み（[IR](https://example.com/${rank})）。`,
        ].join("\n");
    }).join("\n\n");

    const html = render(`## 話題の値上がり10社\n\n${blocks}`, "ny_market_daily");
    assert.equal((html.match(/<ol>/g) ?? []).length, 1);
    assert.equal((html.match(/<li>/g) ?? []).length, 10);
    assert.equal((html.match(/<li>\s*<p>/g) ?? []).length, 10);
    assert.equal((html.match(/<strong>上昇理由・材料：<\/strong>/g) ?? []).length, 10);
    assert.equal((html.match(/<strong>材料確認結果：<\/strong>/g) ?? []).length, 10);
    const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[0]);
    for (const rank of [1, 9, 10]) {
        const item = items.find((value) => value.includes(`会社${rank}（T${rank}）`));
        assert.ok(item);
        assert.equal((item.match(/<p>/g) ?? []).length, 3);
    }
});

test("does not turn raw HTML, scripts or unsafe links into executable markup", () => {
    const html = render("<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n[unsafe](javascript:alert(3))");

    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /href="javascript:/i);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
    assert.match(html, /\[unsafe\]\(javascript:alert\(3\)\)/);
});

test("keeps company news separate and passes sector full_report_md directly to the renderer", () => {
    const source = readFileSync(new URL("../components/NewsMonitor.tsx", import.meta.url), "utf8");

    assert.match(source, /<SectorReportMarkdown markdown=\{row\.full_report_md\} reportType="sector_weekly" \/>/);
    assert.match(source, /<SectorReportMarkdown markdown=\{row\.report_markdown\} reportType="ny_market_daily" \/>/);
    assert.match(source, /function CompanyDetail[\s\S]*?<h3>Summary<\/h3><p>\{row\.summary\}<\/p>/);
    assert.equal((source.match(/<SectorReportMarkdown/g) ?? []).length, 2);
    assert.doesNotMatch(readFileSync(new URL("../components/SectorReportMarkdown.tsx", import.meta.url), "utf8"), /dangerouslySetInnerHTML/);
});
