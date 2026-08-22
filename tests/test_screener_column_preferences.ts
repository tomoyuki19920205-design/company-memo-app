import assert from "node:assert/strict";
import test from "node:test";
import {
    DEFAULT_SCREENER_COLUMN_ORDER,
    SCREENER_COLUMN_ORDER_KEY,
    SCREENER_COLUMN_WIDTHS_KEY,
    clearScreenerColumnPreferences,
    loadScreenerColumnPreferences,
    moveColumn,
    normalizeColumnOrder,
    normalizeColumnWidths,
    saveScreenerColumnPreferences,
    updateColumnWidth,
} from "../lib/screener-column-preferences";
import { SCREENER_METRICS } from "../lib/screener";

class MemoryStorage {
    data = new Map<string, string>();
    getItem(key: string) { return this.data.get(key) ?? null; }
    setItem(key: string, value: string) { this.data.set(key, value); }
    removeItem(key: string) { this.data.delete(key); }
}

test("column reorder moves only the requested column", () => {
    assert.deepEqual(moveColumn(["ticker", "company_name", "forward_per"], "forward_per", "company_name", "before"), [
        "ticker", "forward_per", "company_name",
    ]);
});

test("width update is clamped without changing other columns", () => {
    const initial = normalizeColumnWidths({ company_name: 350 });
    const widths = updateColumnWidth(initial, "forward_per", 10);
    assert.equal(widths.forward_per, 90);
    assert.equal(widths.company_name, 350);
    assert.equal(widths.market, initial.market);
});

test("saved preferences restore order and widths", () => {
    const storage = new MemoryStorage();
    const order = moveColumn(DEFAULT_SCREENER_COLUMN_ORDER, "forward_per", "company_name", "after");
    const widths = normalizeColumnWidths({ company_name: 320, forward_per: 100 });
    saveScreenerColumnPreferences(storage, order, widths);
    assert.deepEqual(loadScreenerColumnPreferences(storage), { order, widths });
});

test("hiding and showing a metric leaves its saved order and width intact", () => {
    const order = moveColumn(DEFAULT_SCREENER_COLUMN_ORDER, "forward_per", "company_name", "after");
    const widths = normalizeColumnWidths({ forward_per: 105 });
    const metricKeys = new Set(SCREENER_METRICS.map((metric) => metric.key));
    const visible = (selected: string[]) => order.filter((key) => !metricKeys.has(key) || selected.includes(key));
    assert.equal(visible([]).includes("forward_per"), false);
    assert.equal(visible(["forward_per"])[2], "forward_per");
    assert.equal(widths.forward_per, 105);
});

test("reset removes persisted order and widths", () => {
    const storage = new MemoryStorage();
    storage.setItem(SCREENER_COLUMN_ORDER_KEY, "[\"forward_per\"]");
    storage.setItem(SCREENER_COLUMN_WIDTHS_KEY, "{\"forward_per\":200}");
    clearScreenerColumnPreferences(storage);
    assert.deepEqual(loadScreenerColumnPreferences(storage), {
        order: DEFAULT_SCREENER_COLUMN_ORDER,
        widths: normalizeColumnWidths(null),
    });
});

test("unknown and deleted columns are dropped while newly added columns use default-relative placement", () => {
    assert.deepEqual(normalizeColumnOrder(["company_name", "deleted_metric", "ticker"], ["ticker", "company_name", "new_metric"]), [
        "company_name", "new_metric", "ticker",
    ]);
});

test("malformed localStorage falls back safely", () => {
    const storage = new MemoryStorage();
    storage.setItem(SCREENER_COLUMN_ORDER_KEY, "not json");
    storage.setItem(SCREENER_COLUMN_WIDTHS_KEY, "also not json");
    assert.deepEqual(loadScreenerColumnPreferences(storage), {
        order: DEFAULT_SCREENER_COLUMN_ORDER,
        widths: normalizeColumnWidths(null),
    });
});
