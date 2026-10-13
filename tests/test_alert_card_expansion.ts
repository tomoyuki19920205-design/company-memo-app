import assert from "node:assert/strict";
import test from "node:test";
import { cardExpansionReducer as reduce, createCardExpansionState } from "../lib/tdnet-alerts/card-expansion";

const select = (id: string, allowCollapse = true) => ({ type: "select", id, allowCollapse } as const);
const pin = (id: string) => ({ type: "togglePin", id } as const);

test("ordinary desktop cards still toggle and replace the open card", () => {
  let state = reduce(createCardExpansionState(), select("A"));
  state = reduce(state, select("B"));
  assert.equal(state.expandedId, "B");
  assert.equal(state.selectedId, "B");
  state = reduce(state, select("B"));
  assert.equal(state.expandedId, null);
  assert.equal(state.selectedId, null);
});

test("pin A, open B, then click A keeps both expanded and selects A's viewer", () => {
  let state = reduce(createCardExpansionState(), select("A"));
  state = reduce(state, pin("A"));
  state = reduce(state, select("B"));
  state = reduce(state, select("A"));
  assert.ok(state.pinnedIds.has("A"));
  assert.equal(state.expandedId, "B");
  assert.equal(state.selectedId, "A");
});

test("unpinning closes only A and preserves B and the current viewer", () => {
  let state = reduce(createCardExpansionState(), select("A"));
  state = reduce(state, pin("A"));
  state = reduce(state, select("B"));
  state = reduce(state, pin("A"));
  assert.equal(state.pinnedIds.size, 0);
  assert.equal(state.expandedId, "B");
  assert.equal(state.selectedId, "B");
});

test("multiple pins can be released independently without changing selection", () => {
  let state = reduce(createCardExpansionState(), select("A"));
  state = reduce(state, pin("A"));
  state = reduce(state, select("B"));
  state = reduce(state, pin("B"));
  const both = state;
  state = reduce(state, pin("A"));
  assert.deepEqual([...state.pinnedIds], ["B"]);
  assert.deepEqual([...both.pinnedIds], ["A", "B"]);
  assert.equal(state.selectedId, "B");
  state = reduce(state, pin("B"));
  assert.equal(state.pinnedIds.size, 0);
  assert.equal(state.expandedId, null);
  assert.equal(state.selectedId, "B");
});

test("unpinning the viewer's selected card does not clear the viewer", () => {
  let state = reduce(createCardExpansionState(), select("A"));
  state = reduce(state, pin("A"));
  state = reduce(state, pin("A"));
  assert.equal(state.selectedId, "A");
  assert.equal(state.expandedId, null);
  state = reduce(state, select("A"));
  assert.equal(state.expandedId, "A");
});

test("mobile reselection and deep links keep the current opening behavior", () => {
  let state = reduce(createCardExpansionState(), { type: "open", id: "A" });
  state = reduce(state, select("A", false));
  assert.equal(state.expandedId, "A");
  assert.equal(state.selectedId, "A");
});

test("replacement, reordering and filtering of event objects do not reset ID pins", () => {
  let state = reduce(createCardExpansionState(), select("A"));
  state = reduce(state, pin("A"));
  const visibleExpanded = (rows: { id: string }[]) => rows.filter(row => state.pinnedIds.has(row.id) || state.expandedId === row.id).map(row => row.id);
  assert.deepEqual(visibleExpanded([{ id: "B" }, { id: "A" }]), ["A"]);
  assert.deepEqual(visibleExpanded([{ id: "B" }]), []);
  assert.ok(state.pinnedIds.has("A"));
  assert.deepEqual(visibleExpanded([{ id: "A" }]), ["A"]);
});
