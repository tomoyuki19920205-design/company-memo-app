import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinancialsTable from '../components/FinancialsTable';
import { transformFinancialRows } from '../lib/financial-transform';
import { buildFinancialTableModel } from '../lib/financial-table-model';

test('quarter actuals and all FY forecast metrics remain separate through Viewer rendering', () => {
  const base = { ticker:'1234',period:'2026-10-31',sales:36000,gross_profit:null,
    operating_profit:2300,source:'summary_xbrl',updated_at:'2026-09-04' };
  const data = transformFinancialRows([
    ...['1Q','2Q','3Q'].map(quarter => ({...base,quarter})),
    {...base,quarter:'FY',source:'tdnet_forecast',sales:160000,operating_profit:12550,
      ordinary_profit:13000,net_income:9150,eps:538.05},
  ]);
  const model=buildFinancialTableModel(data);
  assert.equal(model.cumulativeRows.length,3);
  assert.ok(model.cumulativeRows.every(r => r.quarter !== 'FY'));
  assert.ok(model.standaloneRows.every(r => r.quarter !== 'FY'));
  const forecast=data.find(r=>r.source==='tdnet_forecast')!;
  assert.equal(forecast.ordinary_profit,13000);
  assert.equal(forecast.net_income,9150);
  assert.equal(forecast.eps,538.05);
  const html=renderToStaticMarkup(<FinancialsTable data={data} loading={false} segments={[]}/>);
  for (const expected of ['160,000','12,550','13,000','9,150','538.05','7.8%']) assert.ok(html.includes(expected),expected);
  assert.ok(!html.includes('36,000,000,000'));
});

test('a missing operating profit never consumes ordinary or net profit',()=>{
  const [row]=transformFinancialRows([{ticker:'5678',period:'2025-03-31',quarter:'3Q',
    sales:100,gross_profit:null,operating_profit:null,ordinary_profit:20,net_income:10,source:'pdf',updated_at:null}]);
  assert.equal(row.operating_profit,null);
  assert.equal(row.ordinary_profit,20);
  assert.equal(row.net_income,10);
});
