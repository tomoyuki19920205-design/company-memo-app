const fs=require("fs");
const txt=fs.readFileSync(".env.local","utf8");
for (const line of txt.split(/\r?\n/)) {
  const m=line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let [,k,v]=m;
  v=v.replace(/^["']|["']$/g,"");
  process.env[k.trim()]=v.trim();
}
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  for (const t of ["1736","2590"]) {
    const { count, error } = await supabase
      .from("segment_canonical")
      .select("*", { count:"exact", head:true })
      .eq("ticker", t);
    console.log(t, error ? error.message : count);
  }
  process.exit(0);
})();
