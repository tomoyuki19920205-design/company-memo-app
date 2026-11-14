import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const url=process.env.PERF_URL||'http://127.0.0.1:4174';
const label=process.env.PERF_LABEL||'before';
const output=path.resolve(process.env.PERF_OUTPUT||'../metrics');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-precise-memory-info']});
const results=[];
for(const day of ['2026-11-09','2026-11-13']) for(let run=0;run<3;run++){
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Tokyo'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 const page=await context.newPage(); const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.addInitScript(()=>{window.__long=[];new PerformanceObserver(list=>window.__long.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
 await page.goto(url+'/?delay=30&session='+label+day+run);
 await page.waitForFunction(()=>!document.querySelector('.loading-message'));
 if(day==='2026-11-13' && run===0)await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing',transferMode:'ReturnAsStream'});
 async function date(d){return page.evaluate(d=>{const start=performance.now();const el=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,d);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return start;},d);}
 const start=await date(day);
 await page.waitForFunction(()=>!document.querySelector('.loading-message')&&document.querySelectorAll('.alert-card').length>0);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const initial=await page.evaluate(start=>({displayMs:performance.now()-start,cardDOM:document.querySelectorAll('.alert-card').length,dom:document.querySelectorAll('*').length,countText:document.querySelector('.stat-badge.total').textContent,reactMs:window.__commits.filter(c=>c.at>start).reduce((n,c)=>n+c.duration,0),commits:window.__commits.filter(c=>c.at>start).length,queries:window.__queries.map(q=>({table:q.table,ms:q.ms,bytes:q.bytes})),long:window.__long.filter(x=>x.start>=start)}),start);
 await cdp.send('HeapProfiler.collectGarbage');const heap=(await cdp.send('Runtime.getHeapUsage')).usedSize;
 const selectStart=await page.evaluate(()=>{
   document.querySelector('.alert-card').addEventListener('click',()=>{const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__cardPaintMs=performance.now()-t));},{once:true,capture:true});
   return performance.now();
 });
 await page.locator('.alert-card').first().click();
 await page.waitForSelector('.pl-scroll-area',{timeout:30000});
 await page.waitForFunction(()=>!document.querySelector('.cvs-body')?.textContent.includes('データ読み込み中'));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const selection=await page.evaluate(start=>({ms:performance.now()-start,cardPaintMs:window.__cardPaintMs,reactMs:window.__commits.filter(c=>c.at>start).reduce((n,c)=>n+c.duration,0),commits:window.__commits.filter(c=>c.at>start).length}),selectStart);
 const scroll=await page.evaluate(async()=>{const pane=document.querySelector('.alerts-list-pane');const frames=[];const start=performance.now();let last=start;for(let i=0;i<120;i++){await new Promise(r=>requestAnimationFrame(t=>{frames.push(t-last);last=t;pane.scrollTop+=i<60?420:-420;r();}));}frames.shift();frames.sort((a,b)=>a-b);return {p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1),over50:frames.filter(x=>x>50).length,ms:performance.now()-start,dom:document.querySelectorAll('*').length,cardDOM:document.querySelectorAll('.alert-card').length};});
 const switchStart=await date(day==='2026-11-13'?'2026-11-09':'2026-11-13');
 await page.waitForFunction(()=>!document.querySelector('.loading-message')&&document.querySelectorAll('.alert-card').length>0);
 const switchMs=await page.evaluate(start=>performance.now()-start,switchStart);
 const backStart=await date(day);await page.waitForFunction(()=>!document.querySelector('.loading-message')&&document.querySelectorAll('.alert-card').length>0);
 const returnMs=await page.evaluate(start=>performance.now()-start,backStart);
 await cdp.send('HeapProfiler.collectGarbage');const finalHeap=(await cdp.send('Runtime.getHeapUsage')).usedSize;
 if(run===0){await page.screenshot({path:path.join(output,`${label}-${day}.png`)});}
 if(day==='2026-11-13' && run===0){const complete=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await complete;let trace='';for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});writeFileSync(path.join(output,label+'-trace.json'),trace);}
 const errors=await page.evaluate(()=>window.__errors);
 results.push({day,run,...initial,heapBytes:heap,selection,scroll,switchMs,returnMs,finalHeapBytes:finalHeap,errors});
 console.log(JSON.stringify({label,day,run,displayMs:initial.displayMs,dom:initial.dom,cards:initial.cardDOM,heapMiB:heap/1048576,selectMs:selection.ms,scrollP95:scroll.p95}));
 writeFileSync(path.join(output,label+'.json'),JSON.stringify(results,null,2));await context.close();
}
await browser.close();
