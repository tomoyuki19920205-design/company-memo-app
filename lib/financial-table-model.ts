import type { FinancialRecord } from "../types/financial";
import {
    buildCumulativeRows,
    buildQStandaloneRows,
    filterLast5Years,
    FORECAST_SOURCES,
    sortForDisplay,
} from "./quarter-math";

export function buildFinancialTableModel(data: FinancialRecord[]) {
    const filteredAll = filterLast5Years(data);
    const actual = filteredAll.filter(
        (row) => !FORECAST_SOURCES.has(row.source ?? ""),
    );
    const sorted = sortForDisplay(actual);

    return {
        cumulativeRows: buildCumulativeRows(sorted),
        standaloneRows: buildQStandaloneRows(sorted),
        forecastFYRows: filteredAll
            .filter(
                (row) =>
                    row.quarter === "FY" &&
                    FORECAST_SOURCES.has(row.source ?? ""),
            )
            .sort((a, b) => b.period.localeCompare(a.period)),
    };
}
