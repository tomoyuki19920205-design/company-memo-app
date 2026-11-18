import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCalendarBatches} from '../lib/earnings-calendar-batch';

test('calendar batches bound concurrent financial loads and deduplicate codes',async()=>{
 let active=0,peak=0;const codes=Array.from({length:101},(_,i)=>String(i));
 const result=await loadCalendarBatches([...codes,...codes],async group=>{
  active++;peak=Math.max(peak,active);assert.ok(group.length<=20);
  await new Promise(resolve=>setTimeout(resolve,1));active--;return group;
 });
 assert.equal(peak,2);assert.equal(result.errors.size,0);
 assert.deepEqual(result.results.flatMap(r=>r.value).sort(),codes.sort());
});
test('timeouts split only the failed group and preserve unrelated successes',async()=>{
 const codes=Array.from({length:45},(_,i)=>String(i));const calls:string[][]=[];
 const result=await loadCalendarBatches(codes,async group=>{
  calls.push(group);
  if(group.includes('0'))throw new Error('canceling statement due to statement timeout');
  return group;
 });
 assert.equal(result.errors.size,10);assert.ok(result.errors.has('0'));
 assert.equal(result.results.flatMap(r=>r.value).length,35);
 assert.equal(calls.filter(g=>g.includes('20')).length,1);
 assert.equal(calls.filter(g=>g.includes('10')).length,2);
});
test('permission failures are not retried or treated as absent financial data',async()=>{
 let calls=0;const result=await loadCalendarBatches(['1111','2222'],async()=>{calls++;throw new Error('permission denied');});
 assert.equal(calls,1);assert.equal(result.results.length,0);assert.equal(result.errors.size,2);
});
