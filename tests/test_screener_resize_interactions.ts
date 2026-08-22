import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/ScreenerPage.tsx", import.meta.url), "utf8");

test("resize hit target is 20px centered on the 1px visual divider", () => {
    const handleRule = css.match(/\.screener-resize-handle\s*\{([^}]+)\}/)?.[1] ?? "";
    assert.match(handleRule, /width:\s*20px/);
    assert.match(handleRule, /right:\s*-10px/);
    assert.match(handleRule, /cursor:\s*col-resize/);
    assert.match(css, /border-right:\s*1px solid rgba\(125, 211, 252, \.45\)/);
    assert.match(css, /\.screener-resize-handle:hover::after\s*\{[^}]*width:\s*2px/);
    assert.match(css, /\.screener-resize-handle\.is-resizing::after\s*\{[^}]*width:\s*2px/);
});

test("resize owns boundary pointer events while reorder remains on the header body", () => {
    assert.match(component, /const startResize[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);/);
    assert.match(component, /className={`screener-resize-handle[\s\S]*?onMouseDown=\{\(event\) => startResize/);
    assert.match(component, /<th[\s\S]*?onMouseDown=\{\(event\) => startReorder/);
    assert.match(component, /style=\{\{ zIndex: visibleColumnDefinitions\.length - columnIndex \+ 2 \}\}/);
    assert.match(component, /Math\.hypot\(moveEvent\.clientX - state\.startX, moveEvent\.clientY - state\.startY\) < 5/);
    assert.match(component, /window\.addEventListener\("mousemove", handleMove\)/);
});
