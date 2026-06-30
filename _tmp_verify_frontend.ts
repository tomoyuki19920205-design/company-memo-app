import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fetchEvents } from './lib/tdnet-alerts/queries';
import { fetchLatestFinancials } from './lib/viewer-api';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  console.log("=== CHECKING FRONTEND API BEHAVIOR ===");
  
  const { data: events } = await fetchEvents(supabase, { userId: "test", limit: 100 });
  
  const targetTickers = ['5032', '186A', '215A', '2897', '2928'];
  
  console.log("\n--- 騾夂衍繧ｫ繝ｼ繝臥畑繝・・繧ｿ ---");
  for (const ticker of targetTickers) {
    const e = events?.find(ev => ev.ticker === ticker);
    if (!e) continue;
    
    // We expect reconstructedPayload to have extracted
    const extracted = e.reconstructedPayload?.extracted;
    const guidance = extracted?.guidance;
    const yoy = extracted?.notification_compare_json?.primary_metric?.yoy_percent;
    
    console.log(`[${ticker}] sales_forecast=${guidance?.sales_forecast}, op_forecast=${guidance?.op_forecast}, op_yoy=${yoy ? (yoy * 100).toFixed(1) + '%' : 'None'}`);
  }

  console.log("\n--- Company Viewer逕ｨ繝・・繧ｿ ---");
  for (const ticker of targetTickers) {
    const { data: fin } = await fetchLatestFinancials(supabase, ticker);
    if (!fin) continue;
    
    // Assuming fin is an array or object
    const latest = Array.isArray(fin) ? fin[0] : fin;
    if (latest) {
      console.log(`[${ticker}] period=${latest.period}, sales=${latest.sales}, op=${latest.operating_profit}`);
    } else {
      console.log(`[${ticker}] No financials found`);
    }
  }
}

main().catch(console.error);
