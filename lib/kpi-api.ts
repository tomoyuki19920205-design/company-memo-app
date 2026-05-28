import { supabase } from "./supabase";

// ============================================================
// KPI定義・値の型
// ============================================================
export interface KpiDefinition {
    ticker: string;
    kpi_slot: number;
    kpi_name: string;
}

export interface KpiValue {
    ticker: string;
    period: string;
    quarter: string;
    kpi_slot: number;
    kpi_value: string;
}

/** KPI定義Map: kpi_slot → kpi_name */
export type KpiDefMap = Record<number, string>;

/** KPI値Map: "period|quarter" → { [kpi_slot]: value } */
export type KpiValueMap = Record<string, Record<number, string>>;

const DEFAULT_KPI_NAMES: Record<number, string> = {
    1: "KPI 1",
    2: "KPI 2",
    3: "KPI 3",
};

// ============================================================
// KPI定義の読み込み
// ============================================================
export async function loadKpiDefinitions(ticker: string): Promise<KpiDefMap> {
    const t = ticker.trim().toUpperCase();
    if (!t) return { ...DEFAULT_KPI_NAMES };

    try {
        const { data, error } = await supabase
            .from("company_kpi_definitions")
            .select("kpi_slot, kpi_name")
            .eq("ticker", t);

        if (error) {
            console.warn("[KPI] definitions load error:", error.message);
            return { ...DEFAULT_KPI_NAMES };
        }

        const result: KpiDefMap = { ...DEFAULT_KPI_NAMES };
        if (data) {
            for (const row of data) {
                if (row.kpi_name) result[row.kpi_slot] = row.kpi_name;
            }
        }
        return result;
    } catch (err) {
        console.warn("[KPI] definitions load exception:", err);
        return { ...DEFAULT_KPI_NAMES };
    }
}

// ============================================================
// KPI定義の保存（ヘッダー名変更）
// ============================================================
export async function saveKpiDefinition(
    ticker: string,
    kpiSlot: number,
    kpiName: string
): Promise<void> {
    const t = ticker.trim().toUpperCase();
    if (!t) throw new Error("ticker が空です");

    const { error } = await supabase
        .from("company_kpi_definitions")
        .upsert(
            {
                ticker: t,
                kpi_slot: kpiSlot,
                kpi_name: kpiName,
            },
            { onConflict: "ticker,kpi_slot" }
        );

    if (error) {
        console.error("[KPI] definition save error:", error);
        throw new Error(`KPI定義の保存に失敗: ${error.message}`);
    }
}

// ============================================================
// KPI値の一括読み込み
// ============================================================
export async function loadKpiValues(ticker: string): Promise<KpiValueMap> {
    const t = ticker.trim().toUpperCase();
    const result: KpiValueMap = {};
    if (!t) return result;

    try {
        const { data, error } = await supabase
            .from("company_kpi_values")
            .select("period, quarter, kpi_slot, kpi_value")
            .eq("ticker", t);

        if (error) {
            console.warn("[KPI] values load error:", error.message);
            return result;
        }

        if (data) {
            for (const row of data) {
                // period may be prefixed with "cum__" or "q__" for scope separation
                const rawPeriod = row.period as string;
                let scope = "cum";
                let actualPeriod = rawPeriod;
                if (rawPeriod.startsWith("cum__")) { scope = "cum"; actualPeriod = rawPeriod.slice(5); }
                else if (rawPeriod.startsWith("q__")) { scope = "q"; actualPeriod = rawPeriod.slice(3); }
                const key = `${scope}|${actualPeriod}|${row.quarter}`;
                if (!result[key]) result[key] = {};
                result[key][row.kpi_slot] = row.kpi_value;
            }
        }
    } catch (err) {
        console.warn("[KPI] values load exception:", err);
    }

    return result;
}

// ============================================================
// KPI値の保存
// ============================================================
export async function saveKpiValue(
    ticker: string,
    period: string,
    quarter: string,
    kpiSlot: number,
    kpiValue: string,
    /** "cum" or "q" — scope to separate cumulative from quarterly KPI values */
    tableScope: "cum" | "q" = "cum",
): Promise<void> {
    const t = ticker.trim().toUpperCase();
    if (!t) throw new Error("ticker が空です");
    // Prefix period with scope to avoid key collision between cum and q tables
    const scopedPeriod = tableScope === "cum" ? `cum__${period}` : `q__${period}`;

    const { error } = await supabase
        .from("company_kpi_values")
        .upsert(
            {
                ticker: t,
                period: scopedPeriod,
                quarter,
                kpi_slot: kpiSlot,
                kpi_value: kpiValue,
            },
            { onConflict: "ticker,period,quarter,kpi_slot" }
        );

    if (error) {
        console.error("[KPI] value save error:", error);
        throw new Error(`KPI値の保存に失敗: ${error.message}`);
    }
}
