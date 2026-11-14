import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true});const results=[];
for(const variant of ['before','after'])for(const day of ['2026-11-09','2026-11-13']){
 const url=variant==='before'?'http://127.0.0.1:4174':'http://127.0.0.1:4175';
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Tokyo'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
 const page=await context.newPage();await page.goto(url+'/?session=normal-scroll-'+variant+day+Date.now());
 await page.waitForFunction(()=>!document.querySelector('.loading-message'));
 await page.evaluate(day=>{const el=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,day);el.dispatchEvent(new Event('change',{bubbles:true}));},day);
 await page.waitForFunction(()=>!document.querySelector('.loading-message')&&document.querySelector('.alert-card'));
 await page.locator('.alert-card').first().click();await page.waitForSelector('.pl-scroll-area');await page.waitForTimeout(200);
 for(let run=0;run<3;run++){
  const result=await page.evaluate(async()=>{const pane=document.querySelector('.alerts-list-pane');pane.scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const frames=[];let last=performance.now();for(let i=0;i<180;i++){await new Promise(r=>requestAnimationFrame(t=>{frames.push(t-last);last=t;pane.scrollTop+=i<90?80:-80;r();}));}frames.shift();frames.sort((a,b)=>a-b);return {p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1),over50:frames.filter(x=>x>50).length};});
  results.push({variant,day,run,...result});console.log(JSON.stringify(results.at(-1)));
 }
 await context.close();
}
writeFileSync('../metrics/normal-scroll.json',JSON.stringify(results,null,2));await browser.close();
