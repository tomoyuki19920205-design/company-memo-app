import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SectorReportMarkdown from "../components/SectorReportMarkdown";

function render(markdown: string) {
    return renderToStaticMarkup(<SectorReportMarkdown markdown={markdown} />);
}

test("renders the production sector labels as strong without consuming an asterisk", () => {
    const markdown = [
        "## 1. AI需要の利益波及",
        "",
        "**Fact**：対象週の事実。",
        "",
        "**Transmission**：日本企業への波及。",
        "",
        "**Magnitude（Estimate/Hypothesis）**：利益感応度。",
        "",
        "**Pricing-in**：織り込み評価。",
        "",
        "**Counterevidence**：反証条件。",
        "",
        "**Estimate** と **Hypothesis** を分離する。",
    ].join("\n");

    const html = render(markdown);
    for (const label of ["Fact", "Transmission", "Magnitude（Estimate/Hypothesis）", "Pricing-in", "Counterevidence", "Estimate", "Hypothesis"]) {
        assert.match(html, new RegExp(`<strong>${label.replace(/[()]/g, "\\$&")}</strong>`));
    }
    assert.doesNotMatch(html, /\*Fact\*\*/);
    assert.match(html, /<h3>1\. AI需要の利益波及<\/h3>/);
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
