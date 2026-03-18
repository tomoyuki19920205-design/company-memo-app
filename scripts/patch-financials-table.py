# -*- coding: utf-8 -*-
"""
Patch FinancialsTable.tsx - all changes applied via text replacement.
Reads as bytes, normalizes to LF, patches, converts back to CRLF, writes.
"""
import os, sys

filepath = os.path.join("C:", os.sep, "Users", "takuy", ".gemini", "antigravity",
                        "company-memo-app", "components", "FinancialsTable.tsx")

with open(filepath, "rb") as f:
    raw = f.read()

content = raw.decode("utf-8")
# Normalize all line endings to LF for reliable matching
content = content.replace("\r\n", "\n")

errors = []
change_count = 0

def do_replace(label, old, new, count=1):
    global content, change_count
    if old not in content:
        errors.append(f"FAIL: {label} - target not found")
        # Debug: show first 60 chars
        errors.append(f"  first 60: {repr(old[:60])}")
        return False
    content = content.replace(old, new, count)
    change_count += 1
    print(f"OK: {label}")
    return True

# ============================================================
# 1. Column comments + BASE_COL_COUNT
# ============================================================
do_replace("1. COL_COUNT",
    "// CUM: [period, quarter, sales, gp, sga, op, margin, memo_a, memo_b, ...segs, ...kpis]\n"
    "// Q:   [period, quarter, sales, gp, sga, op, margin, ...segs, ...kpis]\n"
    "const CUM_BASE_COL_COUNT = 9;\n"
    "const Q_BASE_COL_COUNT = 7;",
    "// CUM: [period, quarter, sales, gp, gm_rate, sga, op, margin, memo_a, memo_b, ...kpis]\n"
    "// Q:   [period, quarter, sales, gp, gm_rate, sga, op, margin, ...kpis]\n"
    "const CUM_BASE_COL_COUNT = 10;\n"
    "const Q_BASE_COL_COUNT = 8;"
)

# ============================================================
# 2. CUM_COLUMNS - insert gm_rate after GP
# ============================================================
do_replace("2. CUM_COLUMNS gm_rate",
    '    { key: "gp", label: "GP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "sga", label: "\u7ba1\u7406\u8cbb", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op", label: "OP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op_margin", label: "\u55b6\u696d\u5229\u76ca\u7387", initialWidth: 75, className: "num-col" },\n'
    '    { key: "memo_a", label: "Memo A", initialWidth: 130 },\n'
    '    { key: "memo_b", label: "Memo B", initialWidth: 130 },\n'
    '];',
    '    { key: "gp", label: "GP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "gm_rate", label: "\u7c97\u5229\u7387", initialWidth: 75, className: "num-col" },\n'
    '    { key: "sga", label: "\u7ba1\u7406\u8cbb", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op", label: "OP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op_margin", label: "\u55b6\u696d\u5229\u76ca\u7387", initialWidth: 75, className: "num-col" },\n'
    '    { key: "memo_a", label: "Memo A", initialWidth: 130 },\n'
    '    { key: "memo_b", label: "Memo B", initialWidth: 130 },\n'
    '];'
)

# ============================================================
# 3. Q_BASE_COLUMNS - insert gm_rate after GP
# ============================================================
do_replace("3. Q_BASE_COLUMNS gm_rate",
    '    { key: "gp", label: "GP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "sga", label: "\u7ba1\u7406\u8cbb", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op", label: "OP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op_margin", label: "\u55b6\u696d\u5229\u76ca\u7387", initialWidth: 75, className: "num-col" },\n'
    '];',
    '    { key: "gp", label: "GP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "gm_rate", label: "\u7c97\u5229\u7387", initialWidth: 75, className: "num-col" },\n'
    '    { key: "sga", label: "\u7ba1\u7406\u8cbb", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op", label: "OP", initialWidth: 85, className: "num-col" },\n'
    '    { key: "op_margin", label: "\u55b6\u696d\u5229\u76ca\u7387", initialWidth: 75, className: "num-col" },\n'
    '];'
)

# ============================================================
# 4. Table width calculations
# ============================================================
do_replace("4. Table widths",
    "    const cumTableWidth = cumResize.widths.reduce((s, w) => s + w, 0) + segExtraWidth + kpiExtraWidth;\n"
    "    const qBaseWidth = qResize.widths.reduce((s, w) => s + w, 0);\n"
    "    const qTableWidth = qBaseWidth + segExtraWidth + kpiExtraWidth;",
    "    // PL\u30c6\u30fc\u30d6\u30eb\u5e45\uff08\u30bb\u30b0\u30e1\u30f3\u30c8\u5217\u306a\u3057\uff09\n"
    "    const cumTableWidth = cumResize.widths.reduce((s, w) => s + w, 0) + kpiExtraWidth;\n"
    "    const qBaseWidth = qResize.widths.reduce((s, w) => s + w, 0);\n"
    "    const qTableWidth = qBaseWidth + kpiExtraWidth;\n"
    "    // \u30bb\u30b0\u30e1\u30f3\u30c8\u30c6\u30fc\u30d6\u30eb\u5e45\n"
    "    const segCumTableWidth = 100 + 45 + segExtraWidth;\n"
    "    const segQTableWidth = 100 + 45 + segExtraWidth;"
)

# ============================================================
# 5. getCellDisplayValue - col indices + remove segment block
# ============================================================
# 5a. Update col 4-8 and remove segment block
do_replace("5a. getCellDisplayValue col indices",
    '            if (colIdx === 4) return formatMillions(row.sgAndA) ?? "";\n'
    '            if (colIdx === 5) return formatMillions(row.operatingProfit) ?? "";\n'
    '            if (colIdx === 6) return fmtMargin(row.opMargin);\n'
    '            if (tableId === "cum" && colIdx === 7) {\n'
    '                const mKey = `${row.period}|${row.quarter}`;\n'
    '                return extractMemoValue(memoMap?.[mKey], 0);\n'
    '            }\n'
    '            if (tableId === "cum" && colIdx === 8) {\n'
    '                const mKey = `${row.period}|${row.quarter}`;\n'
    '                return extractMemoValue(memoMap?.[mKey], 1);\n'
    '            }\n'
    '        }\n'
    '        // \u30bb\u30b0\u30e1\u30f3\u30c8\u5217\n'
    '        if (colIdx >= segStart && colIdx < segEnd) {\n'
    '            const segRelIdx = colIdx - segStart;\n'
    '            const scIdx = Math.floor(segRelIdx / 2);\n'
    '            const isProfit = segRelIdx % 2 === 1;\n'
    '            const sc = segmentColumns[scIdx];\n'
    '            if (!sc) return "";\n'
    '            const key = isProfit ? sc.profitKey : sc.salesKey;\n'
    '            const mapKey = `${row.period}|${row.quarter}`;\n'
    '            if (tableId === "cum") {\n'
    '                const val = segmentMap.get(mapKey)?.[key] ?? null;\n'
    '                return val !== null ? (formatMillions(val) ?? "") : "";\n'
    '            } else {\n'
    '                const val = segmentQMap.get(mapKey)?.[key] ?? null;\n'
    '                return val !== null ? (formatMillions(val) ?? "") : "";\n'
    '            }\n'
    '        }',
    '            if (colIdx === 4) return fmtMargin(row.grossMarginRate);\n'
    '            if (colIdx === 5) return formatMillions(row.sgAndA) ?? "";\n'
    '            if (colIdx === 6) return formatMillions(row.operatingProfit) ?? "";\n'
    '            if (colIdx === 7) return fmtMargin(row.opMargin);\n'
    '            if (tableId === "cum" && colIdx === 8) {\n'
    '                const mKey = `${row.period}|${row.quarter}`;\n'
    '                return extractMemoValue(memoMap?.[mKey], 0);\n'
    '            }\n'
    '            if (tableId === "cum" && colIdx === 9) {\n'
    '                const mKey = `${row.period}|${row.quarter}`;\n'
    '                return extractMemoValue(memoMap?.[mKey], 1);\n'
    '            }\n'
    '        }'
)

# 5b. Remove segment variables
do_replace("5b. getCellDisplayValue seg vars",
    '        const segCount = segmentColumns.length * 2;\n'
    '        const segStart = baseCount;\n'
    '        const segEnd = segStart + segCount;\n'
    '        const kpiStart = segEnd;\n'
    '\n'
    '        // \u57fa\u672c\u5217',
    '        const kpiStart = baseCount;\n'
    '\n'
    '        // \u57fa\u672c\u5217 (0=period,1=Q,2=sales,3=gp,4=gm_rate,5=sga,6=op,7=margin, cum:8=memoA,9=memoB)'
)

# 5c. Fix deps
do_replace("5c. getCellDisplayValue deps",
    '    }, [cumRows, qRows, segmentColumns, memoMap, kpiValues, segmentMap, segmentQMap]);',
    '    }, [cumRows, qRows, memoMap, kpiValues]);'
)

# ============================================================
# 6. clearRange
# ============================================================
do_replace("6a. clearRange segCount",
    '        const segCount = segmentColumns.length * 2;\n'
    '        const kpiStart = baseCount + segCount;',
    '        const kpiStart = baseCount;'
)

do_replace("6b. clearRange memo cols",
    '                // \u30e1\u30e2\u5217 (cum\u306e\u307f: col 7=memo_a, 8=memo_b)\n'
    '                if (selectionRange.tableId === "cum" && (c === 7 || c === 8) && onMemoEdit) {\n'
    '                    onMemoEdit(row.period, row.quarter, c === 7 ? 0 : 1, "");',
    '                // \u30e1\u30e2\u5217 (cum\u306e\u307f: col 8=memo_a, 9=memo_b)\n'
    '                if (selectionRange.tableId === "cum" && (c === 8 || c === 9) && onMemoEdit) {\n'
    '                    onMemoEdit(row.period, row.quarter, c === 8 ? 0 : 1, "");'
)

do_replace("6c. clearRange deps",
    '    }, [selectionRange, cumRows, qRows, segmentColumns, onMemoEdit, onKpiValueEdit]);',
    '    }, [selectionRange, cumRows, qRows, onMemoEdit, onKpiValueEdit]);'
)

# ============================================================
# 7. Rendering block - replace the entire section
# ============================================================
# Use unique, shorter markers to find start/end
render_start_marker = '                <>\n                    <div className="pl-scroll-area" style={{ maxHeight: plHeight }}>\n                        <div className="pl-dual-tables">\n                            {/* === \u7d2f\u8a08PL === */}\n                            <div className="pl-table-block">\n                                <div className="pl-table-label">'

render_end_marker = '            {/* \u30c8\u30fc\u30b9\u30c8\u901a\u77e5 */}\n            {toastMessage && (\n                <div className="seg-paste-toast">{toastMessage}</div>\n            )}\n        </div>\n    );\n}'

start_pos = content.find(render_start_marker)
end_pos = content.find(render_end_marker)
print(f"\nRender markers: start={start_pos}, end={end_pos}")

if start_pos == -1 or end_pos == -1:
    errors.append("FAIL: Rendering block markers not found!")
else:
    end_pos_full = end_pos + len(render_end_marker)

    new_render = (
        '                <>\n'
        '                    <div className="pl-scroll-area" style={{ maxHeight: plHeight }}>\n'
        '                        <div className="pl-dual-tables">\n'
        '                            {/* === \u7d2f\u8a08PL === */}\n'
        '                            <div className="pl-table-block">\n'
        '                                <div className="pl-table-label">\u7d2f\u8a08PL\uff08\u767e\u4e07\u5186\uff09</div>\n'
        '                                <table className="pl-table" style={{ minWidth: cumTableWidth }}>\n'
        '                                    <PLTableHeader columns={CUM_COLUMNS} widths={cumResize.widths} onResizeStart={cumResize.handleMouseDown}\n'
        '                                        kpiSlots={KPI_SLOTS} kpiDefs={kpiDefs} kpiWidths={kpiWidths} onKpiResizeStart={handleKpiResizeStart}\n'
        '                                        editingKpiHeader={editingKpiHeader} editingKpiHeaderValue={editingKpiHeaderValue} kpiHeaderInputRef={kpiHeaderInputRef}\n'
        '                                        onStartKpiHeaderEdit={startKpiHeaderEdit} onEditingKpiHeaderValueChange={setEditingKpiHeaderValue}\n'
        '                                        onCommitKpiHeaderEdit={commitKpiHeaderEdit} onCancelKpiHeaderEdit={cancelKpiHeaderEdit}\n'
        '                                    />\n'
        '                                    <tbody>\n'
        '                                        {cumRows.map((row, idx) => {\n'
        '                                            const isSelected = selectedPeriod === row.period && selectedQuarter === row.quarter;\n'
        '                                            const memoKey = `${row.period}|${row.quarter}`;\n'
        '                                            const memoGrid = memoMap?.[memoKey];\n'
        '                                            const memoA = extractMemoValue(memoGrid, 0);\n'
        '                                            const memoB = extractMemoValue(memoGrid, 1);\n'
        '                                            return (\n'
        '                                                <tr key={`cum-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${isSelected ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`} onClick={() => onRowClick?.(row.period, row.quarter)}>\n'
        '                                                    <td style={{ width: cumResize.widths[0], minWidth: cumResize.widths[0] }} className={isCellInRange("cum", idx, 0) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("cum", idx, 0, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 0)}>{displayValue(row.period)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[1], minWidth: cumResize.widths[1] }} className={isCellInRange("cum", idx, 1) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("cum", idx, 1, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 1)}>{displayValue(row.quarter)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[2], minWidth: cumResize.widths[2] }} className={`num-col ${isCellInRange("cum", idx, 2) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 2, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 2)}>{formatMillions(row.sales)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[3], minWidth: cumResize.widths[3] }} className={`num-col ${isCellInRange("cum", idx, 3) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 3, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 3)}>{formatMillions(row.grossProfit)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[4], minWidth: cumResize.widths[4] }} className={`num-col ${isCellInRange("cum", idx, 4) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 4, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 4)}>{fmtMargin(row.grossMarginRate)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[5], minWidth: cumResize.widths[5] }} className={`num-col ${isCellInRange("cum", idx, 5) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 5, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 5)}>{formatMillions(row.sgAndA)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[6], minWidth: cumResize.widths[6] }} className={`num-col ${isCellInRange("cum", idx, 6) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 6, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 6)}>{formatMillions(row.operatingProfit)}</td>\n'
        '                                                    <td style={{ width: cumResize.widths[7], minWidth: cumResize.widths[7] }} className={`num-col ${isCellInRange("cum", idx, 7) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("cum", idx, 7, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 7)}>{fmtMargin(row.opMargin)}</td>\n'
        '                                                    <MemoCellExcel value={memoA} width={cumResize.widths[8]}\n'
        '                                                        isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === "memo_a"}\n'
        '                                                        isInRange={isCellInRange("cum", idx, 8)}\n'
        '                                                        isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_a"}\n'
        '                                                        editValue={editValue}\n'
        '                                                        onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey: "memo_a" })}\n'
        '                                                        onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey: "memo_a" }, val)}\n'
        '                                                        onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}\n'
        '                                                        inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_a" ? editInputRef : undefined}\n'
        '                                                        onMouseDown={(e) => handleCellMouseDown("cum", idx, 8, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 8)}\n'
        '                                                    />\n'
        '                                                    <MemoCellExcel value={memoB} width={cumResize.widths[9]}\n'
        '                                                        isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === "memo_b"}\n'
        '                                                        isInRange={isCellInRange("cum", idx, 9)}\n'
        '                                                        isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_b"}\n'
        '                                                        editValue={editValue}\n'
        '                                                        onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey: "memo_b" })}\n'
        '                                                        onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey: "memo_b" }, val)}\n'
        '                                                        onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}\n'
        '                                                        inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === "memo_b" ? editInputRef : undefined}\n'
        '                                                        onMouseDown={(e) => handleCellMouseDown("cum", idx, 9, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, 9)}\n'
        '                                                    />\n'
        '                                                    {KPI_SLOTS.map((slot) => {\n'
        '                                                        const colKey = `kpi_${slot}`;\n'
        '                                                        const kpiKey = `${row.period}|${row.quarter}`;\n'
        '                                                        const cellVal = kpiValues?.[kpiKey]?.[slot] ?? "";\n'
        '                                                        const kpiAbsCol = CUM_BASE_COL_COUNT + (slot - 1);\n'
        '                                                        return (\n'
        '                                                            <MemoCellExcel key={colKey} value={cellVal} width={kpiWidths[slot - 1]}\n'
        '                                                                isActive={activeCell?.tableId === "cum" && activeCell?.rowIdx === idx && activeCell?.colKey === colKey}\n'
        '                                                                isInRange={isCellInRange("cum", idx, kpiAbsCol)}\n'
        '                                                                isEditing={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey}\n'
        '                                                                editValue={editValue}\n'
        '                                                                onSelect={() => selectCell({ tableId: "cum", rowIdx: idx, colKey })}\n'
        '                                                                onStartEdit={(val) => startEditing({ tableId: "cum", rowIdx: idx, colKey }, val)}\n'
        '                                                                onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}\n'
        '                                                                inputRef={editingCell?.tableId === "cum" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey ? editInputRef : undefined}\n'
        '                                                                className="kpi-cell"\n'
        '                                                                onMouseDown={(e) => handleCellMouseDown("cum", idx, kpiAbsCol, e)} onMouseEnter={() => handleCellMouseEnter("cum", idx, kpiAbsCol)}\n'
        '                                                            />\n'
        '                                                        );\n'
        '                                                    })}\n'
        '                                                </tr>\n'
        '                                            );\n'
        '                                        })}\n'
        '                                    </tbody>\n'
        '                                </table>\n'
        '                            </div>\n'
        '                            {/* === Q\u5358\u4f53PL === */}\n'
        '                            <div className="pl-table-block">\n'
        '                                <div className="pl-table-label">Q\u5358\u4f53PL\uff08\u767e\u4e07\u5186\uff09</div>\n'
        '                                <table className="pl-table" style={{ minWidth: qTableWidth }}>\n'
        '                                    <PLTableHeader columns={Q_BASE_COLUMNS} widths={qResize.widths} onResizeStart={qResize.handleMouseDown}\n'
        '                                        kpiSlots={KPI_SLOTS} kpiDefs={kpiDefs} kpiWidths={kpiWidths} onKpiResizeStart={handleKpiResizeStart}\n'
        '                                        editingKpiHeader={editingKpiHeader} editingKpiHeaderValue={editingKpiHeaderValue} kpiHeaderInputRef={kpiHeaderInputRef}\n'
        '                                        onStartKpiHeaderEdit={startKpiHeaderEdit} onEditingKpiHeaderValueChange={setEditingKpiHeaderValue}\n'
        '                                        onCommitKpiHeaderEdit={commitKpiHeaderEdit} onCancelKpiHeaderEdit={cancelKpiHeaderEdit}\n'
        '                                    />\n'
        '                                    <tbody>\n'
        '                                        {qRows.map((row, idx) => (\n'
        '                                            <tr key={`q-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`} onClick={() => onRowClick?.(row.period, row.quarter)}>\n'
        '                                                <td style={{ width: qResize.widths[0], minWidth: qResize.widths[0] }} className={isCellInRange("q", idx, 0) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("q", idx, 0, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 0)}>{displayValue(row.period)}</td>\n'
        '                                                <td style={{ width: qResize.widths[1], minWidth: qResize.widths[1] }} className={isCellInRange("q", idx, 1) ? "cell-in-range" : ""} onMouseDown={(e) => handleCellMouseDown("q", idx, 1, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 1)}>{displayValue(row.quarter)}</td>\n'
        '                                                <td style={{ width: qResize.widths[2], minWidth: qResize.widths[2] }} className={`num-col ${isCellInRange("q", idx, 2) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 2, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 2)}>{formatMillions(row.sales)}</td>\n'
        '                                                <td style={{ width: qResize.widths[3], minWidth: qResize.widths[3] }} className={`num-col ${isCellInRange("q", idx, 3) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 3, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 3)}>{formatMillions(row.grossProfit)}</td>\n'
        '                                                <td style={{ width: qResize.widths[4], minWidth: qResize.widths[4] }} className={`num-col ${isCellInRange("q", idx, 4) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 4, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 4)}>{fmtMargin(row.grossMarginRate)}</td>\n'
        '                                                <td style={{ width: qResize.widths[5], minWidth: qResize.widths[5] }} className={`num-col ${isCellInRange("q", idx, 5) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 5, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 5)}>{formatMillions(row.sgAndA)}</td>\n'
        '                                                <td style={{ width: qResize.widths[6], minWidth: qResize.widths[6] }} className={`num-col ${isCellInRange("q", idx, 6) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 6, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 6)}>{formatMillions(row.operatingProfit)}</td>\n'
        '                                                <td style={{ width: qResize.widths[7], minWidth: qResize.widths[7] }} className={`num-col ${isCellInRange("q", idx, 7) ? "cell-in-range" : ""}`} onMouseDown={(e) => handleCellMouseDown("q", idx, 7, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, 7)}>{fmtMargin(row.opMargin)}</td>\n'
        '                                                {KPI_SLOTS.map((slot) => {\n'
        '                                                    const colKey = `kpi_${slot}`;\n'
        '                                                    const kpiKey = `${row.period}|${row.quarter}`;\n'
        '                                                    const cellVal = kpiValues?.[kpiKey]?.[slot] ?? "";\n'
        '                                                    const kpiAbsCol = Q_BASE_COL_COUNT + (slot - 1);\n'
        '                                                    return (\n'
        '                                                        <MemoCellExcel key={colKey} value={cellVal} width={kpiWidths[slot - 1]}\n'
        '                                                            isActive={activeCell?.tableId === "q" && activeCell?.rowIdx === idx && activeCell?.colKey === colKey}\n'
        '                                                            isInRange={isCellInRange("q", idx, kpiAbsCol)}\n'
        '                                                            isEditing={editingCell?.tableId === "q" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey}\n'
        '                                                            editValue={editValue}\n'
        '                                                            onSelect={() => selectCell({ tableId: "q", rowIdx: idx, colKey })}\n'
        '                                                            onStartEdit={(val) => startEditing({ tableId: "q", rowIdx: idx, colKey }, val)}\n'
        '                                                            onEditChange={setEditValue} onCommit={commitEdit} onCancel={cancelEdit}\n'
        '                                                            inputRef={editingCell?.tableId === "q" && editingCell?.rowIdx === idx && editingCell?.colKey === colKey ? editInputRef : undefined}\n'
        '                                                            className="kpi-data-cell"\n'
        '                                                            onMouseDown={(e) => handleCellMouseDown("q", idx, kpiAbsCol, e)} onMouseEnter={() => handleCellMouseEnter("q", idx, kpiAbsCol)}\n'
        '                                                        />\n'
        '                                                    );\n'
        '                                                })}\n'
        '                                            </tr>\n'
        '                                        ))}\n'
        '                                    </tbody>\n'
        '                                </table>\n'
        '                            </div>\n'
        '                        </div>\n'
        '                    </div>\n'
        '                    {/* \u30ea\u30b5\u30a4\u30ba\u30cf\u30f3\u30c9\u30eb */}\n'
        '                    <div className="pl-resize-handle" onMouseDown={handleResizeMouseDown} title="\u30c9\u30e9\u30c3\u30b0\u3067\u9ad8\u3055\u8abf\u6574">\n'
        '                        <div className="pl-resize-grip">\u22ef</div>\n'
        '                    </div>\n'
        '                    {/* \u30bb\u30b0\u30e1\u30f3\u30c8\u7fa4\u30c6\u30fc\u30d6\u30eb */}\n'
        '                    {segmentColumns.length > 0 && (\n'
        '                        <div className="data-section seg-section" style={{ marginTop: 12 }}>\n'
        '                            <h3 className="section-title" style={{ fontSize: 14 }}>{"\U0001f4ca"} \u30bb\u30b0\u30e1\u30f3\u30c8\u696d\u7e3e \u2014 {segmentColumns.length}\u4ef6</h3>\n'
        '                            <div className="pl-scroll-area" style={{ maxHeight: plHeight }}>\n'
        '                                <div className="pl-dual-tables">\n'
        '                                    <div className="pl-table-block">\n'
        '                                        <div className="pl-table-label">\u7d2f\u8a08\u30bb\u30b0\u30e1\u30f3\u30c8\uff08\u767e\u4e07\u5186\uff09</div>\n'
        '                                        <table className="pl-table" style={{ minWidth: segCumTableWidth }}>\n'
        '                                            <thead><tr>\n'
        '                                                <th style={{ width: 100, minWidth: 100 }}><div className="th-content"><span>PERIOD</span></div></th>\n'
        '                                                <th style={{ width: 45, minWidth: 45 }}><div className="th-content"><span>Q</span></div></th>\n'
        '                                                {segmentHeaders.map((eh, si) => (<th key={`seg-cum-h-${si}`} className={`seg-header-cell ${eh.className || "num-col"}`} style={{ width: segWidths[si] ?? 90, minWidth: 24 }}><div className="th-content"><span>{eh.label}</span><div className="resize-handle" onMouseDown={(e) => handleSegResizeStart(si, e)} /></div></th>))}\n'
        '                                            </tr></thead>\n'
        '                                            <tbody>\n'
        '                                                {cumRows.map((row, idx) => (\n'
        '                                                    <tr key={`seg-cum-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}>\n'
        '                                                        <td style={{ width: 100, minWidth: 100 }}>{displayValue(row.period)}</td>\n'
        '                                                        <td style={{ width: 45, minWidth: 45 }}>{displayValue(row.quarter)}</td>\n'
        '                                                        {segmentColumns.map((sc, scIdx) => {\n'
        '                                                            const salesVal = getSegValue(row.period, row.quarter, sc.salesKey);\n'
        '                                                            const profitVal = getSegValue(row.period, row.quarter, sc.profitKey);\n'
        '                                                            const sIdx = scIdx * 2;\n'
        '                                                            const pIdx = scIdx * 2 + 1;\n'
        '                                                            const mapKey = `${normalizePeriod(row.period)}|${normalizeQuarter(row.quarter)}`;\n'
        '                                                            const salesSource = sourceMap.get(`${mapKey}|${sc.salesKey}`);\n'
        '                                                            const profitSource = sourceMap.get(`${mapKey}|${sc.profitKey}`);\n'
        '                                                            const isEditableQ = row.quarter === "1Q" || row.quarter === "3Q";\n'
        '                                                            const fy = extractFiscalYear(row.period);\n'
        '                                                            return (\n'
        '                                                                <React.Fragment key={sc.segmentName}>\n'
        '                                                                    <SegOverrideCell value={salesVal} source={salesSource} width={segWidths[sIdx]}\n'
        '                                                                        editable={isEditableQ && (salesVal === null || salesSource === "manual") && !!onSegmentOverrideSave}\n'
        '                                                                        isManual={salesSource === "manual"} fiscalYear={fy} quarter={row.quarter} segmentName={sc.segmentName} metric="sales"\n'
        '                                                                        onSave={onSegmentOverrideSave} onDelete={onSegmentOverrideDelete}\n'
        '                                                                        isSegActive={activeSegCell?.rowIdx === idx && activeSegCell?.colIdx === sIdx}\n'
        '                                                                        onActivate={() => { setActiveSegCell({ rowIdx: idx, colIdx: sIdx }); setActiveCell(null); setEditingSegCell(null); }}\n'
        '                                                                        isSegEditing={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === sIdx}\n'
        '                                                                        segEditInitValue={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === sIdx ? segEditValue : undefined}\n'
        '                                                                        onSegEditDone={finishSegEditing}\n'
        '                                                                    />\n'
        '                                                                    <SegOverrideCell value={profitVal} source={profitSource} width={segWidths[pIdx]}\n'
        '                                                                        editable={isEditableQ && (profitVal === null || profitSource === "manual") && !!onSegmentOverrideSave}\n'
        '                                                                        isManual={profitSource === "manual"} fiscalYear={fy} quarter={row.quarter} segmentName={sc.segmentName} metric="operating_profit"\n'
        '                                                                        onSave={onSegmentOverrideSave} onDelete={onSegmentOverrideDelete}\n'
        '                                                                        isSegActive={activeSegCell?.rowIdx === idx && activeSegCell?.colIdx === pIdx}\n'
        '                                                                        onActivate={() => { setActiveSegCell({ rowIdx: idx, colIdx: pIdx }); setActiveCell(null); setEditingSegCell(null); }}\n'
        '                                                                        isSegEditing={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === pIdx}\n'
        '                                                                        segEditInitValue={editingSegCell?.rowIdx === idx && editingSegCell?.colIdx === pIdx ? segEditValue : undefined}\n'
        '                                                                        onSegEditDone={finishSegEditing}\n'
        '                                                                    />\n'
        '                                                                </React.Fragment>\n'
        '                                                            );\n'
        '                                                        })}\n'
        '                                                    </tr>\n'
        '                                                ))}\n'
        '                                            </tbody>\n'
        '                                        </table>\n'
        '                                    </div>\n'
        '                                    <div className="pl-table-block">\n'
        '                                        <div className="pl-table-label">Q\u5358\u4f53\u30bb\u30b0\u30e1\u30f3\u30c8\uff08\u767e\u4e07\u5186\uff09</div>\n'
        '                                        <table className="pl-table" style={{ minWidth: segQTableWidth }}>\n'
        '                                            <thead><tr>\n'
        '                                                <th style={{ width: 100, minWidth: 100 }}><div className="th-content"><span>PERIOD</span></div></th>\n'
        '                                                <th style={{ width: 45, minWidth: 45 }}><div className="th-content"><span>Q</span></div></th>\n'
        '                                                {segmentHeaders.map((eh, si) => (<th key={`seg-q-h-${si}`} className={`seg-header-cell ${eh.className || "num-col"}`} style={{ width: segWidths[si] ?? 90, minWidth: 24 }}><div className="th-content"><span>{eh.label}</span><div className="resize-handle" onMouseDown={(e) => handleSegResizeStart(si, e)} /></div></th>))}\n'
        '                                            </tr></thead>\n'
        '                                            <tbody>\n'
        '                                                {qRows.map((row, idx) => (\n'
        '                                                    <tr key={`seg-q-${row.period}-${row.quarter}-${idx}`} className={`pl-row ${selectedPeriod === row.period && selectedQuarter === row.quarter ? "pl-row-selected" : ""} ${row.quarter === "FY" ? "pl-row-fy" : ""}`}>\n'
        '                                                        <td style={{ width: 100, minWidth: 100 }}>{displayValue(row.period)}</td>\n'
        '                                                        <td style={{ width: 45, minWidth: 45 }}>{displayValue(row.quarter)}</td>\n'
        '                                                        {segmentColumns.map((sc, scIdx) => {\n'
        '                                                            const salesVal = getSegQValue(row.period, row.quarter, sc.salesKey);\n'
        '                                                            const profitVal = getSegQValue(row.period, row.quarter, sc.profitKey);\n'
        '                                                            const sIdx = scIdx * 2;\n'
        '                                                            const pIdx = scIdx * 2 + 1;\n'
        '                                                            return (\n'
        '                                                                <React.Fragment key={sc.segmentName}>\n'
        '                                                                    <td className="num-col seg-data-cell" style={{ width: segWidths[sIdx], minWidth: segWidths[sIdx] }}>{salesVal !== null ? formatMillions(salesVal) : "\u2013"}</td>\n'
        '                                                                    <td className="num-col seg-data-cell" style={{ width: segWidths[pIdx], minWidth: segWidths[pIdx] }}>{profitVal !== null ? formatMillions(profitVal) : "\u2013"}</td>\n'
        '                                                                </React.Fragment>\n'
        '                                                            );\n'
        '                                                        })}\n'
        '                                                    </tr>\n'
        '                                                ))}\n'
        '                                            </tbody>\n'
        '                                        </table>\n'
        '                                    </div>\n'
        '                                </div>\n'
        '                            </div>\n'
        '                        </div>\n'
        '                    )}\n'
        '                </>\n'
        '            )}\n'
        '            {/* \u30c8\u30fc\u30b9\u30c8\u901a\u77e5 */}\n'
        '            {toastMessage && (\n'
        '                <div className="seg-paste-toast">{toastMessage}</div>\n'
        '            )}\n'
        '        </div>\n'
        '    );\n'
        '}'
    )

    content = content[:start_pos] + new_render + content[end_pos_full:]
    change_count += 1
    print(f"OK: 7. Rendering block")

# Convert back to CRLF and write
output = content.replace("\n", "\r\n")
with open(filepath, "wb") as f:
    f.write(output.encode("utf-8"))

print(f"\nTotal changes: {change_count}")
if errors:
    print(f"\nERRORS ({len(errors)}):")
    for e in errors:
        print(f"  {e}")
    sys.exit(1)
else:
    print("All changes applied successfully!")
    lines = output.decode("utf-8") if isinstance(output, bytes) else output
    print(f"Output lines: {content.count(chr(10)) + 1}")
