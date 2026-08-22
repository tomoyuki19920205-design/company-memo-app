import { SCREENER_METRICS } from "./screener";

export const SCREENER_COLUMN_ORDER_KEY = "screener_column_order";
export const SCREENER_COLUMN_WIDTHS_KEY = "screener_column_widths";

// UI preference compatibility only. The legacy metric is not used by the screener runtime.
const LEGACY_COLUMN_KEY_ALIASES: Record<string, string> = {
    forecast_sales_growth_per_forward_per: "forward_per_per_forecast_sales_growth",
};

export type ScreenerColumnDefinition = {
    key: string;
    label: string;
    defaultWidth: number;
    minWidth: number;
    maxWidth: number;
    numeric?: boolean;
};

const BASE_COLUMNS: ScreenerColumnDefinition[] = [
    { key: "ticker", label: "銘柄", defaultWidth: 80, minWidth: 70, maxWidth: 160 },
    { key: "company_name", label: "会社名", defaultWidth: 190, minWidth: 120, maxWidth: 420 },
    { key: "market", label: "市場", defaultWidth: 100, minWidth: 80, maxWidth: 220 },
    { key: "sector33", label: "33業種", defaultWidth: 130, minWidth: 100, maxWidth: 260 },
    { key: "price", label: "価格", defaultWidth: 100, minWidth: 80, maxWidth: 180, numeric: true },
    { key: "price_status", label: "価格日/status", defaultWidth: 145, minWidth: 110, maxWidth: 260 },
];

function metricDefinition(key: string, label: string): ScreenerColumnDefinition {
    if (key === "market_cap") {
        return { key, label, defaultWidth: 150, minWidth: 130, maxWidth: 260, numeric: true };
    }
    if (key === "forward_per_per_forecast_sales_growth") {
        return { key, label, defaultWidth: 170, minWidth: 140, maxWidth: 280, numeric: true };
    }
    return { key, label, defaultWidth: 115, minWidth: 90, maxWidth: 240, numeric: true };
}

export const SCREENER_COLUMN_DEFINITIONS: ScreenerColumnDefinition[] = [
    ...BASE_COLUMNS,
    ...SCREENER_METRICS.map((metric) => metricDefinition(metric.key, metric.label)),
];

export const DEFAULT_SCREENER_COLUMN_ORDER = SCREENER_COLUMN_DEFINITIONS.map((column) => column.key);

export type ColumnWidths = Record<string, number>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function migrateColumnKey(key: string): string {
    return LEGACY_COLUMN_KEY_ALIASES[key] ?? key;
}

export function normalizeColumnOrder(saved: unknown, defaultOrder = DEFAULT_SCREENER_COLUMN_ORDER): string[] {
    const valid = new Set(defaultOrder);
    const normalized: string[] = [];
    if (Array.isArray(saved)) {
        for (const key of saved) {
            if (typeof key !== "string") continue;
            const migratedKey = migrateColumnKey(key);
            if (valid.has(migratedKey) && !normalized.includes(migratedKey)) normalized.push(migratedKey);
        }
    }

    for (let defaultIndex = 0; defaultIndex < defaultOrder.length; defaultIndex += 1) {
        const key = defaultOrder[defaultIndex];
        if (normalized.includes(key)) continue;

        let insertAt = -1;
        for (let prior = defaultIndex - 1; prior >= 0; prior -= 1) {
            const priorPosition = normalized.indexOf(defaultOrder[prior]);
            if (priorPosition >= 0) {
                insertAt = priorPosition + 1;
                break;
            }
        }
        if (insertAt < 0) {
            for (let next = defaultIndex + 1; next < defaultOrder.length; next += 1) {
                const nextPosition = normalized.indexOf(defaultOrder[next]);
                if (nextPosition >= 0) {
                    insertAt = nextPosition;
                    break;
                }
            }
        }
        normalized.splice(insertAt < 0 ? normalized.length : insertAt, 0, key);
    }
    return normalized;
}

export function clampColumnWidth(column: ScreenerColumnDefinition, width: number): number {
    return Math.round(Math.max(column.minWidth, Math.min(column.maxWidth, width)));
}

export function normalizeColumnWidths(
    saved: unknown,
    definitions = SCREENER_COLUMN_DEFINITIONS,
): ColumnWidths {
    const source = saved && typeof saved === "object" && !Array.isArray(saved)
        ? saved as Record<string, unknown>
        : {};
    return Object.fromEntries(definitions.map((column) => {
        const legacyKey = Object.keys(LEGACY_COLUMN_KEY_ALIASES)
            .find((key) => LEGACY_COLUMN_KEY_ALIASES[key] === column.key);
        const candidate = source[column.key] ?? (legacyKey ? source[legacyKey] : undefined);
        const width = typeof candidate === "number" && Number.isFinite(candidate) ? candidate : column.defaultWidth;
        return [column.key, clampColumnWidth(column, width)];
    }));
}

export function updateColumnWidth(
    widths: ColumnWidths,
    key: string,
    width: number,
    definitions = SCREENER_COLUMN_DEFINITIONS,
): ColumnWidths {
    const column = definitions.find((candidate) => candidate.key === key);
    if (!column || !Number.isFinite(width)) return widths;
    const nextWidth = clampColumnWidth(column, width);
    return widths[key] === nextWidth ? widths : { ...widths, [key]: nextWidth };
}

export function moveColumn(order: string[], sourceKey: string, targetKey: string, edge: "before" | "after"): string[] {
    if (sourceKey === targetKey || !order.includes(sourceKey) || !order.includes(targetKey)) return order;
    const next = order.filter((key) => key !== sourceKey);
    const targetIndex = next.indexOf(targetKey);
    next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, sourceKey);
    return next;
}

export function loadScreenerColumnPreferences(storage: StorageLike): { order: string[]; widths: ColumnWidths } {
    let savedOrder: unknown;
    let savedWidths: unknown;
    try {
        savedOrder = JSON.parse(storage.getItem(SCREENER_COLUMN_ORDER_KEY) ?? "null");
        savedWidths = JSON.parse(storage.getItem(SCREENER_COLUMN_WIDTHS_KEY) ?? "null");
    } catch {
        savedOrder = null;
        savedWidths = null;
    }
    return {
        order: normalizeColumnOrder(savedOrder),
        widths: normalizeColumnWidths(savedWidths),
    };
}

export function saveScreenerColumnPreferences(storage: StorageLike, order: string[], widths: ColumnWidths) {
    storage.setItem(SCREENER_COLUMN_ORDER_KEY, JSON.stringify(normalizeColumnOrder(order)));
    storage.setItem(SCREENER_COLUMN_WIDTHS_KEY, JSON.stringify(normalizeColumnWidths(widths)));
}

export function clearScreenerColumnPreferences(storage: StorageLike) {
    storage.removeItem(SCREENER_COLUMN_ORDER_KEY);
    storage.removeItem(SCREENER_COLUMN_WIDTHS_KEY);
}
