"use client";

import React, { useState, useEffect, useRef } from "react";
import FinancialsTable from "@/components/FinancialsTable";
import {
    loadCompanyInfo,
    loadFinancials,
    loadSegmentData,
} from "@/lib/viewer-api";
import {
    loadKpiDefinitions,
    loadKpiValues,
    type KpiDefMap,
    type KpiValueMap,
} from "@/lib/kpi-api";
import {
    loadAllGridMemos,
    normalizeTicker,
    type GridData,
} from "@/lib/memo-api";
import type { FinancialRecord } from "@/types/financial";
import type { SegmentRecord } from "@/types/segment";

interface CompanyViewerSidePanelProps {
    ticker: string;
    baseUrl?: string;
}

type LoadStatus = "idle" | "loading" | "done" | "error";

interface MemoMap {
    [key: string]: GridData;
}

export default function CompanyViewerSidePanel({
    ticker,
    baseUrl = "https://company-memo-app.vercel.app/",
}: CompanyViewerSidePanelProps) {
    const [companyName, setCompanyName] = useState<string | null>(null);
    const [financials, setFinancials] = useState<FinancialRecord[]>([]);
    const [segments, setSegments] = useState<SegmentRecord[]>([]);
    const [kpiDefs, setKpiDefs] = useState<KpiDefMap>({ 1: "KPI 1", 2: "KPI 2", 3: "KPI 3" });
    const [kpiValues, setKpiValues] = useState<KpiValueMap>({});
    const [memoMap, setMemoMap] = useState<MemoMap>({});
    const [selectedPeriod, setSelectedPeriod] = useState("");
    const [selectedQuarter, setSelectedQuarter] = useState("");
    const [status, setStatus] = useState<LoadStatus>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const loadedTickerRef = useRef("");

    useEffect(() => {
        if (!ticker) return;
        const t = normalizeTicker(ticker);
        if (!t) return;
        if (loadedTickerRef.current === t) return;
        loadedTickerRef.current = t;

        setStatus("loading");
        setErrorMsg("");
        setFinancials([]);
        setSegments([]);
        setSelectedPeriod("");
        setSelectedQuarter("");

        (async () => {
            try {
                const [
                    infoResult,
                    financialsResult,
                    segmentsResult,
                    kpiDefsResult,
                    kpiValuesResult,
                    memosResult,
                ] = await Promise.allSettled([
                    loadCompanyInfo(t),
                    loadFinancials(t),
                    loadSegmentData(t),
                    loadKpiDefinitions(t),
                    loadKpiValues(t),
                    loadAllGridMemos(t),
                ]);

                // 会社名
                if (infoResult.status === "fulfilled") {
                    setCompanyName(infoResult.value.companyName);
                }

                // 財務データ
                let fins: FinancialRecord[] = [];
                if (financialsResult.status === "fulfilled") {
                    fins = financialsResult.value;
                    setFinancials(fins);
                }

                // セグメント（raw そのまま使用）
                if (segmentsResult.status === "fulfilled") {
                    setSegments(segmentsResult.value);
                }

                // KPI
                if (kpiDefsResult.status === "fulfilled") {
                    setKpiDefs(kpiDefsResult.value);
                }
                if (kpiValuesResult.status === "fulfilled") {
                    setKpiValues(kpiValuesResult.value);
                }

                // Memo: loadAllGridMemos は Map<"period|quarter", GridMemoRecord> を返す
                if (memosResult.status === "fulfilled") {
                    const memoMapResult = memosResult.value;
                    const map: MemoMap = {};
                    for (const [key, rec] of memoMapResult.entries()) {
                        map[key] = rec.grid_json as GridData;
                    }
                    setMemoMap(map);
                }

                // 最初の行を選択
                if (fins.length > 0) {
                    setSelectedPeriod(fins[0].period ?? "");
                    setSelectedQuarter(fins[0].quarter ?? "");
                }

                setStatus("done");
            } catch (e) {
                setErrorMsg(e instanceof Error ? e.message : String(e));
                setStatus("error");
            }
        })();
    }, [ticker]);

    // ticker が変わったら reset
    useEffect(() => {
        loadedTickerRef.current = "";
    }, [ticker]);

    const openUrl = `${baseUrl.replace(/\/$/, "")}/?ticker=${encodeURIComponent(ticker)}`;

    return (
        <div className="cvs-root">
            {/* Header */}
            <div className="cvs-header">
                <div className="cvs-ticker-info">
                    <span className="cvs-ticker">{ticker}</span>
                    {companyName && (
                        <span className="cvs-company-name">{companyName}</span>
                    )}
                </div>
                <a
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cvs-open-btn"
                >
                    ↗ 別タブで開く
                </a>
            </div>

            {/* エラー */}
            {status === "error" && (
                <div className="cvs-error">
                    <div className="cvs-error-title">データ読み込みエラー</div>
                    <div className="cvs-error-msg">{errorMsg}</div>
                </div>
            )}

            {/* FinancialsTable 本体 */}
            <div className="cvs-body">
                <FinancialsTable
                    data={financials}
                    loading={status === "loading"}
                    selectedPeriod={selectedPeriod}
                    selectedQuarter={selectedQuarter}
                    onRowClick={(p, q) => {
                        setSelectedPeriod(p);
                        setSelectedQuarter(q);
                    }}
                    segments={segments}
                    kpiDefs={kpiDefs}
                    kpiValues={kpiValues}
                    memoMap={memoMap}
                />
            </div>
        </div>
    );
}
