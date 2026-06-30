const fs = require('fs');

const path = 'components/FinancialsTable.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. activeCellLabel
const oldActiveCellLabel = `    const activeCellLabel = useMemo((): string => {
        if (!activeCell) {
            if (activeManualCell?.tableType === "segment_manual") return "Segment Memo";
            return "";
        }`;

const newActiveCellLabel = `    const activeCellLabel = useMemo((): string => {
        if (!activeCell) {
            if (activeManualCell) {
                if (activeManualCell.tableType === "segment_manual") return "Segment Memo";
                if (activeManualCell.tableType === "segment_cum") return \`下メモ(累計) / 行\${activeManualCell.rowIdx + 1} / 列\${activeManualCell.colIdx + 1}\`;
                if (activeManualCell.tableType === "segment_q") return \`下メモ(Q単体) / 行\${activeManualCell.rowIdx + 1} / 列\${activeManualCell.colIdx + 1}\`;
            }
            return "";
        }`;

code = code.replace(oldActiveCellLabel, newActiveCellLabel);

// 2. handleFormulaBarChange
const oldHandleFormulaBarChange = `    const handleFormulaBarChange = useCallback((value: string) => {
        if (activeCell) {
            const rows = activeCell.tableId === "q" ? qRows : cumRows;
            const row = rows[activeCell.rowIdx];
            if (!row) return;
            const key = activeCell.colKey;
            if ((key === "memo_a" || key === "memo_b") && onMemoEdit) {
                const colIdx = key === "memo_a" ? 0 : 1;
                onMemoEdit(row.period, row.quarter, colIdx, value);
            } else if (key.startsWith("kpi_") && onKpiValueEdit) {
                const slot = parseInt(key.split("_")[1]);
                onKpiValueEdit(row.period, row.quarter, slot, value);
            }
        } else if (activeManualCell?.tableType === "segment_manual") {
            onManualMemoEdit?.("segment_manual", activeManualCell.rowIdx, activeManualCell.colIdx, value);
        }
    }, [activeCell, activeManualCell, cumRows, qRows, onMemoEdit, onKpiValueEdit, onManualMemoEdit]);`;

const newHandleFormulaBarChange = `    const handleFormulaBarChange = useCallback((value: string) => {
        if (activeCell) {
            if (activeCell.tableId === "pl_cum_manual") {
                const colIdx = parseInt(activeCell.colKey.replace("col_", ""), 10);
                onManualMemoEdit?.("pl_cum", activeCell.rowIdx, colIdx, value);
                return;
            }
            if (activeCell.tableId === "pl_q_manual") {
                const colIdx = parseInt(activeCell.colKey.replace("col_", ""), 10) + 2;
                onManualMemoEdit?.("pl_q", activeCell.rowIdx, colIdx, value);
                return;
            }
            const rows = activeCell.tableId === "q" ? qRows : cumRows;
            const row = rows[activeCell.rowIdx];
            if (!row) return;
            const key = activeCell.colKey;
            if ((key === "memo_a" || key === "memo_b") && onMemoEdit) {
                const colIdx = key === "memo_a" ? 0 : 1;
                onMemoEdit(row.period, row.quarter, colIdx, value);
            } else if (key.startsWith("kpi_") && onKpiValueEdit) {
                const slot = parseInt(key.split("_")[1]);
                onKpiValueEdit(row.period, row.quarter, slot, value);
            }
        } else if (activeManualCell && ["segment_manual", "segment_cum", "segment_q"].includes(activeManualCell.tableType)) {
            onManualMemoEdit?.(activeManualCell.tableType, activeManualCell.rowIdx, activeManualCell.colIdx, value);
        }
    }, [activeCell, activeManualCell, cumRows, qRows, onMemoEdit, onKpiValueEdit, onManualMemoEdit]);`;

code = code.replace(oldHandleFormulaBarChange, newHandleFormulaBarChange);

// 3. Formula Bar JSX
const oldFormulaBar = `                    <textarea
                        ref={formulaBarRef}
                        className="formula-bar-input"
                        placeholder="セルを選択してください"
                        value={activeCell ? getActiveCellValue() : (activeManualCell?.tableType === "segment_manual" ? getActiveManualCellValue() : "")}
                        onChange={(e) => handleFormulaBarChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                focusGrid();
                            }
                        }}
                        onBlur={() => {
                        }}
                        style={{ height: formulaBarHeight }}
                        disabled={!activeCell && activeManualCell?.tableType !== "segment_manual"}
                    />`;

const newFormulaBar = `                    <textarea
                        ref={formulaBarRef}
                        className="formula-bar-input"
                        placeholder="セルを選択してください"
                        value={activeSegCell ? "" : (activeCell ? getActiveCellValue() : (activeManualCell && ["segment_manual", "segment_cum", "segment_q"].includes(activeManualCell.tableType) ? getActiveManualCellValue() : ""))}
                        onChange={(e) => handleFormulaBarChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                focusGrid();
                            }
                        }}
                        onBlur={() => {
                        }}
                        style={{ height: formulaBarHeight }}
                        disabled={!!activeSegCell || (!activeCell && !(activeManualCell && ["segment_manual", "segment_cum", "segment_q"].includes(activeManualCell.tableType)))}
                    />`;

code = code.replace(oldFormulaBar, newFormulaBar);

fs.writeFileSync(path, code);
console.log('Modified via regex');
