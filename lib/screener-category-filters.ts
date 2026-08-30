export type CategorySelections = {
    markets: string[];
    sectors17: string[];
    sectors33: string[];
};

export function selectionStatus(selected: string[], optionCodes: string[]) {
    const selectedCodes = new Set(selected);
    const selectedCount = optionCodes.filter((code) => selectedCodes.has(code)).length;
    const all = optionCodes.length > 0 && selectedCount === optionCodes.length;
    return { all, indeterminate: selectedCount > 0 && !all, selectedCount };
}

export function updateCodeSelection(selected: string[], code: string, checked: boolean): string[] {
    if (checked) return selected.includes(code) ? selected : [...selected, code];
    return selected.filter((candidate) => candidate !== code);
}

export function updateAllSelections(optionCodes: string[], checked: boolean): string[] {
    return checked ? Array.from(new Set(optionCodes)) : [];
}

export function appendCategorySelections(params: URLSearchParams, selections: CategorySelections) {
    for (const key of ["markets", "sectors17", "sectors33"] as const) {
        if (selections[key].length) params.set(key, selections[key].join(","));
    }
    return params;
}
