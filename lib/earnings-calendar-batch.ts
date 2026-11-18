// Limit pressure on the existing financial views. No value transformation here.
// A failed group must not discard successful groups or mark the entire day failed.
export async function loadCalendarBatches<T>(codes:string[],load:(codes:string[])=>Promise<T>) {
  const unique=[...new Set(codes)],groups=Array.from({length:Math.ceil(unique.length/20)},(_,i)=>unique.slice(i*20,i*20+20));
  const results:{codes:string[];value:T}[]=[],errors=new Map<string,string>();let next=0;
  async function fetch(group:string[],canSplit=true):Promise<void> {
    try {results.push({codes:group,value:await load(group)});}
    catch(e) {
      const message=e instanceof Error?e.message:String(e);
      if(canSplit&&group.length>10&&/timeout|timed out|503|502|504|fetch failed/i.test(message)) {
        for(let i=0;i<group.length;i+=10)await fetch(group.slice(i,i+10),false);
      } else for(const code of group)errors.set(code,message);
    }
  }
  await Promise.all(Array.from({length:Math.min(2,groups.length)},async()=>{
    while(next<groups.length) {const group=groups[next++];await fetch(group);}
  }));
  return {results,errors};
}
