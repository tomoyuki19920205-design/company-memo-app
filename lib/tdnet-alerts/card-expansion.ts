export type CardExpansionState = {
  selectedId: string | null;
  expandedId: string | null;
  pinnedIds: ReadonlySet<string>;
};

type CardExpansionAction =
  | { type: "select"; id: string; allowCollapse: boolean }
  | { type: "open"; id: string }
  | { type: "togglePin"; id: string };

export const createCardExpansionState = (): CardExpansionState => ({
  selectedId: null,
  expandedId: null,
  pinnedIds: new Set(),
});

export function isCardClosing(state: CardExpansionState, id: string, allowCollapse: boolean): boolean {
  return allowCollapse && !state.pinnedIds.has(id) && state.expandedId === id;
}

// This state belongs to the mounted screen, independently of fetched event objects.
export function cardExpansionReducer(state: CardExpansionState, action: CardExpansionAction): CardExpansionState {
  if (action.type === "togglePin") {
    const pinnedIds = new Set(state.pinnedIds);
    if (pinnedIds.has(action.id)) pinnedIds.delete(action.id);
    else pinnedIds.add(action.id);
    return {
      ...state,
      pinnedIds,
      expandedId: state.expandedId === action.id ? null : state.expandedId,
    };
  }
  if (action.type === "open") return { ...state, selectedId: action.id, expandedId: action.id };
  if (state.pinnedIds.has(action.id)) return { ...state, selectedId: action.id };
  const closing = isCardClosing(state, action.id, action.allowCollapse);
  return { ...state, selectedId: closing ? null : action.id, expandedId: closing ? null : action.id };
}
