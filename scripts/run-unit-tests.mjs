import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// This existing test reads live Supabase data; run it explicitly via test:source-priority.
const integrationTests = new Set(['test_source_priority_view.ts']);
const tests = readdirSync('tests').filter(name => /^test_.*\.(?:tsx?|mjs)$/.test(name) && !integrationTests.has(name));
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests.map(name => `tests/${name}`)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
