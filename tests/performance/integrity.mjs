import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { sortAlertsByDisclosureTimeAndTicker } from '../../lib/tdnet-alerts/sort.ts';
const output=path.resolve('../metrics');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Tokyo'});
await context.route('**/*',r=>['http://127.0.0.1:4174','http://127.0.0.1:4175'].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
const before=await context.newPage(),after=await context.newPage();
const errors=[];after.on('pageerror',e=>errors.push(e.message));
await before.goto('http://127.0.0.1:4174/?session=integrity-before-'+Date.now());
await after.goto('http://127.0.0.1:4175/?delay=10&session=integrity-after-'+Date.now());
async function wait(page){await page.waitForFunction(()=>!document.querySelector('.loading-message')&&!document.querySelector('[role=alert]'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function date(page,day){await page.evaluate(day=>{const el=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,day);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},day);await wait(page);}
const reports=[];
for(const day of ['2026-11-09','2026-11-13']){
 await date(before,day);await date(after,day);
 const expected=await before.locator('.alert-card').allTextContents();
 const source=JSON.parse(readFileSync(path.resolve('../data/'+day+'.json'),'utf8'));
 const ids=sortAlertsByDisclosureTimeAndTicker(source).map(r=>r.id);
 assert.equal(ids.length,expected.length,'source and original visible IDs');
 const seen=new Map();let maximum=0;
 for(let step=0;step<1500;step++){
  const state=await after.evaluate(()=>{const pane=document.querySelector('.alerts-list-pane');const rows=[...document.querySelectorAll('.virtual-alert-list > [role=listitem]')].map(el=>({index:Number(el.dataset.index),id:el.dataset.eventId,text:el.querySelector('.alert-card').textContent,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));return {rows,top:pane.scrollTop,bottom:pane.scrollHeight-pane.clientHeight};});
  maximum=Math.max(maximum,state.rows.length);assert.ok(state.rows.length<50);
  for(let i=0;i<state.rows.length;i++){
    const row=state.rows[i];assert.equal(row.id,ids[row.index],`${day} ID ${row.index}`);
    assert.equal(row.text,expected[row.index],`${day} card text ${row.index}`);
    if(i)assert.ok(Math.abs(row.top-state.rows[i-1].bottom)<2,'no overlap or gap');
    seen.set(row.index,row.id);
  }
  if(seen.size===ids.length)break;
  await after.evaluate(()=>{const p=document.querySelector('.alerts-list-pane');p.scrollTop+=500;});
  await after.waitForTimeout(25);
 }
 assert.equal(seen.size,ids.length);assert.equal(new Set(seen.values()).size,ids.length);
 reports.push({day,cards:seen.size,maxMounted:maximum,allTextsAndIdsEqual:true});
 console.log('all cards verified',day,seen.size,maximum);
}
await after.evaluate(()=>document.querySelector('.alerts-list-pane').scrollTop=0);await after.waitForTimeout(100);
await before.evaluate(()=>document.querySelector('.alerts-list-pane').scrollTop=0);
const firstId=await after.locator('.alert-card').first().getAttribute('data-event-id');
await before.locator('.alert-card').first().click();await after.locator('.alert-card').first().click();
await before.waitForSelector('.pl-scroll-area');await after.waitForSelector('.pl-scroll-area');
await after.waitForTimeout(150);
assert.equal(await after.locator('.alert-card.expanded').first().innerText(),await before.locator('.alert-card.expanded').first().innerText(),'expanded full text parity');
const first=after.locator(`.alert-card[data-event-id="${firstId}"]`);
await first.locator('.card-pin-btn').click();
await after.evaluate(()=>document.querySelector('.alerts-list-pane').scrollTop=100000);await after.waitForTimeout(100);
assert.equal(await first.count(),0,'offscreen pin does not keep DOM alive');
await after.evaluate(()=>document.querySelector('.alerts-list-pane').scrollTop=0);await after.waitForTimeout(100);
assert.equal(await first.locator('.card-pin-btn').getAttribute('aria-pressed'),'true');
await first.locator('[title="未読に戻す"]').click();await after.waitForTimeout(100);assert.match(await first.getAttribute('class'),/unread/);
await first.locator('[title="既読にする"]').click();await after.waitForTimeout(100);assert.ok(!(await first.getAttribute('class')).includes('unread'));
await first.locator('[title="スター"]').click();await after.waitForTimeout(100);assert.match(await first.locator('[title="スター"]').textContent(),/⭐/);
const queryCount=await after.evaluate(()=>window.__queries.length);
await after.locator('#right-tab-detail').click();await after.waitForTimeout(200);
await after.locator('#right-tab-company').click();await after.locator('#right-tab-detail').click();await after.waitForTimeout(150);
const detailLoads=await after.evaluate(n=>window.__queries.slice(n).filter(q=>q.table==='tdnet_events'&&q.calls.some(c=>c[0]==='single')).length,queryCount);
assert.equal(detailLoads,1,'full detail cached across tab round trips');
await after.locator('#right-tab-company').click();
const tail=sortAlertsByDisclosureTimeAndTicker(JSON.parse(readFileSync('../data/2026-11-13.json','utf8'))).at(-1);
await after.getByLabel('通知の企業検索').fill(tail.ticker);await after.waitForTimeout(350);await wait(after);
assert.ok((await after.locator('.stat-badge.total').textContent()).includes('件'));
const searched=await after.locator('.virtual-alert-list > [role=listitem]').evaluateAll(els=>els.map(e=>e.dataset.eventId));
assert.ok(searched.includes(tail.id),'search reaches the last card beyond first 1000');
await after.getByLabel('通知の企業検索').fill('');await after.waitForTimeout(350);await wait(after);
await after.getByLabel('通知の分類').selectOption('discord');await wait(after);
await after.locator('#discord-sort-category').click();await after.waitForTimeout(100);
assert.ok(await after.locator('.alert-card').count()>0);
await after.getByLabel('通知の分類').selectOption('all');await wait(after);
// An insert for a different day must not contaminate the selected date.
await after.evaluate(()=>window.__emitInsert({id:'other-day',ticker:'0000',headline:'別日の開示',event_type:'dividend',disclosed_at:'2020-01-01T00:00:00Z'}));
await after.waitForTimeout(600);await wait(after);
assert.equal(await after.locator('[data-event-id="other-day"]').count(),0);
// Cancel a pending old-date request by changing dates quickly.
await after.evaluate(()=>{for(const day of ['2026-11-09','2026-11-13']){const el=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,day);el.dispatchEvent(new Event('change',{bubbles:true}));}});
await after.waitForTimeout(600);await wait(after);
assert.match(await after.locator('.stat-badge.total').textContent(),/1841/);
await after.setViewportSize({width:390,height:844});
await after.getByRole('button',{name:'← 通知一覧',exact:true}).click();
await after.evaluate(()=>document.querySelector('.alerts-list-pane').scrollTop=1800);await after.waitForTimeout(100);
const listTop=await after.locator('.alerts-list-pane').evaluate(e=>e.scrollTop);
await after.locator('.virtual-alert-list > [role=listitem]').filter({has:after.locator('.alert-card')}).nth(7).locator('.alert-card').click();
await after.getByRole('button',{name:'← 通知一覧',exact:true}).click();await after.waitForTimeout(100);
assert.ok(Math.abs(await after.locator('.alerts-list-pane').evaluate(e=>e.scrollTop)-listTop)<2,'mobile scroll restored');
assert.deepEqual(errors,[]);
// Continuous updates during a slow day fetch must not starve the first render.
const burst=await context.newPage();
await burst.goto('http://127.0.0.1:4175/?delay=100&session=burst-'+Date.now());
await wait(burst);
await burst.evaluate(()=>{window.__burst=setInterval(()=>window.__emitUpdate(),60);});
await date(burst,'2026-11-13');
assert.match(await burst.locator('.stat-badge.total').textContent(),/1841/);
await burst.evaluate(()=>clearInterval(window.__burst));await burst.close();
writeFileSync(path.join(output,'integrity.json'),JSON.stringify({reports,expandedTextParity:true,pinSurvivesVirtualUnmount:true,readUnread:true,star:true,detailLoads,tailSearch:true,discordSort:true,realtimeDateIsolation:true,rapidDates:true,mobileScroll:true,continuousUpdates:true,errors},null,2));
await browser.close();console.log('All offline integrity checks passed');
