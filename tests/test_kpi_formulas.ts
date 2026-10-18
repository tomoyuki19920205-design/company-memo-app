import assert from "node:assert/strict";
import test from "node:test";
import { compileFormula, copyFormula, decodeFormula, encodeFormula, FormulaEngine, projectFormula, targetKey, type Book } from "../lib/kpi-formula";
import { buildKpiBook } from "../lib/kpi-reference-book";
import { KpiEditorStore } from "../lib/kpi-editor-store";
import type { FinancialRecord } from "../types/financial";

const record = (period = "2026-03-31", quarter = "1Q", extra: Partial<FinancialRecord> = {}): FinancialRecord => ({ ticker: "TEST", period, quarter, sales: 123.456789, gross_profit: 50, operating_profit: 10, ordinary_profit: null, profit_before_tax: null, net_income: 5, eps: 12.345, source: "xbrl", updated_at: "", consolidation_scope: "non_consolidated", ...extra });
const book = () => buildKpiBook("TEST", [record(), record("2026-03-31", "2Q", { sales: 200, operating_profit: 20 })], {});
const formulaBook = (base: Book, values: string[]): Book => ({ sheets: { ...base.sheets, KPI: base.sheets.KPI.map((row, r) => row.map((cell, c) => ({ ...cell, value: values[r * 3 + c] ?? cell.value }))) } });
const result = (input: string, base = book()) => { const engine = new FormulaEngine(); engine.update(formulaBook(base, [compileFormula(input, base)])); return engine.read(targetKey(base.sheets.KPI[0][0].target)); };
for (const [formula, expected] of [
    ["=1+2*3", 7], ["=(1+2)*3", 9], ["=-2.5+0.5", -2], ["=10%*200", 20], ["=SUM(1,2,3)", 6], ["=AVERAGE(2,4)", 3],
    ["=IF(1>0,42,1/0)", 42], ["=IF(FALSE,1/0,0)", 0], ["=ROUND(-1.25,1)", -1.3], ["=ROUND(125,-1)", 130],
    ["=ROUND(1.005,2)", 1.01], ["=SUM(CUM!A1:CUM!A2)", 323.456789], ["=CUM!A1", 123.456789], ["=CUM!H1", 12.345],
    ["=Q!A2", 76.543211], ["=CUM!C1", 50 / 123.456789], ["=1/0", "#DIV/0!"], ["=NOPE(1)", "#NAME?"],
    ["=KPI!Z1", "#REF!"], ["=KPI!A1", "#CYCLE!"], ["=SUM(Q!G1:Q!H1)", "#N/A"], ["=1+", "#VALUE!"], ["=ROUND(1,100)", "#NUM!"],
] as [string, number | string][]) test(`formula ${formula}`, () => assert.equal(result(formula), expected));

test("legacy text, including =1+2, is not reinterpreted; new ordinary numbers/text remain unchanged", () => {
    const base = book(), engine = new FormulaEngine(); engine.update(formulaBook(base, ["=1+2", "0", "赤字メモ"]));
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), "=1+2");
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][1].target)), "0");
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][2].target)), "赤字メモ");
    assert.equal(decodeFormula("=1+2"), null);
});
test("fullwidth IME equals compiles reference-free formulas without reinterpreting untouched legacy text", async () => {
    const base = book(), key = targetKey(base.sheets.KPI[0][0].target);
    const raw = compileFormula("＝1/2", base);
    assert.equal(decodeFormula(raw)?.formula, "=1/2");
    assert.deepEqual(decodeFormula(raw)?.bindings, []);
    const engine = new FormulaEngine(); engine.update(formulaBook(base, [raw]));
    assert.equal(engine.read(key), 0.5);

    const legacy = formulaBook(base, ["＝2/1"]), store = new KpiEditorStore();
    let saves = 0; store.configure(legacy, async () => { saves++; });
    store.select(key); store.begin(key, undefined, "bar"); store.commit(); await store.settled();
    assert.equal(store.raw(key), "＝2/1"); assert.equal(saves, 0);
    store.begin(key, undefined, "bar"); store.draft("＝2/1", "bar"); store.commit(); await store.settled();
    assert.equal(store.raw(key).startsWith("＝"), false);
    assert.equal(store.formulaText(key), "=2/1"); assert.equal(store.getValue(key), "2"); assert.equal(saves, 1);
});
test("0, negatives, missing fields and error recovery remain distinct", () => {
    const base = buildKpiBook("TEST", [record("2026-03-31", "1Q", { sales: 0, operating_profit: -1, gross_profit: null })], {});
    assert.equal(result("=CUM!A1", base), 0); assert.equal(result("=CUM!E1", base), -1);
    assert.equal(result("=CUM!B1", base), "#N/A"); assert.equal(result("=CUM!E1/CUM!A1", base), "#DIV/0!");
    const engine = new FormulaEngine(); engine.update(formulaBook(base, [compileFormula("=1/0", base)]));
    engine.update(formulaBook(base, [compileFormula("=42", base)])); assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), 42);
});
test("saved reference identity survives sorting, fiscal row insertion, header renaming, reload and actual updates", () => {
    const base = book(); const raw = compileFormula("=CUM!A1+KPI!B1", base);
    const loaded = decodeFormula(JSON.parse(JSON.stringify(raw)))!;
    assert.equal(loaded.bindings[0].targets[0].period, "2026-03-31");
    assert.equal(loaded.bindings[0].targets[0].basis, "non_consolidated");
    const next = buildKpiBook("TEST", [record("2025-03-31"), record("2026-03-31", "2Q"), record("2026-03-31", "1Q", { sales: 9 })], {
        "cum|2026-03-31|1Q": { 1: raw, 2: "10" },
    });
    const engine = new FormulaEngine(); engine.update(next);
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), 19);
    const projected = projectFormula(loaded, next);
    assert.equal(projected.formula, "=CUM!A2+KPI!B2");
    const recompiled = decodeFormula(compileFormula(projected.formula + "+1", next, loaded))!;
    assert.deepEqual(recompiled.bindings[0].targets, loaded.bindings[0].targets);
    assert.equal(result("=FY!A1", base), "#REF!");
});
test("profit subject/basis and cumulative/standalone/forecast identities cannot be substituted", () => {
    const bank = buildKpiBook("TEST", [record("2026-03-31", "1Q", { operating_profit: null, ordinary_profit: 7 })], {}, "銀行業");
    const formula = compileFormula("=CUM!E1", bank), target = bank.sheets.CUM[0][4].target;
    assert.equal(target.metric, "ordinary_profit"); assert.equal(result("=CUM!E1", bank), 7);
    const changed = buildKpiBook("TEST", [record()], { "cum|2026-03-31|1Q": { 1: formula } }, "銀行業");
    const engine = new FormulaEngine(); engine.update(changed);
    assert.equal(engine.read(targetKey(changed.sheets.KPI[0][0].target)), "#REF!");
    const consolidated = buildKpiBook("TEST", [record("2026-03-31", "1Q", { consolidation_scope: "consolidated", operating_profit: null, ordinary_profit: 7 })], { "cum|2026-03-31|1Q": { 1: formula } }, "銀行業");
    engine.update(consolidated); assert.equal(engine.read(targetKey(consolidated.sheets.KPI[0][0].target)), "#REF!");
    const forecast = buildKpiBook("TEST", [record(), record("2027-03-31", "FY", { source: "tdnet_forecast", sales: 500 })], {});
    assert.equal(forecast.sheets.FY[0]?.[0]?.target.kind, "forecast");
});
test("IFRS uses the displayed PBT subject and standalone same-subject math", () => {
    const base = buildKpiBook("8473", [record("2026-03-31", "1Q", { ticker: "8473", operating_profit: 100, profit_before_tax: 8 }), record("2026-03-31", "2Q", { ticker: "8473", operating_profit: 100, profit_before_tax: 20 })], {}, "その他金融業");
    assert.equal(base.sheets.CUM[0][4].target.metric, "profit_before_tax");
    assert.equal(base.sheets.Q[1][4].value, 12);
});
test("relative, column-fixed, row-fixed and fully-fixed copy binding semantics", () => {
    const base = book(); const saved = compileFormula("=SUM(CUM!A1:CUM!A2)+KPI!$B1+KPI!B$1+KPI!$B$1", base);
    const copied = decodeFormula(copyFormula(saved, base, 1, 1))!;
    assert.equal(copied.formula, "=SUM(CUM!B2:CUM!B3)+KPI!$B2+KPI!C$1+KPI!$B$1");
    assert.equal(copied.bindings[1].targets[0].metric, "kpi_2");
    assert.equal(copied.bindings[1].targets[0].quarter, "2Q");
    assert.equal(copied.bindings[2].targets[0].metric, "kpi_3");
    assert.equal(copied.bindings[2].targets[0].quarter, "1Q");
});
test("KPI dependency changes are incremental; a 500-formula sibling set is not recalculated", () => {
    const base = book(); const raw = [compileFormula("=KPI!B1*2", base), "5", compileFormula("=123", base), compileFormula("=KPI!A1+1", base)];
    const engine = new FormulaEngine(); engine.update(formulaBook(base, raw));
    assert.equal(engine.read(targetKey(base.sheets.KPI[1][0].target)), 11);
    raw[1] = "10"; engine.update(formulaBook(base, raw));
    assert.equal(engine.evaluated, 2); assert.equal(engine.read(targetKey(base.sheets.KPI[1][0].target)), 21);
    engine.update(formulaBook(base, raw)); assert.equal(engine.evaluated, 0);
    const large: Book = { sheets: { CUM: [], Q: [], FY: [], PCUM: [], PQ: [], KPI: Array.from({ length: 167 }, (_, r) => base.sheets.KPI[0].map((cell, c) => ({ ...cell, target: { ...cell.target, period: `period-${r}` }, value: c === 0 && r === 0 ? "1" : compileFormula("=1+2", base) }))) } };
    engine.update(large); assert.equal(engine.evaluated, 500);
    engine.update({ sheets: { ...large.sheets, KPI: large.sheets.KPI.map((row, r) => row.map((cell, c) => r === 0 && c === 0 ? { ...cell, value: "2" } : cell)) } }); assert.equal(engine.evaluated, 0);
});
test("multi-cell paste is one save/undo, redo and cancellation preserve exact raw values", async () => {
    const store = new KpiEditorStore(); const saves: unknown[] = []; store.configure(book(), async edits => { saves.push(edits); });
    const key = targetKey(store.book.sheets.KPI[0][0].target); store.select(key);
    store.paste([["0", "=1+2", "テキスト"], ["-5", "=SUM(KPI!A1:KPI!A2)"]]);
    await store.settled(); assert.equal(saves.length, 1); assert.equal((saves[0] as unknown[]).length, 5);
    assert.equal(store.getValue(targetKey(store.book.sheets.KPI[0][1].target)), "3");
    store.undo(); await store.settled(); assert.equal(store.raw(key), "");
    store.redo(); await store.settled(); assert.equal(store.raw(key), "0");
    store.begin(key); store.draft("=99"); store.cancel(); assert.equal(store.raw(key), "0");
    const clipboard = store.clipboard()!; store.select(targetKey(store.book.sheets.KPI[1][0].target)); store.paste([["unused"]], clipboard.custom); await store.settled(); assert.equal(store.raw(targetKey(store.book.sheets.KPI[1][0].target)), "0");
});
test("draft keystrokes do not notify cell subscribers or recalculate formulas", () => {
    const store = new KpiEditorStore(); store.configure(book()); const key = targetKey(store.book.sheets.KPI[0][0].target); store.begin(key);
    let notifications = 0; store.subscribe(key, () => notifications++);
    store.draft("=1"); store.draft("=1+2"); assert.equal(notifications, 0); assert.equal(store.engine.evaluated, 0);
    store.setCursor(4, 4); store.insertReference("CUM", 0, 0); assert.equal(store.getEditor().draft, "=1+2CUM!A1");
});
test("cycles across several KPI cells recover when one source is replaced", () => {
    const base = book(), engine = new FormulaEngine();
    engine.update(formulaBook(base, [compileFormula("=KPI!B1", base), compileFormula("=KPI!A1", base)]));
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), "#CYCLE!");
    engine.update(formulaBook(base, [compileFormula("=KPI!B1", base), "-3"]));
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), "-3");
});
test("bounded parser and persisted metadata cannot execute JS or use another ticker", () => {
    assert.equal(result("=globalThis.alert(1)"), "#NAME?");
    assert.equal(result("=" + "(".repeat(70) + "1" + ")".repeat(70)), "#VALUE!");
    const base = book(), saved = decodeFormula(compileFormula("=CUM!A1", base))!;
    saved.bindings[0].targets[0] = { ...saved.bindings[0].targets[0], ticker: "OTHER" };
    const engine = new FormulaEngine(); engine.update(formulaBook(base, [encodeFormula(saved)])); assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), "#REF!");
});
test("unchanged legacy equals text stays literal on focus/Enter and undo", async () => {
    const store = new KpiEditorStore(), base = formulaBook(book(), ["=1+2"]); let saved = 0;
    store.configure(base, async () => { saved++; }); const key = targetKey(base.sheets.KPI[0][0].target);
    store.begin(key); store.commit(); await store.settled(); assert.equal(saved, 0); assert.equal(store.raw(key), "=1+2");
    store.begin(key); store.draft("=1+3"); store.commit(); await store.settled(); assert.equal(store.getValue(key), "4");
    store.undo(); await store.settled(); assert.equal(store.raw(key), "=1+2"); assert.equal(store.getValue(key), "=1+2");
});
test("saved PL reference remains valid when the sixth FY pushes its period off-screen", () => {
    const data = Array.from({ length: 5 }, (_, i) => record(`${2021 + i}-03-31`));
    const base = buildKpiBook("TEST", data, {}), raw = compileFormula("=CUM!A1", base);
    const next = buildKpiBook("TEST", [...data, record("2026-03-31")], { "cum|2025-03-31|1Q": { 1: raw } });
    assert.equal(next.visibleKpiRows, 5); assert.equal(next.sheets.CUM.length, 6);
    const engine = new FormulaEngine(); engine.update(next);
    assert.equal(engine.read(targetKey(next.sheets.KPI[3][0].target)), 123.456789);
    assert.equal(projectFormula(decodeFormula(raw)!, next).formula, "=CUM!A6");
});
test("decreasing range endpoints retain their exact targets and $ constraints", () => {
    const base = book(), raw = compileFormula("=SUM(CUM!$A2:CUM!A$1)", base);
    assert.equal(projectFormula(decodeFormula(raw)!, base).formula, "=SUM(CUM!$A2:CUM!A$1)");
    assert.equal(result("=SUM(CUM!A2:CUM!A1)", base), 323.456789);
});
test("missing KPI and a percent text cell differ from numeric zero", () => {
    const base = formulaBook(book(), ["", "0", "2.41%"]);
    assert.equal(result("=KPI!C1*100", base), 2.41); assert.equal(result("=KPI!B1+1", base), 1);
    const engine = new FormulaEngine(); const next = formulaBook(base, [compileFormula("=KPI!A2", base), "0", "2.41%"]); engine.update(next);
    assert.equal(engine.read(targetKey(base.sheets.KPI[0][0].target)), "#N/A");
});
test("save failure keeps a retryable draft value; a retry and subsequent queued undo preserve order", async () => {
    const store = new KpiEditorStore(); let failed = true; const writes: string[] = [];
    store.configure(book(), async edits => { if (failed) throw new Error("offline"); writes.push(edits[0].value); });
    const key = targetKey(store.book.sheets.KPI[0][0].target); store.begin(key); store.draft("42"); store.commit(); await store.settled();
    assert.equal(store.raw(key), "42"); assert.ok(store.getEditor().error); failed = false; store.retry(); await store.settled();
    assert.equal(store.getEditor().error, ""); store.undo(); store.redo(); await store.settled(); assert.deepEqual(writes, ["42", "", "42"]);
});
test("a fiscal row arriving during an edit does not rebind the in-flight draft", () => {
    const store = new KpiEditorStore(), original = book(); store.configure(original);
    const key = targetKey(original.sheets.KPI[0][0].target); store.begin(key); store.draft("=CUM!A1");
    store.configure(buildKpiBook("TEST", [record("2025-03-31", "1Q", { sales: 999 }), record(), record("2026-03-31", "2Q", { sales: 200 })], {}));
    store.commit(); assert.equal(store.getValue(key), "123.456789");
    assert.equal(decodeFormula(store.raw(key))!.bindings[0].targets[0].period, "2026-03-31");
});
test("an untouched editor opened before async KPI loading cannot clear the arriving saved value", async () => {
    const store = new KpiEditorStore(); let saves = 0; const saver = async () => { saves++; };
    store.configure(book(), saver); const key = targetKey(store.book.sheets.KPI[0][0].target); store.begin(key);
    store.configure(formulaBook(book(), ["17243"]), saver);
    assert.equal(store.getEditor().draft, "17243"); store.commit(); await store.settled();
    assert.equal(saves, 0); assert.equal(store.raw(key), "17243");
});

test("both PL bottom memo grids evaluate formulas, keep legacy strings, and use the saved Q column offset", async () => {
    const base = buildKpiBook("TEST", [record()], { "cum|2026-03-31|1Q": { 1: "7" } }, undefined,
        { pl_cum: [["=100+200"]], pl_q: [["", "", "既存メモ"]] });
    const edits: unknown[] = []; const store = new KpiEditorStore();
    store.configure(base, undefined, async batch => { edits.push(batch); });
    const cum = (row: number, col: number) => targetKey(store.book.sheets.PCUM[row][col].target);
    const q = (row: number, col: number) => targetKey(store.book.sheets.PQ[row][col].target);
    assert.equal(store.getValue(cum(0, 0)), "=100+200");
    assert.equal(store.getValue(q(0, 0)), "既存メモ");
    for (const [key, input, expected] of [
        [cum(0, 1), "=100+200", "300"], [q(0, 1), "＝2/1", "2"],
        [cum(0, 2), "=65820*1.1", "72402"], [q(0, 2), "=CUM!A1+KPI!A1", "130.456789"],
        [cum(0, 3), "=PCUM!B1*2", "600"], [q(0, 3), "=PCUM!B1+PQ!B1", "302"],
    ] as [string, string, string][]) {
        store.select(key); store.begin(key, undefined, "bar"); store.draft(input, "bar"); store.commit();
        assert.equal(store.getValue(key), expected);
    }
    await store.settled();
    assert.equal(store.formulaText(q(0, 1)), "=2/1");
    assert.deepEqual((edits[1] as { colIdx: number }[])[0].colIdx, 3);
    assert.equal(decodeFormula(store.raw(cum(0, 1)))?.formula, "=100+200");
    store.undo(); assert.equal(store.getValue(q(0, 3)), "");
    store.redo(); assert.equal(store.getValue(q(0, 3)), "302");
    await store.settled();
});

test("PL memo ranges and fixed references copy like KPI and Escape leaves persisted raw text intact", () => {
    const base = buildKpiBook("TEST", [record()], {}, undefined, { pl_cum: [["2", "3"], ["4", "5"]], pl_q: [[]] });
    const store = new KpiEditorStore(); store.configure(base);
    const source = targetKey(base.sheets.PCUM[0][2].target);
    store.select(source); store.begin(source); store.draft("=SUM(PCUM!$A$1:PCUM!B1)"); store.commit();
    assert.equal(store.getValue(source), "5");
    const pasted = copyFormula(store.raw(source), store.book, 1, 0);
    assert.equal(decodeFormula(pasted)?.formula, "=SUM(PCUM!$A$1:PCUM!B2)");
    const clipboard = store.clipboard()!;
    const destination = targetKey(base.sheets.PCUM[1][2].target);
    store.select(destination); store.paste([["ignored"]], clipboard.custom);
    assert.equal(store.formulaText(destination), "=SUM(PCUM!$A$1:PCUM!B2)");
    assert.equal(store.getValue(destination), "14");
    store.begin(source); store.draft("=1/0"); store.cancel();
    assert.equal(store.getValue(source), "5");
    assert.equal(decodeFormula(store.raw(source))?.formula, "=SUM(PCUM!$A$1:PCUM!B1)");
});

test("saved PL memo bindings survive new fiscal rows, reload, actual updates and broken/cyclic references", () => {
    const old = buildKpiBook("TEST", [record()], {}, undefined, { pl_cum: [[]], pl_q: [[]] });
    const saved = compileFormula("=CUM!A1+PCUM!B1", old);
    const memo = compileFormula("=10", old);
    const next = buildKpiBook("TEST", [record("2025-03-31", "1Q", { sales: 999 }), record("2026-03-31", "1Q", { sales: 200 })], {}, undefined,
        { pl_cum: [[saved, memo]], pl_q: [[]] });
    const engine = new FormulaEngine(); engine.update(next);
    const key = targetKey(next.sheets.PCUM[0][0].target);
    assert.equal(engine.read(key), 210);
    assert.equal(projectFormula(decodeFormula(saved)!, next).formula, "=CUM!A2+PCUM!B1");
    const updated = buildKpiBook("TEST", [record("2025-03-31", "1Q", { sales: 999 }), record("2026-03-31", "1Q", { sales: 250 })], {}, undefined,
        { pl_cum: [[saved, memo]], pl_q: [[]] });
    engine.update(updated); assert.equal(engine.read(key), 260);
    const broken = buildKpiBook("TEST", [record("2025-03-31", "1Q", { sales: 999 })], {}, undefined,
        { pl_cum: [[saved, memo]], pl_q: [[]] });
    engine.update(broken); assert.equal(engine.read(key), "#REF!");
    const cycle = buildKpiBook("TEST", [record()], {}, undefined,
        { pl_cum: [[compileFormula("=PCUM!B1", old), compileFormula("=PCUM!A1", old)]], pl_q: [[]] });
    engine.update(cycle); assert.equal(engine.read(key), "#CYCLE!");
});
test("explicitly retyping a legacy equals string converts only that edited cell to a formula", async () => {
    const store = new KpiEditorStore(); store.configure(formulaBook(book(), ["=1+2", "=legacy"]));
    const key = targetKey(store.book.sheets.KPI[0][0].target); store.begin(key); store.draft("=1+2"); store.commit(); await store.settled();
    assert.equal(store.getValue(key), "3"); assert.equal(store.raw(targetKey(store.book.sheets.KPI[0][1].target)), "=legacy");
});
