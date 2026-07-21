import assert from "node:assert/strict";
import test from "node:test";
import { sortAlertsByDisclosureTimeAndTicker } from "./sort.ts";

type Alert = {
  id: string;
  disclosed_at: string | null;
  detected_at: string;
  ticker: string | null;
  category: string;
};

const at = (minute: string, ticker: string | null, category: string, id: string): Alert => ({
  id,
  disclosed_at: `2026-05-15T${minute}:00+09:00`,
  detected_at: `2026-05-15T${minute}:30+09:00`,
  ticker,
  category,
});

test("groups same-minute alerts by ticker regardless of category", () => {
  const input = [
    at("10:00", "7203", "earnings", "7203-earnings"),
    at("10:00", "6758", "forecast", "6758-forecast"),
    at("10:00", "7203", "buyback", "7203-buyback"),
    at("10:00", "6758", "dividend", "6758-dividend"),
  ];

  assert.deepEqual(
    sortAlertsByDisclosureTimeAndTicker(input).map(({ id }) => id),
    ["6758-forecast", "6758-dividend", "7203-earnings", "7203-buyback"],
  );
});

test("uses the displayed minute rather than hidden seconds for same-time grouping", () => {
  const laterSecond = { ...at("10:00", "7203", "earnings", "7203"), disclosed_at: "2026-05-15T10:00:59+09:00" };
  const earlierSecond = { ...at("10:00", "6758", "forecast", "6758"), disclosed_at: "2026-05-15T10:00:01+09:00" };
  assert.deepEqual(
    sortAlertsByDisclosureTimeAndTicker([laterSecond, earlierSecond]).map(({ id }) => id),
    ["6758", "7203"],
  );
});

test("keeps disclosure minute ahead of ticker", () => {
  const input = [at("10:00", "1301", "earnings", "older"), at("10:01", "9999", "earnings", "newer")];
  assert.deepEqual(sortAlertsByDisclosureTimeAndTicker(input).map(({ id }) => id), ["newer", "older"]);
});

test("sorts alpha tickers naturally and keeps duplicate tickers adjacent", () => {
  const input = [
    at("10:00", "7203", "earnings", "7203"),
    at("10:00", "581a", "dividend", "581A-dividend"),
    at("10:00", "205A", "forecast", "205A"),
    at("10:00", "581A", "earnings", "581A-earnings"),
  ];
  assert.deepEqual(
    sortAlertsByDisclosureTimeAndTicker(input).map(({ id }) => id),
    ["205A", "581A-dividend", "581A-earnings", "7203"],
  );
});

test("places missing or invalid tickers after valid tickers without dropping alerts", () => {
  const input = [
    at("10:00", null, "other", "null"),
    at("10:00", "", "other", "empty"),
    at("10:00", "7203", "earnings", "valid"),
    at("10:00", "not a ticker", "other", "invalid"),
  ];
  assert.deepEqual(sortAlertsByDisclosureTimeAndTicker(input).map(({ id }) => id), ["valid", "null", "empty", "invalid"]);
});

test("is deterministic, stable within a company, and does not mutate the input", () => {
  const input = [
    at("10:00", "6758", "forecast", "first"),
    at("10:00", "6758", "dividend", "second"),
    at("10:00", "6758", "earnings", "third"),
  ];
  const original = [...input];
  const first = sortAlertsByDisclosureTimeAndTicker(input).map(({ id }) => id);
  const second = sortAlertsByDisclosureTimeAndTicker(input).map(({ id }) => id);
  assert.deepEqual(first, ["first", "second", "third"]);
  assert.deepEqual(second, first);
  assert.deepEqual(input, original);
});

test("changes only order after representative UI filters select their sets", () => {
  const input = [
    { ...at("10:00", "7203", "earnings", "read"), isRead: true, isStarred: false },
    { ...at("10:00", "6758", "dividend", "starred"), isRead: false, isStarred: true },
    { ...at("09:59", "9999", "buyback", "unread"), isRead: false, isStarred: false },
  ];
  const filters = [
    (event: typeof input[number]) => event.category === "earnings",
    (event: typeof input[number]) => !event.isRead,
    (event: typeof input[number]) => event.isStarred,
    () => true,
  ];

  for (const filter of filters) {
    const selected = input.filter(filter);
    const sorted = sortAlertsByDisclosureTimeAndTicker(selected);
    assert.deepEqual(new Set(sorted.map(({ id }) => id)), new Set(selected.map(({ id }) => id)));
  }
});
