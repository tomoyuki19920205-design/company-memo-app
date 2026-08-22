import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("screening sort selects and native options use a dark color scheme", () => {
    const selectRule = css.match(/\.search-actions select\s*\{([^}]+)\}/)?.[1] ?? "";
    const optionRule = css.match(/\.search-actions select option\s*\{([^}]+)\}/)?.[1] ?? "";
    const checkedRule = css.match(/\.search-actions select option:checked\s*\{([^}]+)\}/)?.[1] ?? "";

    assert.match(selectRule, /color-scheme:\s*dark/);
    assert.match(selectRule, /background-color:\s*#0b1118/);
    assert.match(selectRule, /color:\s*#fff/);
    assert.match(optionRule, /background-color:\s*#0b1118/);
    assert.match(optionRule, /color:\s*#fff/);
    assert.match(checkedRule, /background-color:\s*var\(--header-bg\)/);
    assert.match(checkedRule, /color:\s*#fff/);
});
