const fs = require('fs');

async function main() {
  const file = fs.readFileSync('_tmp_events.json', 'utf8');
  let events = JSON.parse(file);
  // filter 05/15 earnings
  events = events.filter(e => {
    const d = new Date(e.detected_at);
    return e.event_type === "earnings" && d.getMonth() === 4 && d.getDate() === 15;
  });

  console.log(`Found ${events.length} events for 05/15 earnings.`);
}

main().catch(console.error);
