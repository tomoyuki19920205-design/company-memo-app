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
function Grid({ ticker }) {
  const rows = useMemo(() => baseRows.map(row => ({ ...row, ticker })), [ticker]);
  const [values, setValues] = useState(() => initialValues(ticker, rows));
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
  return <FinancialsTable ticker={ticker} data={rows} loading={false} kpiValues={values}
    kpiDefs={{ 1: '利益計算', 2: '説明', 3: '空欄' }}
    memoMap={{ [`${rows[0].period}|${rows[0].quarter}`]: [['=MEMOは文字列', '既存メモ']] }}
    onKpiBatchEdit={save} />;
}
export default function KpiFixture() {
  const [ticker, setTicker] = useState('418A');
  return <><nav><button onClick={() => setTicker('418A')}>418A</button><button onClick={() => setTicker('7203')}>7203</button></nav>
    <Grid key={ticker} ticker={ticker} /></>;
}
