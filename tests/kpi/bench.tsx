"use client";
// Test-only production-build harness. Never linked from or deployed with the app.
import React, { useEffect, useRef, useState } from "react";
import FinancialsTable from "../../components/FinancialsTable";
import { buildKpiBook } from "../../lib/kpi-reference-book";
import { compileFormula, FormulaEngine } from "../../lib/kpi-formula";
import type { KpiValueMap } from "../../lib/kpi-api";
import type { KpiEdit } from "../../lib/kpi-editor-store";
import type { FinancialRecord } from "../../types/financial";

let computation = 0, evaluation = 0, evaluated = 0, rendering = 0, renderCalculation = 0;
const originalUpdate = FormulaEngine.prototype.update;
FormulaEngine.prototype.update = function(book) {
    const initializing = this.book.sheets.KPI.length === 0;
    const start = performance.now(); const result = originalUpdate.call(this, book), elapsed = performance.now() - start;
    computation += elapsed; if (initializing) renderCalculation += elapsed;
    evaluation += this.lastCalculationMs; evaluated += this.evaluated;
    return result;
};
function fixture(ticker: string, count: number, realPeriods = false) {
    // 501 cells in every stress condition. Synthetic Txxx rows intentionally exceed
    // the ordinary 5 fiscal-year x 4 quarter x 3 KPI = 60-cell product window.
    const rows: FinancialRecord[] = Array.from({ length: realPeriods ? 4 : 167 }, (_, i) => ({
        ticker, period: "2026-03-31", quarter: realPeriods ? ["1Q", "2Q", "3Q", "FY"][i] : `T${String(i).padStart(3, "0")}`,
        sales: 123.456789 + i, gross_profit: 50 + i * 0.1, operating_profit: 10 + i * 0.1,
        ordinary_profit: null, profit_before_tax: null, net_income: 5, eps: 12.345,
        source: "xbrl", updated_at: "", consolidation_scope: "non_consolidated",
    }));
    const values: KpiValueMap = {};
    const book = buildKpiBook(ticker, rows, {});
    book.sheets.KPI.forEach((row, r) => row.forEach((cell, c) => {
        const index = r * 3 + c, key = `cum|${cell.target.period}|${cell.target.quarter}`;
        values[key] ??= {};
        values[key][c + 1] = index === 0 ? "1" : index <= count ? compileFormula(`=ROUND(CUM!E${r + 1}/CUM!A${r + 1}*100,6)+KPI!$A$1`, book) : "123";
    }));
    return { rows, values };
}
export default function KpiBench() {
    const [condition, setCondition] = useState(0), [ticker, setTicker] = useState("TEST-A"), [realPeriods, setReal] = useState(false);
    const initial = useRef(fixture("TEST-A", 0));
    const [data, setData] = useState(initial.current.rows), [values, setValues] = useState(initial.current.values);
    const [samples, setSamples] = useState<unknown[]>([]), [saved, setSaved] = useState(0);
    const region = useRef<HTMLDivElement>(null);
    const timer = useRef<{ start: number; lastMutation: number; operation: string } | null>(null);
    const start = (operation: string) => { computation = 0; evaluation = 0; evaluated = 0; rendering = 0; renderCalculation = 0; timer.current = { start: performance.now(), lastMutation: performance.now(), operation }; };
    const finish = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        const current = timer.current; if (!current) return;
        const total = performance.now() - current.start;
        const dom = Math.max(0, current.lastMutation - current.start - computation);
        setSamples(previous => [...previous, { condition, operation: current.operation, computeMs: computation, evaluateMs: evaluation, reactRenderMs: Math.max(0, rendering - renderCalculation), domMs: dom, totalMs: total, formulasEvaluated: evaluated }]);
        timer.current = null;
    }));
    useEffect(() => {
        const observer = new MutationObserver(() => { if (timer.current) timer.current.lastMutation = performance.now(); });
        if (region.current) observer.observe(region.current, { childList: true, characterData: true, attributes: true, subtree: true });
        return () => observer.disconnect();
    }, []);
    const apply = (nextTicker: string, count: number, normal: boolean) => {
        const next = fixture(nextTicker, count, normal); setTicker(nextTicker); setCondition(count); setReal(normal); setData(next.rows); setValues(next.values);
    };
    return <main>
        <h1>KPI production-build test harness</h1>
        <p>No backend writes. NODE_ENV: {process.env.NODE_ENV}. Synthetic data only.</p>
        <div>{[0, 100, 500].map(count => <button key={count} onClick={() => apply(ticker, count, false)}>式{count}個</button>)}
            <button onClick={() => apply(ticker, 0, true)}>通常期間</button>
            <button onClick={() => {
                const nextTicker = ticker === "TEST-A" ? "TEST-B" : "TEST-A", next = fixture(nextTicker, condition, realPeriods);
                start("ticker-switch"); setTicker(nextTicker); setData(next.rows); setValues(next.values); finish();
            }}>銘柄切替を測定</button>
            <button onClick={() => { start("scroll"); const pane = region.current?.querySelector(".pl-scroll-area"); if (pane) { pane.scrollLeft = pane.scrollLeft ? 0 : 500; } window.scrollBy(0, window.scrollY > 0 ? -600 : 600); finish(); }}>スクロールを測定</button>
            <button onClick={() => { const stored = sessionStorage.getItem("kpi-bench-values"); if (stored) setValues(JSON.parse(stored)); }}>保存値を再取得</button>
            <button onClick={() => apply(ticker, condition, realPeriods)}>初期化</button>
            <span>条件: {condition} / 保存バッチ数: {saved}</span>
        </div>
        <pre aria-label="性能測定結果">{JSON.stringify(samples)}</pre>
        <div className="viewer-container company-viewer-panel font-default">
        <div className="company-viewer-scroll-body">
        <div className="viewer-main" style={{ minWidth: 2108 }} ref={region} onKeyDownCapture={e => { if (e.key === "Enter" && (e.target as HTMLElement).matches("[data-kpi-editor=input]")) { start("commit"); finish(); } }}>
            <React.Profiler id="PL" onRender={(_id, _phase, duration) => { if (timer.current) rendering += duration; }}>
            <FinancialsTable data={data} loading={false} kpiValues={values} kpiDefs={{ 1: "既存の変更済み列名", 2: "KPI2", 3: "KPI3" }} segments={[]}
                onKpiBatchEdit={async (edits: KpiEdit[]) => {
                    setValues(previous => {
                        const next = { ...previous }; for (const edit of edits) { const key = `${edit.tableScope}|${edit.period}|${edit.quarter}`; next[key] = { ...next[key], [edit.kpiSlot]: edit.value }; }
                        sessionStorage.setItem("kpi-bench-values", JSON.stringify(next)); return next;
                    }); setSaved(previous => previous + 1);
                }} />
            </React.Profiler>
        </div>
        </div></div>
    </main>;
}
