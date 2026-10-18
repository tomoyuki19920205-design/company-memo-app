"use client";
import React, { memo, useEffect, useRef, useSyncExternalStore } from "react";
import { KpiEditorStore } from "@/lib/kpi-editor-store";
import { parseTsvClipboard } from "@/lib/tsv-parser";
import { targetKey, type Sheet } from "@/lib/kpi-formula";

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
    if (e.nativeEvent.isComposing || e.key === "Process" || e.keyCode === 229) return;
    const command = e.ctrlKey || e.metaKey;
    const move = (row: number, col: number, extend = false) => {
        const root = e.currentTarget.closest(".pl-section"); store.move(row, col, extend);
        const selected = store.getEditor().selected, location = selected ? store.location(selected) : null;
        if (location) requestAnimationFrame(() => root?.querySelector<HTMLElement>(`[data-formula-sheet="${location.sheet}"][data-formula-row="${location.row}"][data-formula-col="${location.col}"]`)?.focus());
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
function KpiDraft({ store, cellKey, bar = false, height }: { store: KpiEditorStore; cellKey: string; bar?: boolean; height?: number }) {
    const snapshot = useSyncExternalStore(store.subscribeEditor, store.getEditor, store.getEditor);
    const input = useRef<HTMLTextAreaElement>(null);
    const composing = useRef(false);
    const compositionEndedAt = useRef(0);
    useEffect(() => { if (!bar) { input.current?.focus(); input.current?.setSelectionRange(store.cursorPosition(), store.cursorPosition()); } }, [bar, store]);
    useEffect(() => {
        if (input.current === document.activeElement && input.current) input.current.setSelectionRange(store.cursorPosition(), store.cursorPosition());
    }, [snapshot.insertVersion, store]);
    return <textarea ref={input} data-kpi-editor="input" aria-label={bar ? "選択セルの内容" : `セル編集 ${store.label(cellKey)}`}
        className={bar ? "formula-bar-input" : "memo-inline-input kpi-formula-input"}
        style={bar ? { height } : undefined}
        value={snapshot.editing ? snapshot.draft : store.formulaText(cellKey)} spellCheck={false}
        onFocus={() => { if (!store.getEditor().editing || bar && store.getEditor().source !== "bar") store.begin(cellKey, store.getEditor().editing ? store.getEditor().draft : undefined, bar ? "bar" : "cell"); }}
        onChange={e => { store.setCursor(e.target.selectionStart, e.target.selectionEnd); store.draft(e.target.value, bar ? "bar" : "cell"); }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={e => { composing.current = false; compositionEndedAt.current = Date.now(); store.setCursor(e.currentTarget.selectionStart, e.currentTarget.selectionEnd); store.draft(e.currentTarget.value, bar ? "bar" : "cell"); }}
        onSelect={e => store.setCursor(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        onKeyDown={e => { if (composing.current || (e.key === "Enter" && Date.now() - compositionEndedAt.current < 100)) { e.stopPropagation(); return; } handleKey(e, store, bar); }} {...clipboardHandlers(store)}
        onBlur={e => { if (!(e.relatedTarget as HTMLElement | null)?.closest("[data-kpi-editor]")) store.commit(); }} />;
}
export const KpiFormulaInput = memo(function KpiFormulaInput({ store, cellKey, height }: { store: KpiEditorStore; cellKey: string; height: number }) {
    return <KpiDraft key={cellKey} store={store} cellKey={cellKey} bar height={height} />;
});

export const KpiFormulaControls = memo(function KpiFormulaControls({ store }: { store: KpiEditorStore }) {
    const snapshot = useSyncExternalStore(store.subscribeEditor, store.getEditor, store.getEditor);
    const references = store.referenceLabels();
    return <div className="kpi-formula-controls" data-kpi-editor="bar" onKeyDown={e => e.stopPropagation()}>
            <span className="cell-ref kpi-formula-address" title={snapshot.selected ? `${store.address(snapshot.selected)} · ${store.label(snapshot.selected)}` : ""}>{snapshot.selected ? `${store.address(snapshot.selected)} · ${store.label(snapshot.selected)}` : "セル未選択"}</span>
            <button type="button" onClick={() => store.undo()} aria-label="セルを元に戻す">↶</button>
            <button type="button" onClick={() => store.redo()} aria-label="セルをやり直す">↷</button>
            <details className="kpi-formula-help"><summary aria-label="数式の参照・操作" title="数式の参照・操作">ƒx</summary><div className="kpi-formula-popover">
            <div role="status">{snapshot.error || (snapshot.saving ? "保存中…" : "")}</div>
            {snapshot.error && <button type="button" onClick={() => store.retry()}>保存を再試行</button>}
            <p>CUM＝累計実績、Q＝単独四半期実績、FY＝通期予想、KPI＝KPI1〜3（A〜C）、PCUM＝累計PL下部メモ（A〜H）、PQ＝Q単体PL下部メモ（A〜F）。行番号は現在の表示順です。読み込み済みの画面外の過去期間は末尾に続きます。保存した参照は決算期・科目またはメモの位置に固定され、行追加時の編集表示は対応する番地に更新されます。</p>
            <p>PLのA＝売上高、B＝売上総利益、C＝粗利率、D＝販管費、E＝その期間の表示利益科目、F＝同利益率、G＝純利益、H＝EPS。FYのI＝別欄で表示する経常利益。金額はAPIの百万円（丸め前）、EPSは円、率は1＝100%。Qの純利益・EPSは未提供です。</p>
            <p>例：=ROUND(CUM!E1/CUM!A1*100,2)。式の編集中にセルをクリックして参照、Shift+クリックで範囲を挿入。ダブルクリックまたはF2で編集、Enterで確定、Escapeで取消、矢印・Tabで移動。Shift+矢印・Shift+クリックで範囲選択。Ctrl/Cmd+C・Vでコピー・貼り付け、Ctrl/Cmd+Z・Shift+Z（またはY）でUndo/Redo。</p>
            <p>同じ銘柄のセル間コピーは相対参照を移動し、$A1は列固定、A$1は行固定、$A$1は両方固定です。外部へのコピーは数式テキストとなり、貼り付け先の現在の番地で結び付けます。欠損値を0として計算しません。</p>
        {references.length > 0 && <details className="kpi-formula-references"><summary>保存した参照先（{references.length}）</summary>
            {references.map((reference, i) => <div key={i}><strong>{reference.address}</strong><ul>{reference.labels.map((label, j) => <li key={j}>{label}</li>)}</ul></div>)}
        </details>}
        </div></details>
        {snapshot.error && <span className="kpi-formula-status" role="alert" title={snapshot.error}>保存エラー</span>}
        {snapshot.saving && !snapshot.error && <span className="kpi-formula-status" role="status">保存中…</span>}
    </div>;
});
export const KpiFormulaCell = memo(function KpiFormulaCell({ store, row, slot, width, cellKey, sheet = "KPI", col, className = "" }: { store: KpiEditorStore; row: number; slot?: number; width: number; cellKey: string; sheet?: Sheet; col?: number; className?: string }) {
    const column = col ?? (slot ?? 1) - 1;
    const cell = store.book.sheets[sheet][row]?.[column]; const key = cellKey;
    const snapshot = useSyncExternalStore(listener => store.subscribe(key, listener), () => store.getCell(key), () => store.getCell(key));
    const editing = useSyncExternalStore(store.subscribeEditor, () => store.getEditor().selected === key && store.getEditor().editing && store.getEditor().source === "cell", () => false);
    const td = useRef<HTMLTableCellElement>(null);
    const selected = snapshot.startsWith("1|");
    useEffect(() => { if (selected && !editing && document.activeElement?.closest("[data-kpi-editor]") && document.activeElement.tagName !== "TEXTAREA") td.current?.focus(); }, [selected, editing]);
    const value = cell ? store.getValue(key) : "";
    return <td ref={td} tabIndex={selected ? 0 : -1} data-kpi-editor="cell" data-kpi-row={sheet === "KPI" ? row : undefined} data-kpi-slot={sheet === "KPI" ? slot : undefined}
        data-formula-sheet={sheet} data-formula-row={row} data-formula-col={column}
        data-formula-ref={`${sheet}|${row}|${column}`} aria-label={cell?.label ?? ""}
        title={cell ? `${store.label(key)}\n${store.formulaText(key)}` : ""}
        className={`memo-cell kpi-cell ${className} ${selected ? "cell-active" : ""} ${snapshot.split("|")[1] === "1" ? "cell-in-range" : ""} ${value.startsWith("#") ? "kpi-formula-error" : ""}`}
        style={{ width, minWidth: width, maxWidth: width }}
        onMouseDown={e => { if ((e.target as HTMLElement).tagName === "TEXTAREA" || !cell) return; e.preventDefault(); e.stopPropagation(); store.select(key, e.shiftKey); td.current?.focus(); }}
        onClick={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); if ((e.target as HTMLElement).tagName !== "TEXTAREA" && cell) store.begin(key); }}
        onKeyDown={e => handleKey(e, store)} {...clipboardHandlers(store)}>
        {editing ? <KpiDraft store={store} cellKey={key} /> : <span>{value}</span>}
    </td>;
});
