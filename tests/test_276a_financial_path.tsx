import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import FinancialsTable from '../components/FinancialsTable';
import {transformFinancialRows} from '../lib/financial-transform';
import {buildFinancialTableModel} from '../lib/financial-table-model';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/276a-production-pl.json',import.meta.url),'utf8'));
const rows=transformFinancialRows([...fixture.actuals,...fixture.forecasts]);
const rowHtml=(html:string,table:string,period:string,q:string)=>new RegExp('<tr[^>]*data-table="'+table+'"[^>]*data-period="'+period+'"[^>]*data-quarter="'+q+'"[^>]*>([\\s\\S]*?)</tr>').exec(html)?.[1]??'';

test('276A regression reproduces the contaminated 2760 Q1 being sorted ahead of FY',()=>{
 const tainted=transformFinancialRows([...fixture.actuals,{ticker:'276A',period:'2027-03-31',quarter:'1Q',sales:60322,gross_profit:9306,operating_profit:4066,source:'jquants',updated_at:''}]);
 assert.equal(tainted[0].period,'2027-03-31');
 const fixed=transformFinancialRows(fixture.actuals);
 assert.equal(fixed[0].period,'2026-08-31');
 assert.equal(fixed[0].quarter,'FY');
});

test('276A production API fixture selects FY actual separately from next-year forecasts',()=>{
 const model=buildFinancialTableModel(rows);
 const last=model.cumulativeRows.at(-1)!;
 assert.equal(last.period,'2026-08-31');
 assert.equal(last.quarter,'FY');
 assert.equal(last.sales,7020);
 assert.equal(last.operatingProfit,1144);
 assert.equal(model.forecastFYRows[0].period,'2027-08-31');
 assert.equal(model.forecastFYRows[0].sales,11000);
 assert.equal(model.forecastFYRows[0].operating_profit,2200);
 assert.ok(model.cumulativeRows.every(r=>r.period.endsWith('-08-31')));
 assert.ok(model.cumulativeRows.every(r=>r.sales!==60322));
 const q4=model.standaloneRows.find(r=>r.period==='2026-08-31'&&r.quarter==='FY')!;
 assert.equal(q4.sales,3885);
 assert.equal(q4.operatingProfit,535);
});

test('276A FinancialsTable SSR renders annual and standalone Q4 values without foreign issuer rows',()=>{
 const html=renderToStaticMarkup(<FinancialsTable data={rows} loading={false} segments={[]}/>);
 const fy=rowHtml(html,'cumulative','2026-08-31','FY');
 assert.match(fy,/>7,020</);
 assert.match(fy,/>1,144</);
 const q4=rowHtml(html,'standalone','2026-08-31','FY');
 assert.match(q4,/>3,885</);
 assert.match(q4,/>535</);
 assert.doesNotMatch(html,/60,322|2027-03-31|2026-03-31/);
 assert.match(html,/11,000/);
});
