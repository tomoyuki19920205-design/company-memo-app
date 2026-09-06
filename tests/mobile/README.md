# Mobile regression checks

Run `npm ci`, `npx playwright install chromium webkit`, then `npm run test:mobile`.
`npm test` runs all local unit tests. `npm run typecheck` and `npm run build` check the production app.

The browser harness bundles the real NewsMonitor, AlertsPage, CompanyViewer and ScreenerPage components with the real global CSS. Only Supabase, Next navigation and the screening HTTP boundary are replaced by deterministic fixtures. It never uses live credentials or writes to a backend. The harness is outside the Next app routes and is not published as an application endpoint.

Coverage:

- 390×844 Chromium and WebKit: news full report/back/list scroll restoration; TDNET unselected search, selection/reselection and list scroll preservation.
- PL and segment tables, per-share metrics, order KPIs, EDINET orders, monthly, forecast, other KPI tables and screening results: bounded viewport, native overflow ownership and rightmost scroll position.
- Chromium additionally sends native touch input to each table viewport. WebKit checks layout and scrolling, but is not a physical iPhone Safari gesture test.
- 1440×900: NEWS and TDNET retain both panes and resizing. 900/901px: breakpoint switching.
- Screenshots and failure traces are saved in ignored `test-results/`.

## DOM audit

On mobile, `.company-page-wide-content` no longer has its desktop `min-width: max-content`. Its flex/grid ancestors are allowed to shrink (`min-width: 0; max-width: 100%`). The table viewport inside each section owns `overflow-x: auto` and `touch-action: pan-x pan-y`. The desktop page scrollbar remains unchanged. `.segment-group` previously clipped its table and now scrolls on mobile. Generic `ResizableTable` wrappers now retain column widths inside their own scroll viewport. The screening grid's result track remains shrinkable, and its column drag handles are hidden on mobile to leave the touch surface clear.

The TDNET outer vertical flex shell keeps its intentional clipping and uses `100dvh`; its mobile detail pane overrides the desktop 420px minimum. Hidden panes stay mounted, preserving scroll and input state. NEWS hides the list/filters while a report is open and restores the saved page scroll position on return.

## Existing live integration check

`npm run test:source-priority` separately runs the existing read-only Supabase integration test using `.env.local`. On 2026-09-06 it failed because its source allowlist does not include the live `backfill_xbrl` value. The test and backend were left unchanged. This is independent of the mobile UI changes.
