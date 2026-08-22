import type {
    CorporateActionRecord,
    PerShareAdjustmentAudit,
    PerShareRecord,
} from "@/types/market-data";

const SHARE_RATIO_TOLERANCE = 0.03;
const DIVIDEND_INFERENCE_MAX_RELATIVE_ERROR = 0.5;
const DIVIDEND_FIELDS = [
    "dividend_q1",
    "dividend_q2",
    "dividend_q3",
    "dividend_fy_end",
] as const;

type DividendField = (typeof DIVIDEND_FIELDS)[number];

const nearlyEqual = (left: number, right: number, tolerance: number): boolean =>
    Math.abs(left - right) / Math.max(Math.abs(right), 1) <= tolerance;

/** Reject adjustment factors that are not a stable small rational ratio. */
const isSplitLikeFactor = (factor: number): boolean => {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return false;
    for (let denominator = 1; denominator <= 20; denominator += 1) {
        for (let numerator = 1; numerator <= 20; numerator += 1) {
            if (Math.abs(factor - numerator / denominator) <= 1e-12) return true;
        }
    }
    return false;
};

const isUnambiguousUnitSplitFactor = (factor: number): boolean => {
    const ratio = factor < 1 ? 1 / factor : factor;
    const rounded = Math.round(ratio);
    return rounded >= 2 && rounded <= 20 && Math.abs(ratio - rounded) <= 1e-12;
};

/**
 * J-Quants daily adjustment factors include non-split corporate actions.
 * Integer/reciprocal-integer ratios are unambiguous split/consolidation
 * factors. Non-unit rational ratios are retained only when their inverse
 * cumulative factor is independently confirmed by disclosed issued shares.
 */
export function getVerifiedShareBasisActions(
    rows: PerShareRecord[],
    actions: CorporateActionRecord[],
): CorporateActionRecord[] {
    const snapshots = rows
        .filter((row) =>
            Boolean(row.disclosed_date) &&
            row.shares_outstanding !== null &&
            row.shares_outstanding > 0,
        )
        .sort((a, b) =>
            (a.disclosed_date ?? "").localeCompare(b.disclosed_date ?? "") ||
            a.period.localeCompare(b.period),
        )
        .filter((row, index, all) => {
            const next = all[index + 1];
            return !next || next.disclosed_date !== row.disclosed_date;
        });
    const sortedActions = actions
        .filter((action) => isSplitLikeFactor(action.adj_factor))
        .sort((a, b) => a.date.localeCompare(b.date));
    const verified = new Set<string>(
        sortedActions
            .filter((action) => isUnambiguousUnitSplitFactor(action.adj_factor))
            .map((action) => `${action.date}:${action.adj_factor}`),
    );

    for (let index = 1; index < snapshots.length; index += 1) {
        const before = snapshots[index - 1];
        const after = snapshots[index];
        const group = sortedActions.filter((action) =>
            action.date > (before.disclosed_date ?? "") &&
            action.date <= (after.disclosed_date ?? ""),
        );
        if (group.length === 0) continue;

        const cumulativeFactor = group.reduce(
            (factor, action) => factor * action.adj_factor,
            1,
        );
        const observedShareRatio =
            (after.shares_outstanding ?? 0) / (before.shares_outstanding ?? 1);
        if (nearlyEqual(observedShareRatio, 1 / cumulativeFactor, SHARE_RATIO_TOLERANCE)) {
            group.forEach((action) => verified.add(`${action.date}:${action.adj_factor}`));
        }
    }

    return sortedActions.filter((action) =>
        verified.has(`${action.date}:${action.adj_factor}`),
    );
}

export const cumulativeShareBasisFactor = (
    basisDate: string | null,
    throughDate: string | null,
    actions: CorporateActionRecord[],
): number => {
    if (!basisDate || !throughDate) return 1;
    return actions.reduce((factor, action) =>
        action.date > basisDate && action.date <= throughDate
            ? factor * action.adj_factor
            : factor,
    1);
};

const adjusted = (value: number | null, factor: number): number | null =>
    value === null ? null : value * factor;

const audit = (
    raw: number | null,
    factor: number,
    basisDate: string | null,
    method: string,
): PerShareAdjustmentAudit => ({
    raw_value: raw,
    adjusted_value: adjusted(raw, factor),
    cumulative_factor: factor,
    basis_date: basisDate,
    method,
});

const initialForecastBasisDate = (
    row: PerShareRecord,
    rows: PerShareRecord[],
): string | null => {
    if (row.source === "jquants_nxf" || row.eps === null) {
        return row.disclosed_date;
    }
    return [...rows]
        .filter((candidate) =>
            candidate.quarter === "FY" &&
            candidate.eps !== null &&
            candidate.period < row.period &&
            Boolean(candidate.disclosed_date),
        )
        .sort((a, b) => b.period.localeCompare(a.period))[0]?.disclosed_date
        ?? row.disclosed_date;
};

const factorOptions = (
    actions: CorporateActionRecord[],
    afterDate: string,
    rowDate: string,
    throughDate: string,
): number[] => {
    const between = actions.filter((action) =>
        action.date > afterDate && action.date <= rowDate,
    );
    const postRowFactor = cumulativeShareBasisFactor(rowDate, throughDate, actions);
    const factors = [postRowFactor];
    let cumulative = postRowFactor;
    for (let index = between.length - 1; index >= 0; index -= 1) {
        cumulative *= between[index].adj_factor;
        factors.push(cumulative);
    }
    return [...new Set(factors)];
};

const componentSums = (values: number[], factors: number[]): number[] => {
    let sums = [0];
    for (const value of values) {
        sums = sums.flatMap((sum) => factors.map((factor) => sum + value * factor));
    }
    return sums;
};

const normalizeActualDividend = (
    row: PerShareRecord,
    periodRows: PerShareRecord[],
    actions: CorporateActionRecord[],
    throughDate: string,
): { value: number | null; audit: PerShareAdjustmentAudit } => {
    const rowDate = row.disclosed_date;
    const postRowFactor = cumulativeShareBasisFactor(rowDate, throughDate, actions);
    const fallback = adjusted(row.dividend_annual, postRowFactor);
    const fallbackAudit = audit(
        row.dividend_annual,
        postRowFactor,
        rowDate,
        "disclosure-date",
    );
    if (row.dividend_annual === null || !rowDate) {
        return { value: fallback, audit: fallbackAudit };
    }

    const priorForecast = [...periodRows]
        .filter((candidate) =>
            Boolean(candidate.disclosed_date) &&
            (candidate.disclosed_date ?? "") < rowDate &&
            candidate.forecast_dividend_annual !== null,
        )
        .sort((a, b) =>
            (b.disclosed_date ?? "").localeCompare(a.disclosed_date ?? ""),
        )[0];
    if (!priorForecast?.disclosed_date || priorForecast.forecast_dividend_annual === null) {
        return { value: fallback, audit: fallbackAudit };
    }

    const actionsDuringPeriod = actions.filter((action) =>
        action.date > priorForecast.disclosed_date! && action.date <= rowDate,
    );
    if (actionsDuringPeriod.length === 0) {
        return { value: fallback, audit: fallbackAudit };
    }

    const target = adjusted(
        priorForecast.forecast_dividend_annual,
        cumulativeShareBasisFactor(priorForecast.disclosed_date, throughDate, actions),
    );
    if (target === null || target < 0) return { value: fallback, audit: fallbackAudit };

    const factors = factorOptions(
        actions,
        priorForecast.disclosed_date,
        rowDate,
        throughDate,
    );
    const componentValues = DIVIDEND_FIELDS
        .map((field: DividendField) => row[field])
        .filter((value): value is number => value !== null);
    const candidates = [
        ...factors.map((factor) => row.dividend_annual! * factor),
        ...(componentValues.length > 0 ? componentSums(componentValues, factors) : []),
    ].filter((value, index, all) =>
        Number.isFinite(value) && all.findIndex((candidate) =>
            Math.abs(candidate - value) <= 1e-9,
        ) === index,
    );
    const best = candidates.sort((left, right) =>
        Math.abs(left - target) - Math.abs(right - target),
    )[0];
    const relativeError = Math.abs(best - target) / Math.max(Math.abs(target), 1);
    if (!Number.isFinite(best) || relativeError > DIVIDEND_INFERENCE_MAX_RELATIVE_ERROR) {
        return { value: fallback, audit: fallbackAudit };
    }

    return {
        value: best,
        audit: {
            raw_value: row.dividend_annual,
            adjusted_value: best,
            cumulative_factor: best / row.dividend_annual,
            basis_date: priorForecast.disclosed_date,
            method: "component-basis-inference",
        },
    };
};

/**
 * Clone canonical per-share rows into the current raw-price share basis.
 * Canonical/DB values are never mutated.
 */
export function normalizePerShareRowsForDisplay(
    rows: PerShareRecord[],
    corporateActions: CorporateActionRecord[],
    priceDate: string | null,
): PerShareRecord[] {
    if (!priceDate) return rows.map((row) => ({ ...row }));
    const actions = getVerifiedShareBasisActions(rows, corporateActions)
        .filter((action) => action.date <= priceDate);

    return rows.map((row) => {
        const basisDate = row.disclosed_date;
        const factor = cumulativeShareBasisFactor(basisDate, priceDate, actions);
        const initialBasisDate = initialForecastBasisDate(row, rows);
        const initialFactor = cumulativeShareBasisFactor(initialBasisDate, priceDate, actions);
        const periodRows = rows.filter((candidate) => candidate.period === row.period);
        const normalizedDividend = normalizeActualDividend(
            row,
            periodRows,
            actions,
            priceDate,
        );
        const isCompletedFy = row.quarter === "FY" && row.eps !== null;
        const normalizedForecastDividend = isCompletedFy && row.dividend_annual !== null
            ? normalizedDividend.value
            : adjusted(row.forecast_dividend_annual, factor);

        return {
            ...row,
            eps: adjusted(row.eps, factor),
            diluted_eps: adjusted(row.diluted_eps, factor),
            bps: adjusted(row.bps, factor),
            dividend_q1: adjusted(row.dividend_q1, factor),
            dividend_q2: adjusted(row.dividend_q2, factor),
            dividend_q3: adjusted(row.dividend_q3, factor),
            dividend_fy_end: adjusted(row.dividend_fy_end, factor),
            dividend_annual: normalizedDividend.value,
            forecast_eps: adjusted(row.forecast_eps, factor),
            initial_forecast_eps: adjusted(row.initial_forecast_eps, initialFactor),
            forecast_dividend_annual: normalizedForecastDividend,
            adjustment_audit: {
                eps: audit(row.eps, factor, basisDate, "disclosure-date"),
                forecast_eps: audit(row.forecast_eps, factor, basisDate, "disclosure-date"),
                initial_forecast_eps: audit(
                    row.initial_forecast_eps,
                    initialFactor,
                    initialBasisDate,
                    "initial-forecast-source-date",
                ),
                dividend_annual: normalizedDividend.audit,
                forecast_dividend_annual: {
                    raw_value: row.forecast_dividend_annual,
                    adjusted_value: normalizedForecastDividend,
                    cumulative_factor:
                        row.forecast_dividend_annual === null || normalizedForecastDividend === null
                            ? factor
                            : normalizedForecastDividend / row.forecast_dividend_annual,
                    basis_date: basisDate,
                    method: isCompletedFy
                        ? "completed-fy-actual-basis"
                        : "disclosure-date",
                },
                bps: audit(row.bps, factor, basisDate, "disclosure-date"),
            },
        };
    });
}
