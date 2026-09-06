import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NewsMonitor from "../components/NewsMonitor";
import {
    DEFAULT_NEWS_SPLIT_RATIO,
    NEWS_LEFT_MIN_WIDTH,
    NEWS_RESIZE_LARGE_STEP,
    NEWS_RESIZE_STEP,
    NEWS_RIGHT_MIN_WIDTH,
    NEWS_SPLITTER_WIDTH,
    clampNewsSplitRatio,
    getNewsSplitBounds,
    newsSplitRatioFromPointer,
    parseStoredNewsSplitRatio,
    resizeNewsSplitWithKeyboard,
} from "../lib/news-pane-layout";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/NewsMonitor.tsx", import.meta.url), "utf8");

test("desktop renders an accessible vertical splitter without reading localStorage during SSR", () => {
    const html = renderToStaticMarkup(<NewsMonitor />);
    assert.match(html, /data-testid="news-pane-splitter"/);
    assert.match(html, /role="separator"/);
    assert.match(html, /aria-orientation="vertical"/);
    assert.match(html, /aria-valuemin="0"/);
    assert.match(html, /aria-valuemax="100"/);
    assert.match(html, /aria-valuenow="62"/);
    assert.doesNotMatch(html, /company-viewer-news-split-ratio/);
});

test("stored ratio restores valid values and rejects missing or invalid values", () => {
    assert.equal(parseStoredNewsSplitRatio("0.7"), 0.7);
    for (const invalid of [null, "", "NaN", "Infinity", "0", "1", "-0.1", "1.1"]) {
        assert.equal(parseStoredNewsSplitRatio(invalid), DEFAULT_NEWS_SPLIT_RATIO);
    }
});

test("pointer drag changes width and clamps both pane minimums", () => {
    const containerWidth = 1500;
    const containerLeft = 100;
    const availableWidth = containerWidth - NEWS_SPLITTER_WIDTH;
    const moved = newsSplitRatioFromPointer(containerLeft + 900, containerLeft, containerWidth);
    assert.equal(moved, 900 / availableWidth);

    const minimum = newsSplitRatioFromPointer(containerLeft, containerLeft, containerWidth);
    const maximum = newsSplitRatioFromPointer(containerLeft + containerWidth, containerLeft, containerWidth);
    assert.equal(Math.round(minimum * availableWidth), NEWS_LEFT_MIN_WIDTH);
    assert.equal(Math.round((1 - maximum) * availableWidth), NEWS_RIGHT_MIN_WIDTH);
    assert.equal(clampNewsSplitRatio(-1, containerWidth), minimum);
    assert.equal(clampNewsSplitRatio(2, containerWidth), maximum);
});

test("keyboard arrows resize by 20px and Shift arrows resize by 50px", () => {
    const containerWidth = 1500;
    const { availableWidth } = getNewsSplitBounds(containerWidth);
    const right = resizeNewsSplitWithKeyboard(DEFAULT_NEWS_SPLIT_RATIO, "ArrowRight", false, containerWidth);
    const left = resizeNewsSplitWithKeyboard(DEFAULT_NEWS_SPLIT_RATIO, "ArrowLeft", true, containerWidth);
    assert.equal(Math.round((right - DEFAULT_NEWS_SPLIT_RATIO) * availableWidth), NEWS_RESIZE_STEP);
    assert.equal(Math.round((DEFAULT_NEWS_SPLIT_RATIO - left) * availableWidth), NEWS_RESIZE_LARGE_STEP);
});

test("splitter uses pointer capture, persists only on the client, and double click resets", () => {
    assert.match(component, /setPointerCapture\(event\.pointerId\)/);
    assert.match(component, /hasPointerCapture\(event\.pointerId\)/);
    assert.match(component, /releasePointerCapture\(event\.pointerId\)/);
    assert.match(component, /onPointerCancel=\{finishPointerResize\}/);
    assert.match(component, /useEffect\(\(\) => \{[\s\S]*?window\.localStorage\.getItem\(NEWS_SPLIT_STORAGE_KEY\)/);
    assert.match(component, /onDoubleClick=\{resetSplitRatio\}/);
    assert.match(component, /const resetSplitRatio = \(\) => saveSplitRatio\(DEFAULT_NEWS_SPLIT_RATIO\)/);
    assert.match(component, /onClick=\{\(\) => openNews\(row\)\}/);
});

test("desktop grid uses only the 10px splitter gap and mobile restores one column", () => {
    const layoutRule = css.match(/\.news-monitor-layout\s*\{([^}]+)\}/)?.[1] ?? "";
    assert.match(layoutRule, /grid-template-columns:[^;]*360px[^;]*10px[^;]*380px/);
    assert.match(layoutRule, /gap:\s*0/);
    assert.match(css, /\.news-pane-splitter\s*\{[^}]*width:\s*10px[^}]*cursor:\s*col-resize[^}]*touch-action:\s*none/);
    assert.match(css, /@media \(max-width:900px\)\{\.news-monitor-layout\{grid-template-columns:1fr\}\.news-pane-splitter\{display:none\}/);
    assert.match(css, /\.news-feed\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0/);
    assert.match(css, /\.news-detail\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*overflow:\s*auto/);
});
