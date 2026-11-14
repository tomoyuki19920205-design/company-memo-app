TDNET offline performance / integrity harness

This harness is outside app/ and is never a deployed route. It bundles the real
AlertsPage, CompanyViewer, CSS, and data-fetching code in production profiling
mode. Authentication, realtime and PostgREST are loopback-only fixtures. No
production credentials are loaded, and browser requests to other origins are
blocked by the runners. Read/star actions change only an in-memory fixture.

Setup: npm ci --ignore-scripts; install the Playwright Chromium browser if needed.
Run from the repository root. Use environment variable PLAYWRIGHT_BROWSERS_PATH
if sharing an existing Playwright browser installation.

node tests/performance/server.mjs
  Default address: 127.0.0.1:4175
  PERF_SOURCE: source checkout to bundle (default current checkout).
  PERF_DATA: directory containing 2026-11-09.json and 2026-11-13.json.
  PORT: loopback port.
  Without snapshot files the server generates deterministic 40/2501-row data.
  Never point this server at a production database: it has no DB connection code.

PERF_URL=http://127.0.0.1:4175 PERF_LABEL=after node tests/performance/measure.mjs
  Run before and after sequentially, with no concurrent test/build work.
  Each day runs three times in a fresh browser context, 1440x900, Asia/Tokyo,
  Chromium headless, CPU throttle 4x, 30 ms deterministic API latency per call.
  The list uses actual snapshot payloads. PL uses the existing financial test
  fixture; this does not measure production PL API or authenticated network latency.
  Results: ../metrics/*.json, screenshots and Chrome DevTools-readable traces.
  JS heap is collected after GC, not Chrome's process working set/RSS.
  Scroll test: 120 animation frames, 420 px per frame, reversing after 60 frames.
  A 60-second background refresh remains enabled, as in the real application.

node tests/performance/scroll.mjs
  Supplementary normal-CPU test: 80 px/frame, 180 frames, three runs per day
  and implementation. Uses ports 4174/4175 sequentially. No CPU throttling.
  Results: ../metrics/normal-scroll.json.

node --import tsx tests/performance/integrity.mjs
  Requires before on 4174 and after on 4175 with matching real snapshots.
  Reads ../data/2026-11-{09,13}.json locally, visits every virtual index, and
  compares every ID/order/collapsed text to the original implementation. Also
  checks expanded text, pins across unmount, read/unread, stars, full-detail cache,
  last-card search, Discord sorting, date changes, realtime date isolation,
  mobile scroll restoration and rendering during continuous update notifications.

The private working snapshots are intentionally NOT checked in or included in
the deliverable patch. They contain notification raw payloads. The source has no
AI generation calls. Do not add credentials, runtime settings or data exports to
the repository when reproducing this test.
