# KPI browser and performance fixture

`bench.tsx` mounts the production `FinancialsTable` and KPI editor with synthetic
data. It never calls the backend. Saved test values use sessionStorage only.
The ordinary PL window has at most 60 KPI cells (5 fiscal periods × 4 quarters
× 3 slots); the stress fixture uses 167 synthetic Txxx period rows / 501 cells
in every condition, with 0, 100 or 500 formulas. All stress formulas depend on
KPI A1, so editing A1 exercises the entire dependent set.

To run on Windows from an isolated checkout:

```powershell
New-Item -ItemType Directory -Path app/auth/kpi-bench -Force | Out-Null
Set-Content -LiteralPath app/auth/kpi-bench/page.tsx -Value 'export { default } from "../../../tests/kpi/bench";'
npm run build -- --profile
npm run start -- --port 4173 --hostname 127.0.0.1
```

Use `/auth/kpi-bench` locally. Profiling is an optimized production build with
React Profiler enabled. Compare all conditions in the same build/browser and
viewport. Select KPI A1, use the formula bar and Enter to change its numeric
input, then exercise the scroll and ticker-switch buttons. Discard the first
sample and report the median and maximum of five subsequent samples.

Metrics:

- `computeMs`: formula engine updates, including graph/cache maintenance.
- `evaluateMs`: expression evaluation (a subset of computeMs).
- `reactRenderMs`: React Profiler actual duration, subtracting formula engine
  initialization executed inside a render, to avoid counting it twice.
- `domMs`: elapsed time to the last observed DOM mutation, minus compute time;
  this includes scheduling and is not pure render CPU time.
- `totalMs`: confirmation/action to two animation frames; includes scheduling,
  layout and frame waiting. Scroll has no React render or formula evaluation,
  so use its frame completion time, not reactRenderMs.

The fixture prepares synthetic ticker data before starting the switch timer.
No network latency is included. Also repeat commit latency in a normal
`npm run build` without profiling. This is a comparative local measurement,
not a guarantee for every user's hardware/browser.

After stopping the local server, delete the temporary **page.tsx** and its
empty **kpi-bench** directory before the final build and GitHub push. Do not
deploy the test route. The test fixture itself remains unlinked in tests/.
