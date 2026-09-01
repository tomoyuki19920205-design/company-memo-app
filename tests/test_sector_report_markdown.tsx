import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SectorReportMarkdown from "../components/SectorReportMarkdown";

function render(markdown: string) {
    return renderToStaticMarkup(<SectorReportMarkdown markdown={markdown} />);
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
        "**試算**",
        "",
        "10〜20億円。",
        "",
        "**仮説**",
        "",
        "需給変化が続く。",
    ].join("\n");

    const html = render(markdown);
    for (const label of ["確認できた事実", "日本企業への波及", "利益への影響", "株価への織り込み", "反対材料・注意点", "試算", "仮説"]) {
        assert.match(html, new RegExp(`<p><strong>${label}</strong></p>`));
    }
    assert.match(html, /<p><strong>確認できた事実<\/strong><\/p>\n<p>対象週の事実。<\/p>/);
    assert.doesNotMatch(html, /\*Fact\*\*/);
    assert.match(html, /<h4 class="sector-material-heading">材料1：AI需要の利益波及<\/h4>/);
});

test("marks only material 2 and later headings for the three-line visual gap", () => {
    const html = render([
        "### 材料1：一つ目",
        "",
        "本文。",
        "",
        "",
        "",
        "### 材料2: 二つ目",
        "",
        "本文。",
        "",
        "",
        "",
        "### 材料3：三つ目",
    ].join("\n"));
    assert.match(html, /<h4 class="sector-material-heading">材料1：一つ目<\/h4>/);
    assert.match(html, /<h4 class="sector-material-heading sector-material-heading--continued">材料2: 二つ目<\/h4>/);
    assert.match(html, /<h4 class="sector-material-heading sector-material-heading--continued">材料3：三つ目<\/h4>/);
    assert.equal((html.match(/sector-material-heading--continued/g) ?? []).length, 2);
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    assert.match(css, /h4\.sector-material-heading--continued\s*\{\s*margin-top:calc\(1\.65rem \* 3\)/);
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

    assert.match(source, /<SectorReportMarkdown markdown=\{row\.full_report_md\} \/>/);
    assert.match(source, /<SectorReportMarkdown markdown=\{row\.report_markdown\} \/>/);
    assert.match(source, /function CompanyDetail[\s\S]*?<h3>Summary<\/h3><p>\{row\.summary\}<\/p>/);
    assert.equal((source.match(/<SectorReportMarkdown/g) ?? []).length, 2);
    assert.doesNotMatch(readFileSync(new URL("../components/SectorReportMarkdown.tsx", import.meta.url), "utf8"), /dangerouslySetInnerHTML/);
});
