import React, { useMemo, useState } from 'react';
import FinancialsTable from '../../components/FinancialsTable';
import { buildKpiBook } from '../../lib/kpi-reference-book';
import { compileFormula } from '../../lib/kpi-formula';
import financials from '../fixtures/alphanumeric-pl-viewer.json';

const baseRows = financials['418A'];
function initialValues(ticker, rows) {
  const saved = localStorage.getItem(`kpi-fixture-${ticker}`);
  if (saved) return JSON.parse(saved);
  const book = buildKpiBook(ticker, rows, {});
  const first = book.sheets.KPI[0][0].target;
  const second = book.sheets.KPI[1][0].target;
  const third = book.sheets.KPI[2][0].target;
  return { [`${first.scope}|${first.period}|${first.quarter}`]: {
    1: compileFormula('=CUM!A1+1', book), 2: '通常の文字列',
  }, [`${second.scope}|${second.period}|${second.quarter}`]: { 1: '＝2/1' },
  [`${third.scope}|${third.period}|${third.quarter}`]: { 1: '＝1/2' } };
}
function initialMemos(ticker) {
  const saved = localStorage.getItem(`pl-memo-fixture-${ticker}`);
  if (saved) return JSON.parse(saved);
  return { pl_cum: [[], [], [], ['', '', '', '', '', '', '', '=従来メモ']],
    pl_q: [[], [], [], ['', '', '', '', '', '', '', '通常メモ']],
    segment_cum: [], segment_q: [], segment_manual: [] };
}
function Grid({ ticker }) {
  const [extraYear, setExtraYear] = useState(false);
  const [salesDelta, setSalesDelta] = useState(0);
  const rows = useMemo(() => {
    const result = baseRows.map(row => ({ ...row, ticker, sales: row.sales + (row.period === '2025-11-30' && row.quarter === '3Q' ? salesDelta : 0) }));
    if (extraYear) result.push({ ...result[0], period: '2024-11-30', quarter: '1Q', sales: 999 });
    return result;
  }, [ticker, extraYear, salesDelta]);
  const [values, setValues] = useState(() => initialValues(ticker, rows));
  const [memos, setMemos] = useState(() => initialMemos(ticker));
  const save = async edits => {
    window.__kpiSaveCount = (window.__kpiSaveCount ?? 0) + 1;
    setValues(previous => {
      const next = { ...previous };
      for (const edit of edits) {
        const key = `${edit.tableScope}|${edit.period}|${edit.quarter}`;
        next[key] = { ...next[key], [edit.kpiSlot]: edit.value };
      }
      localStorage.setItem(`kpi-fixture-${ticker}`, JSON.stringify(next));
      return next;
    });
  };
  const savePl = async edits => {
    window.__plMemoSaveCount = (window.__plMemoSaveCount ?? 0) + 1;
    setMemos(previous => {
      const next = { ...previous };
      for (const edit of edits) {
        const grid = next[edit.tableType] === previous[edit.tableType] ? previous[edit.tableType].map(row => [...row]) : next[edit.tableType];
        while (grid.length <= edit.rowIdx) grid.push([]);
        while (grid[edit.rowIdx].length <= edit.colIdx) grid[edit.rowIdx].push('');
        grid[edit.rowIdx][edit.colIdx] = edit.value;
        next[edit.tableType] = grid;
      }
      localStorage.setItem(`pl-memo-fixture-${ticker}`, JSON.stringify(next));
      return next;
    });
  };
  return <><button onClick={() => setExtraYear(value => !value)}>決算行を追加</button>
    <button onClick={() => setSalesDelta(value => value + 10)}>売上を変更</button>
    <FinancialsTable ticker={ticker} data={rows} loading={false} kpiValues={values}
    kpiDefs={{ 1: '利益計算', 2: '説明', 3: '空欄' }}
    memoMap={{ [`${rows[0].period}|${rows[0].quarter}`]: [['=MEMOは文字列', '既存メモ']] }}
    manualTableMemos={memos} onPlMemoBatchEdit={savePl} onKpiBatchEdit={save} /></>;
}
export default function KpiFixture() {
  const [ticker, setTicker] = useState('418A');
  return <><nav><button onClick={() => setTicker('418A')}>418A</button><button onClick={() => setTicker('7203')}>7203</button></nav>
    <Grid key={ticker} ticker={ticker} /></>;
}
