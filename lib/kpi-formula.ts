/** Deliberately small spreadsheet language. Stored strings are never executable code. */
export type Sheet = "CUM" | "Q" | "FY" | "KPI";
export interface Target {
    ticker: string; period: string; quarter: string; scope: "cum" | "q";
    kind: "actual" | "forecast"; basis: string; metric: string;
}
export interface ReferenceCell { target: Target; value: number | string | null; label: string; unit: string }
export interface Book { sheets: Record<Sheet, ReferenceCell[][]>; visibleKpiRows?: number }
export const targetKey = (target: Target) => JSON.stringify(target);
export interface Binding { text: string; targets: Target[] }
export interface Formula { version: 1; formula: string; bindings: Binding[] }
const PREFIX = "\u001ecompany-kpi-formula-v1:";
/** Japanese IME can enter a fullwidth equals sign at the start of a formula. */
export const isFormulaInput = (input: string) => input.startsWith("=") || input.startsWith("＝");
const normalizeFormulaInput = (input: string) => input.startsWith("＝") ? `=${input.slice(1)}` : input;
export const encodeFormula = (formula: Formula) => PREFIX + JSON.stringify(formula);
export function decodeFormula(value: string): Formula | null {
    if (!value.startsWith(PREFIX)) return null;
    if (value.length > 1_000_000) return null;
    try {
        const parsed = JSON.parse(value.slice(PREFIX.length));
        if (parsed.version !== 1 || typeof parsed.formula !== "string" || !Array.isArray(parsed.bindings)) return null;
        if (parsed.formula.length > 65536 || parsed.bindings.length > 2048) return null;
        let targetCount = 0;
        for (const binding of parsed.bindings) {
            if (typeof binding.text !== "string" || !Array.isArray(binding.targets) || binding.targets.length > 2048) return null;
            targetCount += binding.targets.length; if (targetCount > 8192) return null;
            for (const target of binding.targets) {
                if (!["ticker", "period", "quarter", "scope", "kind", "basis", "metric"].every(key => typeof target[key] === "string")) return null;
            }
        }
        return parsed;
    } catch { return null; }
}
export type ErrorCode = "#DIV/0!" | "#REF!" | "#NAME?" | "#CYCLE!" | "#N/A" | "#VALUE!" | "#NUM!";
export class FormulaError extends Error { constructor(public code: ErrorCode) { super(code); } }
const fail = (code: ErrorCode): never => { throw new FormulaError(code); };
interface Address { sheet: Sheet; col: number; row: number; fixedCol: boolean; fixedRow: boolean }
export function parseAddress(text: string): Address | null {
    const match = /^(?:(CUM|Q|FY|KPI)!)?(\$?)([A-Z]{1,2})(\$?)([1-9]\d{0,5})$/i.exec(text);
    if (!match) return null;
    let col = 0;
    for (const letter of match[3].toUpperCase()) col = col * 26 + letter.charCodeAt(0) - 64;
    return { sheet: (match[1]?.toUpperCase() || "KPI") as Sheet, col: col - 1, row: Number(match[5]) - 1, fixedCol: !!match[2], fixedRow: !!match[4] };
}
export function addressText(sheet: Sheet, row: number, col: number, fixedCol = false, fixedRow = false): string {
    if (row < 0 || col < 0 || col > 25 || row > 999998) return "MISSING!A1";
    return `${sheet}!${fixedCol ? "$" : ""}${String.fromCharCode(65 + col)}${fixedRow ? "$" : ""}${row + 1}`;
}
const bookIndexes = new WeakMap<Book, { cells: Map<string, ReferenceCell>; addresses: Map<string, { sheet: Sheet; row: number; col: number }> }>();
export function indexBook(book: Book) {
    const cached = bookIndexes.get(book); if (cached) return cached;
    const cells = new Map<string, ReferenceCell>();
    const addresses = new Map<string, { sheet: Sheet; row: number; col: number }>();
    for (const sheet of Object.keys(book.sheets) as Sheet[]) book.sheets[sheet].forEach((row, r) => row.forEach((cell, c) => {
        cells.set(targetKey(cell.target), cell); addresses.set(targetKey(cell.target), { sheet, row: r, col: c });
    }));
    const index = { cells, addresses }; bookIndexes.set(book, index); return index;
}
type Node = { type: "literal"; value: number | string | boolean } | { type: "ref"; text: string } |
    { type: "unary"; op: string; arg: Node } | { type: "binary"; op: string; left: Node; right: Node } |
    { type: "call"; name: string; args: Node[] };
interface Token { text: string; kind: string }
function tokenize(input: string): Token[] {
    if (!input.startsWith("=") || input.length > 8192) return fail("#VALUE!");
    const tokens: Token[] = []; let rest = input.slice(1);
    while (rest.length) {
        const space = /^\s+/.exec(rest); if (space) { rest = rest.slice(space[0].length); continue; }
        const ref = /^(?:(?:CUM|Q|FY|KPI|MISSING)!)?\$?[A-Z]{1,2}\$?[1-9]\d{0,5}(?::(?:(?:CUM|Q|FY|KPI|MISSING)!)?\$?[A-Z]{1,2}\$?[1-9]\d{0,5})?(?![\w.])/i.exec(rest);
        const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
        const string = /^"(?:[^"]|"")*"/.exec(rest);
        const word = /^[A-Za-z_][A-Za-z_\d.]*/.exec(rest);
        const operator = /^(?:<=|>=|<>|[+\-*/%(),=<>])/.exec(rest);
        const selected = ref || number || string || word || operator;
        if (!selected || tokens.length > 4096) return fail("#VALUE!");
        tokens.push({ text: selected[0], kind: ref ? "ref" : number ? "number" : string ? "string" : word ? "word" : "op" });
        rest = rest.slice(selected[0].length);
    }
    return tokens;
}
export function parseFormula(input: string): { root: Node; references: string[] } {
    const tokens = tokenize(input); let pos = 0, depth = 0; const references: string[] = [];
    const peek = () => tokens[pos]?.text;
    const expression = (minimum = 0): Node => {
        if (++depth > 64) return fail("#VALUE!");
        const token = tokens[pos++]; if (!token) return fail("#VALUE!");
        let node: Node;
        if (token.kind === "number") node = { type: "literal", value: Number(token.text) };
        else if (token.kind === "string") node = { type: "literal", value: token.text.slice(1, -1).replace(/""/g, '"') };
        else if (token.kind === "ref") { references.push(token.text.toUpperCase()); node = { type: "ref", text: token.text.toUpperCase() }; }
        else if (token.text === "+" || token.text === "-") node = { type: "unary", op: token.text, arg: expression(4) };
        else if (token.text === "(") { node = expression(); if (tokens[pos++]?.text !== ")") return fail("#VALUE!"); }
        else if (token.kind === "word") {
            const name = token.text.toUpperCase();
            if (name === "TRUE" || name === "FALSE") node = { type: "literal", value: name === "TRUE" };
            else {
                if (tokens[pos++]?.text !== "(") return fail("#NAME?");
                const args: Node[] = [];
                if (peek() !== ")") { do { args.push(expression()); if (peek() !== ",") break; pos++; } while (true); }
                if (tokens[pos++]?.text !== ")") return fail("#VALUE!");
                node = { type: "call", name, args };
            }
        } else return fail("#VALUE!");
        while (true) {
            if (peek() === "%") { pos++; node = { type: "unary", op: "%", arg: node }; continue; }
            const op = peek(); const priority = op && ({ "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3 } as Record<string, number>)[op];
            if (!op || !priority || priority < minimum) break;
            pos++; node = { type: "binary", op, left: node, right: expression(priority + 1) };
        }
        depth--; return node;
    };
    const root = expression(); if (pos !== tokens.length) return fail("#VALUE!");
    return { root, references };
}
function bind(text: string, book: Book): Target[] {
    const [from, to] = text.split(":"); const start = parseAddress(from); if (!start) return [];
    const end = to ? parseAddress(to.includes("!") ? to : `${start.sheet}!${to}`) : start;
    if (!end || end.sheet !== start.sheet) return [];
    const size = (Math.abs(end.row - start.row) + 1) * (Math.abs(end.col - start.col) + 1);
    if (size > 2048) return [];
    const targets: Target[] = [];
    const rowStep = start.row <= end.row ? 1 : -1, colStep = start.col <= end.col ? 1 : -1;
    for (let row = start.row; row !== end.row + rowStep; row += rowStep) {
        for (let col = start.col; col !== end.col + colStep; col += colStep) {
            const cell = book.sheets[start.sheet][row]?.[col]; if (!cell) return [];
            targets.push(cell.target);
        }
    }
    return targets;
}
/** Invalid formulas are still saved, and produce a local cell error until edited. */
export function compileFormula(input: string, book: Book, previous?: Formula | null): string {
    if (!isFormulaInput(input)) return input;
    input = normalizeFormulaInput(input);
    let references: string[] = [];
    try { references = parseFormula(input).references; } catch { /* error displayed by evaluator */ }
    const prior = previous ? projectFormula(previous, book) : null;
    let count = 0;
    return encodeFormula({ version: 1, formula: input, bindings: [...new Set(references)].map(text => ({
        text, targets: prior?.bindings.find(binding => binding.text === text)?.targets ?? bind(text, book),
    })).map(binding => { count += binding.targets.length; return count <= 8192 ? binding : { ...binding, targets: [] }; }) });
}
/** Reproject visible A1 addresses after inserted/reordered periods, without rewriting persisted data. */
export function projectFormula(formula: Formula, book: Book): Formula {
    const { addresses } = indexBook(book); const replacements = new Map<string, string>();
    const bindings = formula.bindings.map((binding, bindingIndex) => {
        const [first, last] = binding.text.split(":"); const start = parseAddress(first);
        const finish = last ? parseAddress(last.includes("!") ? last : `${start?.sheet}!${last}`) : start;
        const locations = binding.targets.map(target => addresses.get(targetKey(target)));
        let text = binding.text;
        if (locations.length && locations.every(Boolean) && start && finish) {
            const a = locations[0]!, b = locations[locations.length - 1]!;
            text = addressText(a.sheet, a.row, a.col, start.fixedCol, start.fixedRow);
            if (last) text += ":" + addressText(b.sheet, b.row, b.col, finish.fixedCol, finish.fixedRow);
        } else text = `MISSING!A${bindingIndex + 1}`;
        replacements.set(binding.text, text); return { ...binding, text };
    });
    let tokens: Token[]; try { tokens = tokenize(formula.formula); } catch { return formula; }
    // Preserve all original whitespace, punctuation, constants and string literals.
    let offset = 1, rendered = "=";
    for (const token of tokens) {
        const at = formula.formula.indexOf(token.text, offset);
        rendered += formula.formula.slice(offset, at) + (token.kind === "ref" ? replacements.get(token.text.toUpperCase()) ?? token.text : token.text);
        offset = at + token.text.length;
    }
    return { ...formula, formula: rendered + formula.formula.slice(offset), bindings };
}
export function copyFormula(value: string, book: Book, rowDelta: number, colDelta: number): string {
    const saved = decodeFormula(value); if (!saved) return value;
    const projected = projectFormula(saved, book); let tokens: Token[];
    try { tokens = tokenize(projected.formula); } catch { return value; }
    let offset = 1, result = "=";
    for (const token of tokens) {
        const at = projected.formula.indexOf(token.text, offset); let text = token.text;
        if (token.kind === "ref") {
            const parts = token.text.split(":"); const first = parseAddress(parts[0]);
            text = parts.map(part => {
                const address = parseAddress(part.includes("!") ? part : `${first?.sheet ?? "KPI"}!${part}`);
                return address ? addressText(address.sheet, address.row + (address.fixedRow ? 0 : rowDelta), address.col + (address.fixedCol ? 0 : colDelta), address.fixedCol, address.fixedRow) : part;
            }).join(":");
        }
        result += projected.formula.slice(offset, at) + text; offset = at + token.text.length;
    }
    return compileFormula(result + projected.formula.slice(offset), book);
}
export type Result = number | string | boolean;
function numeric(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value === null || value === undefined || value === "") return fail("#N/A");
    if (typeof value === "string" && /^[-+]?(?:\d+\.?\d*|\.\d+)%?$/.test(value.trim())) {
        const percent = value.trim().endsWith("%"); const number = Number(value.trim().replace(/%$/, ""));
        if (Number.isFinite(number)) return percent ? number / 100 : number;
    }
    return fail("#VALUE!");
}
function evaluate(root: Node, resolve: (text: string) => unknown): unknown {
    if (root.type === "literal") return root.value;
    if (root.type === "ref") return resolve(root.text);
    if (root.type === "unary") { const n = numeric(evaluate(root.arg, resolve)); return root.op === "%" ? n / 100 : root.op === "-" ? -n : n; }
    if (root.type === "binary") {
        const left = numeric(evaluate(root.left, resolve)), right = numeric(evaluate(root.right, resolve));
        switch (root.op) {
            case "+": return left + right; case "-": return left - right; case "*": return left * right;
            case "/": return right === 0 ? fail("#DIV/0!") : left / right;
            case "=": return left === right; case "<>": return left !== right; case "<": return left < right;
            case ">": return left > right; case "<=": return left <= right; case ">=": return left >= right;
        }
    }
    if (root.type === "call") {
        const { name, args } = root;
        if (name === "IF") {
            if (args.length !== 3) return fail("#VALUE!");
            const condition = evaluate(args[0], resolve);
            const truth = typeof condition === "boolean" ? condition : numeric(condition) !== 0;
            return evaluate(args[truth ? 1 : 2], resolve);
        }
        if (name === "ROUND") {
            if (args.length !== 2) return fail("#VALUE!");
            const value = numeric(evaluate(args[0], resolve)), digits = numeric(evaluate(args[1], resolve));
            if (!Number.isInteger(digits) || Math.abs(digits) > 15) return fail("#NUM!");
            const scale = 10 ** digits;
            return Math.sign(value) * Math.round(Math.abs(value) * scale + Number.EPSILON * Math.abs(value * scale)) / scale;
        }
        if (name === "SUM" || name === "AVERAGE") {
            if (!args.length) return fail("#VALUE!");
            const values = args.flatMap(arg => { const value = evaluate(arg, resolve); return Array.isArray(value) ? value : [value]; }).map(numeric);
            const sum = values.reduce((total, value) => total + value, 0);
            return name === "SUM" ? sum : sum / values.length;
        }
        return fail("#NAME?");
    }
    return fail("#VALUE!");
}
/** Persistent dependency graph + cache. Only changed cells and their dependents are evaluated. */
export class FormulaEngine {
    private cells = new Map<string, ReferenceCell>();
    private formulas = new Map<string, { saved: Formula; root?: Node; error?: ErrorCode }>();
    private dependencies = new Map<string, Set<string>>();
    private dependents = new Map<string, Set<string>>();
    private cache = new Map<string, Result>();
    public evaluated = 0;
    public lastCalculationMs = 0;
    public book: Book = { sheets: { CUM: [], Q: [], FY: [], KPI: [] } };
    update(book: Book): Set<string> {
        this.book = book; const next = indexBook(book).cells; const changed = new Set<string>();
        for (const [key, cell] of next) if (cell.value !== this.cells.get(key)?.value) changed.add(key);
        for (const key of this.cells.keys()) if (!next.has(key)) changed.add(key);
        this.cells = next;
        for (const key of changed) {
            for (const dep of this.dependencies.get(key) ?? []) this.dependents.get(dep)?.delete(key);
            this.dependencies.delete(key); this.formulas.delete(key);
            const value = this.cells.get(key)?.value;
            const saved = typeof value === "string" ? decodeFormula(value) : null;
            if (!saved) continue;
            let root: Node | undefined, error: ErrorCode | undefined;
            try { root = parseFormula(saved.formula).root; } catch (err) { error = err instanceof FormulaError ? err.code : "#VALUE!"; }
            this.formulas.set(key, { saved, root, error });
            const deps = new Set(saved.bindings.flatMap(binding => binding.targets.map(targetKey)));
            this.dependencies.set(key, deps);
            for (const dep of deps) { if (!this.dependents.has(dep)) this.dependents.set(dep, new Set()); this.dependents.get(dep)!.add(key); }
        }
        const affected = new Set(changed), queue = [...changed];
        for (let i = 0; i < queue.length; i++) for (const key of this.dependents.get(queue[i]) ?? []) if (!affected.has(key)) { affected.add(key); queue.push(key); }
        for (const key of affected) this.cache.delete(key);
        this.evaluated = 0; const start = performance.now();
        for (const key of affected) if (this.cells.has(key)) this.read(key);
        this.lastCalculationMs = performance.now() - start;
        return affected;
    }
    read(key: string, visiting = new Set<string>()): Result {
        if (this.cache.has(key)) return this.cache.get(key)!;
        if (visiting.has(key)) return "#CYCLE!";
        const cell = this.cells.get(key); if (!cell) return "#REF!";
        const formula = this.formulas.get(key);
        if (!formula) return cell.value === null ? "#N/A" : cell.value;
        this.evaluated++; visiting.add(key);
        let result: Result;
        try {
            if (formula.error) fail(formula.error);
            const value = evaluate(formula.root!, text => {
                const binding = formula.saved.bindings.find(item => item.text === text);
                if (!binding?.targets.length) return fail("#REF!");
                const values = binding.targets.map(target => {
                    if (target.ticker !== cell.target.ticker) return fail("#REF!");
                    const value = this.read(targetKey(target), visiting);
                    if (typeof value === "string" && /^#(?:DIV|REF|NAME|CYCLE|N\/A|VALUE|NUM)/.test(value)) return fail(value as ErrorCode);
                    if (value === "") return fail("#N/A");
                    return value;
                });
                return text.includes(":") ? values : values[0];
            });
            result = typeof value === "number" ? Number.isFinite(value) ? value : "#NUM!" : typeof value === "string" || typeof value === "boolean" ? value : "#VALUE!";
        } catch (err) { result = err instanceof FormulaError ? err.code : "#VALUE!"; }
        visiting.delete(key); this.cache.set(key, result); return result;
    }
}
const resultFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 12, useGrouping: false });
export function formatResult(value: Result): string {
    return typeof value === "number" ? resultFormatter.format(Number(value.toPrecision(12))) : typeof value === "boolean" ? value ? "TRUE" : "FALSE" : value;
}
