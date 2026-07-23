export interface SegmentColumnIdentityInput {
    period: string;
    quarter?: string;
    segment_name: string;
    segment_order?: number | null;
}

export interface SegmentColumnValueInput extends SegmentColumnIdentityInput {
    segment_sales: number | null;
    segment_profit: number | null;
}

export interface SegmentColumnIdentityGroup {
    displayKey: string;
    names: string[];
}

export interface SegmentValueColumn {
    display_key: string;
    salesKey: string;
    profitKey: string;
}

interface HistoricalGroup extends SegmentColumnIdentityGroup {
    latestPeriod: string;
    segmentOrder: number | null;
    firstIndex: number;
}

/**
 * Build the Viewer segment-column contract.
 *
 * Reference rows are the current latest-FY rows and keep their existing order.
 * Canonical winner rows that only occur in older periods are appended in a
 * deterministic order so their values are not silently dropped.
 *
 * The caller owns identity resolution through resolveDisplayKey.  This keeps
 * canonical aliases on one column without merging distinct identities merely
 * because their labels look similar.
 */
export function buildSegmentColumnUnion(
    allSegments: SegmentColumnIdentityInput[],
    referenceSegments: SegmentColumnIdentityInput[],
    resolveDisplayKey: (name: string) => string,
): SegmentColumnIdentityGroup[] {
    const groups = new Map<string, SegmentColumnIdentityGroup>();

    const addName = (group: SegmentColumnIdentityGroup, name: string) => {
        if (!group.names.includes(name)) group.names.push(name);
    };

    for (const segment of referenceSegments) {
        const displayKey = resolveDisplayKey(segment.segment_name);
        if (!displayKey) continue;
        let group = groups.get(displayKey);
        if (!group) {
            group = { displayKey, names: [] };
            groups.set(displayKey, group);
        }
        addName(group, segment.segment_name);
    }

    const historical = new Map<string, HistoricalGroup>();
    allSegments.forEach((segment, index) => {
        const displayKey = resolveDisplayKey(segment.segment_name);
        if (!displayKey) return;

        const existing = groups.get(displayKey);
        if (existing) {
            addName(existing, segment.segment_name);
            return;
        }

        const current = historical.get(displayKey);
        const order = Number.isFinite(segment.segment_order)
            ? Number(segment.segment_order)
            : null;
        if (!current) {
            historical.set(displayKey, {
                displayKey,
                names: [segment.segment_name],
                latestPeriod: segment.period,
                segmentOrder: order,
                firstIndex: index,
            });
            return;
        }

        addName(current, segment.segment_name);
        if (segment.period > current.latestPeriod) {
            current.latestPeriod = segment.period;
            current.segmentOrder = order;
            current.firstIndex = index;
        } else if (
            segment.period === current.latestPeriod
            && order !== null
            && (current.segmentOrder === null || order < current.segmentOrder)
        ) {
            current.segmentOrder = order;
            current.firstIndex = index;
        }
    });

    const historicalGroups = [...historical.values()].sort((a, b) => {
        const periodOrder = b.latestPeriod.localeCompare(a.latestPeriod);
        if (periodOrder !== 0) return periodOrder;

        if (a.segmentOrder !== null || b.segmentOrder !== null) {
            if (a.segmentOrder === null) return 1;
            if (b.segmentOrder === null) return -1;
            if (a.segmentOrder !== b.segmentOrder) {
                return a.segmentOrder - b.segmentOrder;
            }
        }

        const identityOrder = a.displayKey.localeCompare(b.displayKey, "en");
        if (identityOrder !== 0) return identityOrder;
        return a.firstIndex - b.firstIndex;
    });

    for (const group of historicalGroups) {
        groups.set(group.displayKey, {
            displayKey: group.displayKey,
            names: group.names,
        });
    }

    return [...groups.values()];
}

export function buildSegmentValueMap(
    segments: SegmentColumnValueInput[],
    columns: SegmentValueColumn[],
    resolveDisplayKey: (name: string) => string,
): Map<string, Record<string, number | null>> {
    const columnsByIdentity = new Map(
        columns.map((column) => [column.display_key, column]),
    );
    const values = new Map<string, Record<string, number | null>>();

    for (const segment of segments) {
        const column = columnsByIdentity.get(
            resolveDisplayKey(segment.segment_name),
        );
        if (!column) continue;

        const periodKey = `${segment.period}|${(segment as { quarter?: string }).quarter ?? ""}`;
        if (!values.has(periodKey)) values.set(periodKey, {});
        const row = values.get(periodKey)!;
        row[column.salesKey] = segment.segment_sales;
        row[column.profitKey] = segment.segment_profit;
    }

    return values;
}

export function hasDisplayableSegmentValue(
    sales: number | null,
    profit: number | null,
): boolean {
    return sales !== null || profit !== null;
}
