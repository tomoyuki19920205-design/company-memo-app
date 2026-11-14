const params = new URLSearchParams(location.search);
const session = params.get('session') || crypto.randomUUID();
window.__queries=[];
function from(table) {
  const calls=[]; let signal;
  const proxy=new Proxy({}, {get(_,key){
    if(key==='then') return (resolve,reject)=>{
      const start=performance.now();
      return fetch('/fixture-query',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({table,calls,session,delay:Number(params.get('delay')||0)})}).then(r=>r.text()).then(text=>{
        window.__queries.push({table,calls,start,ms:performance.now()-start,bytes:new TextEncoder().encode(text).length});
        return JSON.parse(text);
      }).then(resolve,reject);
    };
    return (...args)=>{if(key==='abortSignal')signal=args[0];else calls.push([key,...args]);return proxy;};
  }});
  return proxy;
}
const user={id:'perf-user',email:'offline@example.test'};
const listeners=[];
window.__emitUpdate=()=>listeners.filter(x=>x.event==='UPDATE').forEach(x=>x.callback({new:{}}));
window.__emitInsert=(row)=>listeners.filter(x=>x.event==='INSERT').forEach(x=>x.callback({new:row}));
const client={from,rpc:()=>from('empty'),channel:()=>({on(_type,filter,callback){listeners.push({...filter,callback});return this;},subscribe(callback){callback?.('SUBSCRIBED');return this;},unsubscribe(){},track:async()=>{},untrack:async()=>{},presenceState:()=>({})}),removeChannel(){},auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
export const createSupabaseBrowser=()=>client;
