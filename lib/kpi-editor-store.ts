import { addressText, compileFormula, copyFormula, decodeFormula, formatResult, FormulaEngine, indexBook, isFormulaInput, projectFormula, targetKey, type Book, type ReferenceCell, type Sheet, type Target } from "./kpi-formula";

export interface KpiEdit { period: string; quarter: string; kpiSlot: number; value: string; tableScope: "cum" | "q" }
interface History { before: Map<string, string>; after: Map<string, string> }
export interface EditorSnapshot { selected: string | null; editing: boolean; source: "cell" | "bar"; draft: string; revision: number; insertVersion: number; anchor: string | null; rangeEnd: string | null; saving: boolean; error: string }
/** Draft changes only notify the editor, never the entire FinancialsTable. */
export class KpiEditorStore {
    engine = new FormulaEngine();
    private listeners = new Map<string, Set<() => void>>();
    private editorListeners = new Set<() => void>();
    private snapshot: EditorSnapshot = { selected: null, editing: false, source: "cell", draft: "", revision: 0, insertVersion: 0, anchor: null, rangeEnd: null, saving: false, error: "" };
    private undoStack: History[] = [];
    private redoStack: History[] = [];
    private pending = new Map<string, string>();
    private queue: Promise<void> = Promise.resolve();
    private cursor = { start: 0, end: 0 };
    private insertStart: number | null = null;
    private initialReference: string | null = null;
    private draftBook: Book | null = null;
    private draftDirty = false;
    private cells = new Map<string, ReferenceCell>();
    private layoutVersion = 0;
    private addressIndex = indexBook(this.engine.book).addresses;
    private formulaTextCache = new Map<string, { raw: string; layout: number; text: string }>();
    private saver?: (edits: KpiEdit[]) => Promise<void>;
    public draftChanges = 0;
    public committed = 0;
    subscribe = (key: string, listener: () => void) => {
        if (!this.listeners.has(key)) this.listeners.set(key, new Set());
        this.listeners.get(key)!.add(listener); return () => { this.listeners.get(key)?.delete(listener); };
    };
    subscribeEditor = (listener: () => void) => { this.editorListeners.add(listener); return () => { this.editorListeners.delete(listener); }; };
    getEditor = () => this.snapshot;
    getCell = (key: string) => `${this.snapshot.selected === key ? "1" : "0"}|${this.inRange(key) ? "1" : "0"}|${formatResult(this.engine.read(key))}`;
    getValue = (key: string) => formatResult(this.engine.read(key));
    raw(key: string) { const value = this.cells.get(key)?.value; return typeof value === "string" ? value : ""; }
    label(key: string) { return this.cells.get(key)?.label ?? "参照先がありません"; }
    get book() { return this.engine.book; }
    configure(book: Book, saver?: (edits: KpiEdit[]) => Promise<void>) {
        this.saver = saver;
        const overlaid: Book = { ...book, sheets: { ...book.sheets, KPI: book.sheets.KPI.map(row => row.map(cell => this.pending.has(targetKey(cell.target)) ? { ...cell, value: this.pending.get(targetKey(cell.target))! } : cell)) } };
        const nextIndex = indexBook(overlaid);
        if (nextIndex.addresses.size !== this.addressIndex.size || [...nextIndex.addresses].some(([key, location]) => {
            const previous = this.addressIndex.get(key); return !previous || previous.sheet !== location.sheet || previous.row !== location.row || previous.col !== location.col;
        })) this.layoutVersion++;
        this.addressIndex = nextIndex.addresses;
        const affected = this.engine.update(overlaid); this.cells = nextIndex.cells;
        for (const key of affected) this.emitCell(key);
        if (affected.size) {
            const patch: Partial<EditorSnapshot> = { revision: this.snapshot.revision + 1 };
            if (this.snapshot.editing && !this.draftDirty && this.snapshot.selected) {
                this.draftBook = overlaid; patch.draft = this.formulaText(this.snapshot.selected);
            }
            this.emitEditor(patch);
        }
    }
    private emitCell(key: string) { this.listeners.get(key)?.forEach(listener => listener()); }
    private emitEditor(patch: Partial<EditorSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.editorListeners.forEach(listener => listener()); }
    private emitSelection() { for (const key of this.listeners.keys()) this.emitCell(key); }
    location(key: string) { return indexBook(this.book).addresses.get(key); }
    address(key: string) { const location = this.location(key); return location ? addressText(location.sheet, location.row, location.col) : ""; }
    select(key: string, extend = false) {
        if (this.snapshot.editing) this.commit();
        this.emitEditor({ selected: key, anchor: extend ? this.snapshot.anchor ?? key : key, rangeEnd: key, editing: false, draft: this.formulaText(key) });
        this.emitSelection();
    }
    formulaText(key: string) {
        const raw = this.raw(key), cached = this.formulaTextCache.get(key);
        if (cached?.raw === raw && cached.layout === this.layoutVersion) return cached.text;
        const saved = decodeFormula(raw), text = saved ? projectFormula(saved, this.book).formula : raw;
        this.formulaTextCache.set(key, { raw, layout: this.layoutVersion, text }); return text;
    }
    begin(key: string, initial?: string, source: "cell" | "bar" = "cell") {
        if (this.snapshot.editing && this.snapshot.selected !== key) this.commit();
        const draft = initial ?? this.formulaText(key);
        if (!this.snapshot.editing) { this.draftBook = this.book; this.draftDirty = initial !== undefined; }
        this.emitEditor({ selected: key, anchor: key, rangeEnd: key, editing: true, draft, source }); this.emitSelection();
        this.cursor = { start: draft.length, end: draft.length }; this.initialReference = null;
    }
    draft(value: string, source: "cell" | "bar" = this.snapshot.source) { if (!this.snapshot.editing) this.draftBook = this.book; this.draftDirty = true; this.draftChanges++; this.emitEditor({ draft: value, editing: true, source }); this.initialReference = null; }
    setCursor(start: number, end: number) { this.cursor = { start, end }; }
    insertReference(sheet: Sheet, row: number, col: number, extend = false): boolean {
        if (!this.snapshot.editing || !isFormulaInput(this.snapshot.draft)) return false;
        const clicked = this.book.sheets[sheet][row]?.[col]; if (!clicked) return false;
        let draftBook = this.draftBook ?? this.book;
        let location = indexBook(draftBook).addresses.get(targetKey(clicked.target));
        if (!location) {
            const nextRow = draftBook.sheets[sheet].length;
            draftBook = { ...draftBook, sheets: { ...draftBook.sheets, [sheet]: [...draftBook.sheets[sheet], this.book.sheets[sheet][row]] } };
            location = { sheet, row: nextRow, col }; this.draftBook = draftBook;
        }
        const address = addressText(location.sheet, location.row, location.col);
        let { start, end } = this.cursor;
        if (extend && this.initialReference && this.insertStart !== null) { start = this.insertStart; end = this.cursor.end; }
        else { this.insertStart = start; this.initialReference = address; }
        const text = extend && this.initialReference ? `${this.initialReference}:${address}` : address;
        const draft = this.snapshot.draft.slice(0, start) + text + this.snapshot.draft.slice(end);
        this.cursor = { start: start + text.length, end: start + text.length };
        this.draftDirty = true; this.emitEditor({ draft, insertVersion: this.snapshot.insertVersion + 1 }); return true;
    }
    cursorPosition() { return this.cursor.start; }
    cancel() { this.draftBook = null; this.draftDirty = false; this.emitEditor({ editing: false, draft: this.snapshot.selected ? this.formulaText(this.snapshot.selected) : "" }); }
    deselect() { this.commit(); this.emitEditor({ selected: null, editing: false, anchor: null, rangeEnd: null }); this.emitSelection(); }
    commit() {
        const key = this.snapshot.selected; if (!key || !this.snapshot.editing) return;
        // Merely focusing/confirming legacy '=...' text is not a new formula input.
        if (!this.draftDirty) { this.cancel(); return; }
        if (this.snapshot.draft.length > 65536) { this.emitEditor({ error: "KPI入力は65536文字までです。入力内容は編集中のまま保持しています。" }); return; }
        const value = compileFormula(this.snapshot.draft, this.draftBook ?? this.book, decodeFormula(this.raw(key)));
        this.draftBook = null;
        this.draftDirty = false;
        this.emitEditor({ editing: false }); this.change(new Map([[key, value]]));
    }
    private change(values: Map<string, string>, record = true) {
        const before = new Map<string, string>();
        for (const [key, value] of values) { if (this.raw(key) === value) continue; if (this.cells.get(key)?.target.metric.startsWith("kpi_")) before.set(key, this.raw(key)); }
        const after = new Map([...values].filter(([key]) => before.has(key))); if (!after.size) return;
        if (record) { this.undoStack.push({ before, after }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack = []; }
        for (const [key, value] of after) this.pending.set(key, value);
        const book = { ...this.book, sheets: { ...this.book.sheets, KPI: this.book.sheets.KPI.map(row => row.map(cell => after.has(targetKey(cell.target)) ? { ...cell, value: after.get(targetKey(cell.target))! } : cell)) } };
        const saver = this.saver;
        this.configure(book, saver); this.committed++;
        const edits: KpiEdit[] = [...after].map(([key, value]) => { const target = this.cells.get(key)!.target; return { period: target.period, quarter: target.quarter, tableScope: target.scope, kpiSlot: Number(target.metric.slice(4)), value }; });
        this.emitEditor({ saving: true, error: "" });
        // Serialize writes: an earlier request cannot overwrite an undo or newer edit.
        this.queue = this.queue.then(async () => {
            try { await saver?.(edits); for (const [key, value] of after) if (this.pending.get(key) === value) this.pending.delete(key); }
            catch { this.emitEditor({ error: "KPIを保存できませんでした。再試行してください。" }); }
        }).then(() => this.emitEditor({ saving: this.pending.size > 0 }));
    }
    retry() {
        const edits = [...this.pending].map(([key, value]) => { const target = this.cells.get(key)?.target; return target ? { period: target.period, quarter: target.quarter, tableScope: target.scope, kpiSlot: Number(target.metric.slice(4)), value } : null; }).filter((edit): edit is KpiEdit => edit !== null);
        const saver = this.saver;
        this.queue = this.queue.then(async () => { try { await saver?.(edits); for (const edit of edits) for (const [key, value] of this.pending) if (this.cells.get(key)?.target.period === edit.period && this.cells.get(key)?.target.quarter === edit.quarter && this.cells.get(key)?.target.metric === `kpi_${edit.kpiSlot}` && value === edit.value) this.pending.delete(key); this.emitEditor({ error: "", saving: false }); } catch { /* keep recoverable pending values */ } });
    }
    undo() { this.cancel(); const entry = this.undoStack.pop(); if (entry) { this.redoStack.push(entry); this.change(entry.before, false); } }
    redo() { this.cancel(); const entry = this.redoStack.pop(); if (entry) { this.undoStack.push(entry); this.change(entry.after, false); } }
    settled() { return this.queue; }
    edit(edits: KpiEdit[]) {
        const values = new Map<string, string>();
        for (const edit of edits) {
            const cell = this.book.sheets.KPI.find(row => row[0]?.target.period === edit.period && row[0]?.target.quarter === edit.quarter)?.[edit.kpiSlot - 1];
            if (cell && cell.target.scope === edit.tableScope) values.set(targetKey(cell.target), compileFormula(edit.value, this.book));
        }
        this.change(values);
    }
    move(deltaRow: number, deltaCol: number, extend = false) {
        if (!this.snapshot.selected) return; this.commit(); const location = this.location(this.snapshot.selected); if (!location) return;
        let col = location.col + deltaCol, row = location.row + deltaRow;
        if (col > 2) { col = 0; row++; } else if (col < 0) { col = 2; row--; }
        const cell = row < (this.book.visibleKpiRows ?? this.book.sheets.KPI.length) ? this.book.sheets.KPI[row]?.[col] : undefined; if (cell) this.select(targetKey(cell.target), extend);
    }
    private bounds() {
        const start = this.snapshot.anchor && this.location(this.snapshot.anchor), end = this.snapshot.rangeEnd && this.location(this.snapshot.rangeEnd);
        if (!start || !end) return null;
        return { r0: Math.min(start.row, end.row), r1: Math.max(start.row, end.row), c0: Math.min(start.col, end.col), c1: Math.max(start.col, end.col) };
    }
    inRange(key: string) { const bounds = this.bounds(), location = this.location(key); return !!bounds && !!location && location.sheet === "KPI" && location.row >= bounds.r0 && location.row <= bounds.r1 && location.col >= bounds.c0 && location.col <= bounds.c1; }
    clipboard() {
        const bounds = this.bounds(); if (!bounds) return null;
        const rows: string[][] = []; const text: string[][] = [];
        for (let r = bounds.r0; r <= bounds.r1; r++) {
            rows.push([]); text.push([]);
            for (let c = bounds.c0; c <= bounds.c1; c++) { const key = targetKey(this.book.sheets.KPI[r][c].target); rows[rows.length - 1].push(this.raw(key)); text[text.length - 1].push(this.formulaText(key)); }
        }
        const escape = (value: string) => /[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        return { text: text.map(row => row.map(escape).join("\t")).join("\n"), custom: JSON.stringify({ version: 1, ticker: this.book.sheets.KPI[0]?.[0]?.target.ticker, anchor: this.book.sheets.KPI[bounds.r0][bounds.c0].target, row: bounds.r0, col: bounds.c0, rows }) };
    }
    paste(rows: string[][], custom?: string) {
        if (!this.snapshot.selected) return;
        const location = this.location(this.snapshot.selected); if (!location) return;
        let source: { ticker?: string; anchor?: Target; row: number; col: number; rows: string[][] } | null = null;
        try {
            const parsed = custom && custom.length <= 2_000_000 ? JSON.parse(custom) : null;
            if (parsed?.version === 1 && parsed.ticker === this.book.sheets.KPI[0]?.[0]?.target.ticker && Number.isInteger(parsed.row) && Number.isInteger(parsed.col) && Array.isArray(parsed.rows) && parsed.rows.every((row: unknown) => Array.isArray(row) && row.every(value => typeof value === "string" && value.length <= 65536))) source = parsed;
        } catch { /* plain TSV */ }
        const sourceLocation = source?.anchor ? indexBook(this.book).addresses.get(targetKey(source.anchor)) : null;
        const edits = new Map<string, string>();
        const input = source?.rows ?? rows;
        if (input.length * Math.max(0, ...input.map(row => row.length)) > 2048) { this.emitEditor({ error: "貼り付けは一度に2048セルまでです。" }); return; }
        input.forEach((row, r) => row.forEach((value, c) => {
            if (location.row + r >= (this.book.visibleKpiRows ?? this.book.sheets.KPI.length)) return;
            const cell = this.book.sheets.KPI[location.row + r]?.[location.col + c]; if (!cell) return;
            const copied = source ? copyFormula(value, this.book, location.row - (sourceLocation?.row ?? source.row), location.col - (sourceLocation?.col ?? source.col)) : compileFormula(value, this.book);
            edits.set(targetKey(cell.target), copied);
        }));
        this.cancel(); this.change(edits);
    }
    clear() {
        const bounds = this.bounds(); if (!bounds) return;
        const edits = new Map<string, string>();
        for (let r = bounds.r0; r <= bounds.r1; r++) for (let c = bounds.c0; c <= bounds.c1; c++) edits.set(targetKey(this.book.sheets.KPI[r][c].target), "");
        this.change(edits);
    }
    referenceLabels() {
        const key = this.snapshot.selected; if (!key) return [];
        const saved = decodeFormula(this.raw(key)); if (!saved) return [];
        return projectFormula(saved, this.book).bindings.map(binding => ({ address: binding.text, labels: binding.targets.map(target => { const cell = this.cells.get(targetKey(target)); return cell ? `${cell.label}（${cell.unit}）` : `${target.period} ${target.quarter} ${target.metric}：参照先不存在`; }) }));
    }
}
