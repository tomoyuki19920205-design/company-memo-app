import assert from "node:assert/strict";
import test from "node:test";
import { requiredListBottomSpace } from "../lib/tdnet-alerts/list-scroll";

test("hidden mobile list cannot start a bottom-space update loop", () => {
  assert.equal(requiredListBottomSpace(420, 0, 0, 0), null);
  assert.equal(requiredListBottomSpace(420, 0, 0, 420), null);
});

test("visible list restores its previous scroll position with bounded padding", () => {
  assert.equal(requiredListBottomSpace(420, 500, 700, 0), 220);
  assert.equal(requiredListBottomSpace(420, 500, 920, 220), 220);
});
