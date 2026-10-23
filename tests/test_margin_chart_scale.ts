import assert from "node:assert/strict";
import test from "node:test";
import { buildMarginMoneyScale, marginMoneyY } from "../lib/margin-chart-scale";

test("market axis follows visible balances and starts bars at its nonzero lower tick", () => {
  const values = [64607.51, 66500.12, 65645.42];
  const scale = buildMarginMoneyScale(values);
  assert.ok(scale.min > 0 && scale.min < Math.min(...values));
  assert.ok(scale.max > Math.max(...values));
  assert.ok(scale.ticks.every((tick, index) => index === 0 || tick > scale.ticks[index - 1]));
  assert.equal(marginMoneyY(scale.min, scale, 20, 222), 222);
  assert.equal(marginMoneyY(scale.max, scale, 20, 222), 20);
  assert.ok(values.every((value) => marginMoneyY(value, scale, 20, 222) > 20 &&
    marginMoneyY(value, scale, 20, 222) < 222));
});

test("tiny or single-value ranges retain at least about two percent of the median", () => {
  for (const values of [[30.18, 30.1801], [30.18]]) {
    const scale = buildMarginMoneyScale(values);
    assert.ok(scale.max - scale.min >= 30.18 * 0.02 - 1e-9);
    assert.ok(scale.min > 0);
    assert.ok(scale.digits >= 1);
  }
});

test("zero, missing, and mixed amounts keep a valid unclipped domain", () => {
  assert.deepEqual(buildMarginMoneyScale([null, null]),
    { min: 0, max: 1, ticks: [], digits: 0 });
  assert.deepEqual(buildMarginMoneyScale([null, 0, null]),
    { min: 0, max: 1, ticks: [0, 0.5, 1], digits: 1 });
  const mixed = buildMarginMoneyScale([null, 0, 2, Number.NaN]);
  assert.equal(mixed.min, 0);
  assert.ok(mixed.max >= 2);
  assert.equal(marginMoneyY(-5, mixed, 20, 222), 222);
  assert.equal(marginMoneyY(100, mixed, 20, 222), 20);
});
