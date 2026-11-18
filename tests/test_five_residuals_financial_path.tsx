import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {transformFinancialRows} from '../lib/financial-transform';
import {buildFinancialTableModel} from '../lib/financial-table-model';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/five-residuals-production-pl.json',import.meta.url),'utf8'));
for (const fixture of fixtures) {
 test(`${fixture.ticker}: foreign GP-only row reproduces wrong latest period`,()=>{
  const rows=transformFinancialRows([...fixture.actuals_after_exact_id_removal,fixture.foreign_residual]);
  assert.equal(rows[0].period,fixture.foreign_residual.period);
  assert.equal(rows[0].quarter,fixture.foreign_residual.quarter);
 });
 test(`${fixture.ticker}: exact residual removal selects official latest and preserves history`,()=>{
  const rows=transformFinancialRows(fixture.actuals_after_exact_id_removal);
  const [period,quarter,sales,op]=fixture.expected;
  assert.deepEqual([rows[0].period,rows[0].quarter,rows[0].sales,rows[0].operating_profit],[period,quarter,sales,op]);
  assert.equal(rows.length,fixture.actuals_after_exact_id_removal.length);
  const last=buildFinancialTableModel(rows).cumulativeRows.at(-1)!;
  assert.deepEqual([last.period,last.quarter,last.sales,last.operatingProfit],[period,quarter,sales,op]);
 });
}
test('a legitimate partial GP-only disclosure is retained; no blanket display filter',()=>{
 const partial={ticker:'145A',period:'2027-12-31',quarter:'1Q',sales:null,operating_profit:null,gross_profit:400,source:'tdnet_xbrl',updated_at:''};
 const rows=transformFinancialRows([partial]);
 assert.equal(rows.length,1);assert.equal(rows[0].gross_profit,400);
});
