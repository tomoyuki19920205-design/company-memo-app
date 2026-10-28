import assert from "node:assert/strict";
import test from "node:test";
import { spaceEarningsReasonItems } from "../lib/tdnet-alerts/earnings-reason-spacing";

test("spaces only consecutive reason items across company and segment sections", () => {
  const source = [
    "売上 100億円", "```", "セグメント：", "・物販 50億円", "・サービス 50億円", "```", "",
    "■ 増減理由（全社）", "・項目Aの本文・途中の中点", "折り返した本文", "・項目Bの本文", "",
    "■ 増減理由（セグメント別）", "・部門A：項目C", "・部門B：項目D", "",
    "■ 来期ガイダンス", "EPS: 100円", "配当: 20円",
  ].join("\n");
  const rendered = spaceEarningsReasonItems(source);
  assert.match(rendered, /・項目Aの本文・途中の中点\n折り返した本文\n\n・項目Bの本文/);
  assert.match(rendered, /・部門A：項目C\n\n・部門B：項目D/);
  assert.match(rendered, /セグメント：\n・物販 50億円\n・サービス 50億円/);
  assert.match(rendered, /■ 来期ガイダンス\nEPS: 100円\n配当: 20円/);
  assert.deepEqual(rendered.split("\n").filter(Boolean), source.split("\n").filter(Boolean));
});

test("normalizes existing blank lines to exactly one between reason items", () => {
  const source = "■ 増減理由（全社）\n・A\n\n\n・B\n\n・C";
  assert.equal(spaceEarningsReasonItems(source), "■ 増減理由（全社）\n・A\n\n・B\n\n・C");
});

test("preserves other notifications and a single reason item", () => {
  const other = "配当修正\n・中間配当20円\n・期末配当30円";
  const single = "■ 増減理由（全社）\n・本文が長く\n改行して続く\n■ 来期ガイダンス";
  assert.equal(spaceEarningsReasonItems(other), other);
  assert.equal(spaceEarningsReasonItems(single), single);
});
