import assert from "node:assert/strict";
import test from "node:test";
import { collectAllPages } from "../lib/screener-options";

test("category options read beyond the Supabase 1000-row default", async () => {
    const source = Array.from({ length: 2505 }, (_, index) => index);
    const calls: Array<[number, number]> = [];
    const rows = await collectAllPages(async (from, to) => {
        calls.push([from, to]);
        return source.slice(from, to + 1);
    });
    assert.deepEqual(rows, source);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

