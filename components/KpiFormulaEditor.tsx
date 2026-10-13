"use client";
import React, { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KpiEditorStore } from "@/lib/kpi-editor-store";
import { parseTsvClipboard } from "@/lib/tsv-parser";
import { targetKey } from "@/lib/kpi-formula";

const MIME = "application/x-company-kpi";
function clipboardHandlers(store: KpiEditorStore) {
    return {
        onCopy: (e: React.ClipboardEvent) => {
            e.stopPropagation(); if (store.getEditor().editing || (e.target as HTMLElement).tagName === "TEXTAREA") return;
            const copied = store.clipboard(); if (!copied) return;
            e.preventDefault(); e.clipboardData.setData("text/plain", copied.text); e.clipboardData.setData(MIME, copied.custom);
        },
        onPaste: (e: React.ClipboardEvent) => {
            e.stopPropagation();
            const text = e.clipboardData.getData("text/plain"), custom = e.clipboardData.getData(MIME);
            if (store.getEditor().editing && !custom && !/[\t\n]/.test(text)) return;
            e.preventDefault(); store.paste(parseTsvClipboard(text), custom);
        },
    };
}
function handleKey(e: React.KeyboardEvent, store: KpiEditorStore, editor = false) {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    const command = e.ctrlKey || e.metaKey;
    const move = (row: number, col: number, extend = false) => {
        const root = e.currentTarget.closest(".pl-section"); store.move(row, col, extend);
        const selected = store.getEditor().selected, location = selected ? store.location(selected) : null;
        if (location) requestAnimationFrame(() => root?.querySelector<HTMLElement>(`[data-kpi-row="${location.row}"][data-kpi-slot="${location.col + 1}"]`)?.focus());
    };
    // After Enter the bar can remain focused without another focus event. Its
    // next text/caret key starts a draft rather than clearing/navigating the grid.
    if (editor && !store.getEditor().editing && !command && !["Enter", "Escape", "Tab"].includes(e.key)) {
        const selected = store.getEditor().selected; if (selected) store.begin(selected, undefined, "bar");
    }
    if (command && !store.getEditor().editing && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        e.preventDefault(); if (e.shiftKey || e.key.toLowerCase() === "y") store.redo(); else store.undo(); return;
    }
    if (e.key === "Escape") { e.preventDefault(); store.cancel(); if (!editor) move(0, 0); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); store.commit(); if (!editor) move(1, 0); return; }
    if (e.key === "Tab") { e.preventDefault(); store.commit(); move(0, e.shiftKey ? -1 : 1); return; }
    if (!store.getEditor().editing && e.key.startsWith("Arrow")) {
        e.preventDefault(); move(e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0, e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0, e.shiftKey); return;
    }
    if (!store.getEditor().editing && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); store.clear(); return; }
    if (!store.getEditor().editing && (e.key === "F2" || !command && e.key.length === 1)) {
        if (editor && e.key !== "F2") return; // Native text input activates the bar in onChange.
        e.preventDefault(); const selected = store.getEditor().selected; if (selected) store.begin(selected, e.key === "F2" ? undefined : e.key); return;
    }
}
function KpiDraft({ store, cellKey, bar = false }: { store: KpiEditorStore; cellKey: string; bar?: boolean }) {
    const snapshot = useSyncExternalStore(store.subscribeEditor, store.getEditor, store.getEditor);
    const input = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (!bar) { input.current?.focus(); input.current?.setSelectionRange(store.cursorPosition(), store.cursorPosition()); } }, [bar, store]);
    useEffect(() => {
        if (input.current === document.activeElement && input.current) input.current.setSelectionRange(store.cursorPosition(), store.cursorPosition());
    }, [snapshot.insertVersion, store]);
    return <textarea ref={input} data-kpi-editor="input" aria-label={bar ? "KPI数式バー" : `KPIセル編集 ${store.label(cellKey)}`}
        className={bar ? "kpi-formula-input" : "memo-inline-input kpi-formula-input"}
        value={snapshot.editing ? snapshot.draft : store.formulaText(cellKey)} spellCheck={false}
        onFocus={() => { if (!store.getEditor().editing || bar && store.getEditor().source !== "bar") store.begin(cellKey, store.getEditor().editing ? store.getEditor().draft : undefined, bar ? "bar" : "cell"); }}
        onChange={e => { store.setCursor(e.target.selectionStart, e.target.selectionEnd); store.draft(e.target.value, bar ? "bar" : "cell"); }}
        onSelect={e => store.setCursor(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        onKeyDown={e => handleKey(e, store, bar)} {...clipboardHandlers(store)}
        onBlur={e => { if (!(e.relatedTarget as HTMLElement | null)?.closest("[data-kpi-editor]")) store.commit(); }} />;
}
export const KpiFormulaBar = memo(function KpiFormulaBar({ store }: { store: KpiEditorStore }) {
    const snapshot = useSyncExternalStore(store.subscribeEditor, store.getEditor, store.getEditor);
    const bar = useRef<HTMLDivElement>(null);
    const [viewportWidth, setViewportWidth] = useState<number>();
    useEffect(() => {
        // Viewer tables deliberately overflow horizontally. Anchor the editor to
        // their scroll viewport rather than the oversized table/content width.
        const container = bar.current?.closest<HTMLElement>(".company-viewer-scroll-body") ?? bar.current?.parentElement;
        if (!container) return;
        const update = () => { if (container.clientWidth > 0) setViewportWidth(Math.max(0, container.clientWidth - 2)); };
        update(); const observer = new ResizeObserver(update); observer.observe(container);
        return () => observer.disconnect();
    }, []);
    const references = store.referenceLabels();
    return <div ref={bar} className="kpi-formula-bar" style={{ width: viewportWidth }} data-kpi-editor="bar" data-editing={snapshot.editing} data-editor-source={snapshot.source} onKeyDown={e => e.stopPropagation()}>
        <div className="kpi-formula-controls">
            <span className="kpi-formula-address">{snapshot.selected ? `${store.address(snapshot.selected)} · ${store.label(snapshot.selected)}` : "KPI1〜3のセルを選択"}</span>
            <button type="button" onClick={() => store.undo()} aria-label="KPIを元に戻す">↶</button>
            <button type="button" onClick={() => store.redo()} aria-label="KPIをやり直す">↷</button>
            <span role="status">{snapshot.error || (snapshot.saving ? "保存中…" : "")}</span>
            {snapshot.error && <button type="button" onClick={() => store.retry()}>保存を再試行</button>}
        </div>
        {snapshot.selected ? <KpiDraft key={snapshot.selected} store={store} cellKey={snapshot.selected} bar /> : <textarea className="kpi-formula-input" aria-label="KPI数式バー" disabled placeholder="KPIセルを選択すると編集できます" />}
        <details className="kpi-formula-help"><summary>数式の参照・操作</summary>
            <p>CUM＝累計実績、Q＝単独四半期実績、FY＝通期予想、KPI＝KPI1〜3（A〜C）。行番号は現在の表示順です。読み込み済みの画面外の過去期間は末尾に続きます。保存した参照は決算期・科目に固定され、行追加時の編集表示は対応する番地に更新されます。</p>
            <p>PLのA＝売上高、B＝売上総利益、C＝粗利率、D＝販管費、E＝その期間の表示利益科目、F＝同利益率、G＝純利益、H＝EPS。FYのI＝別欄で表示する経常利益。金額はAPIの百万円（丸め前）、EPSは円、率は1＝100%。Qの純利益・EPSは未提供です。</p>
            <p>例：=ROUND(CUM!E1/CUM!A1*100,2)。式の編集中に数値セルをクリックして参照、Shift+クリックで範囲を挿入。ダブルクリックまたはF2で編集、Enterで確定、Escapeで取消、矢印・Tabで移動。Shift+矢印・Shift+クリックでKPI範囲選択。Ctrl/Cmd+C・Vでコピー・貼り付け、Ctrl/Cmd+Z・Shift+Z（またはY）でUndo/Redo。</p>
            <p>同じ銘柄のKPI間のコピーは相対参照を移動し、$A1は列固定、A$1は行固定、$A$1は両方固定です。外部へのコピーは数式テキストとなり、貼り付け先の現在の番地で結び付けます。欠損値を0として計算しません。</p>
        </details>
        {references.length > 0 && <details className="kpi-formula-references"><summary>保存した参照先（{references.length}）</summary>
            {references.map((reference, i) => <div key={i}><strong>{reference.address}</strong><ul>{reference.labels.map((label, j) => <li key={j}>{label}</li>)}</ul></div>)}
        </details>}
    </div>;
});
export const KpiFormulaCell = memo(function KpiFormulaCell({ store, row, slot, width, cellKey }: { store: KpiEditorStore; row: number; slot: number; width: number; cellKey: string }) {
    const cell = store.book.sheets.KPI[row]?.[slot - 1]; const key = cellKey;
    const snapshot = useSyncExternalStore(listener => store.subscribe(key, listener), () => store.getCell(key), () => store.getCell(key));
    const editing = useSyncExternalStore(store.subscribeEditor, () => store.getEditor().selected === key && store.getEditor().editing && store.getEditor().source === "cell", () => false);
    const td = useRef<HTMLTableCellElement>(null);
    const selected = snapshot.startsWith("1|");
    useEffect(() => { if (selected && !editing && document.activeElement?.closest("[data-kpi-editor]") && document.activeElement.tagName !== "TEXTAREA") td.current?.focus(); }, [selected, editing]);
    const value = cell ? store.getValue(key) : "";
    return <td ref={td} tabIndex={selected ? 0 : -1} data-kpi-editor="cell" data-kpi-row={row} data-kpi-slot={slot}
        data-formula-ref={`KPI|${row}|${slot - 1}`} aria-label={`KPI${slot} ${cell?.target.period ?? ""} ${cell?.target.quarter ?? ""}`}
        title={cell ? `${store.label(key)}\n${store.formulaText(key)}` : ""}
        className={`memo-cell kpi-cell ${selected ? "cell-active" : ""} ${snapshot.split("|")[1] === "1" ? "cell-in-range" : ""} ${value.startsWith("#") ? "kpi-formula-error" : ""}`}
        style={{ width, minWidth: width, maxWidth: width }}
        onMouseDown={e => { if ((e.target as HTMLElement).tagName === "TEXTAREA" || !cell) return; e.preventDefault(); e.stopPropagation(); store.select(key, e.shiftKey); td.current?.focus(); }}
        onClick={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); if ((e.target as HTMLElement).tagName !== "TEXTAREA" && cell) store.begin(key); }}
        onKeyDown={e => handleKey(e, store)} {...clipboardHandlers(store)}>
        {editing ? <KpiDraft store={store} cellKey={key} /> : <span>{value}</span>}
    </td>;
});
