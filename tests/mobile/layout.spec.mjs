import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
});

async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}
async function scrollToEnd(locator) {
  await expect(locator).toBeVisible();
  if (test.info().project.name === 'chromium') await swipe(locator);
  const metrics = await locator.evaluate(el => {
    el.scrollLeft = el.scrollWidth;
    const style = getComputedStyle(el);
    return { width: el.clientWidth, total: el.scrollWidth, left: el.scrollLeft, overflow: style.overflowX, touch: style.touchAction };
  });
  expect(metrics.overflow).toBe('auto');
  expect(metrics.total).toBeGreaterThan(metrics.width);
  expect(metrics.left).toBeGreaterThan(0);
  expect(Math.abs(metrics.total - metrics.width - metrics.left)).toBeLessThanOrEqual(1);
  expect(metrics.touch).toBe('pan-x pan-y');
}
async function swipe(locator) {
  const page = locator.page();
  await locator.evaluate(el => { el.scrollLeft = 0; });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const y = Math.min(box.y + Math.min(55, box.height - 5), 780);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
  for (let x = 300; x >= 60; x -= 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  // Finish with the finger at rest so CDP does not leave an artificial high-speed fling.
  await page.waitForTimeout(150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => locator.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  // Let native momentum finish before the next tap (a tap during inertia stops scrolling).
  let previous = -1;
  let stable = 0;
  await expect.poll(async () => {
    const left = await locator.evaluate(el => el.scrollLeft);
    stable = Math.abs(left - previous) < 1 ? stable + 1 : 0;
    previous = left;
    return stable;
  }, { intervals: [100], timeout: 5000 }).toBeGreaterThanOrEqual(3);
  await cdp.detach();
}
test('news taps open full report, back restores list position, desktop retains splitter', async ({ page }) => {
  await page.goto('/?screen=news');
  const card = page.locator('.news-card').nth(8);
  await card.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await card.tap();
  await expect(page.locator('.news-feed')).toBeHidden();
  await expect(page.getByText('全文レポート', { exact: true })).toBeVisible();
  await fits(page);
  await page.screenshot({ path: test.info().outputPath('news-mobile.png') });
  await page.getByRole('button', { name: '← ニュース一覧' }).tap();
  await expect(page.locator('.news-detail')).toBeHidden();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.news-feed')).toBeVisible();
  await expect(page.locator('.news-detail')).toBeVisible();
  await expect(page.locator('.news-pane-splitter')).toBeVisible();
  const before = await page.locator('.news-feed').boundingBox();
  await page.locator('.news-pane-splitter').focus();
  await page.keyboard.press('ArrowLeft');
  expect((await page.locator('.news-feed').boundingBox()).width).toBeLessThan(before.width);
});
test('TDNET opens viewer without selection, selects and reselects cards, preserves list and desktop panes', async ({ page }) => {
  await page.goto('/?screen=tdnet');
  await page.getByRole('button', { name: 'Company Viewer', exact: true }).tap();
  await expect(page.locator('#ticker-input')).toBeVisible();
  await page.locator('#ticker-input').fill('418A');
  await page.getByRole('button', { name: '読込', exact: true }).tap();
  await expect(page.locator('.pl-scroll-area').first()).toBeVisible();
  await fits(page);
  await page.getByRole('button', { name: '← 通知一覧' }).tap();
  const list = page.locator('.alerts-list-pane');
  const cards = page.locator('.alert-card');
  await cards.nth(5).scrollIntoViewIfNeeded();
  const listScroll = await list.evaluate(el => el.scrollTop);
  await cards.nth(5).tap();
  await expect(list).toBeHidden();
  await expect(page.locator('#ticker-input')).toBeVisible();
  await page.getByRole('button', { name: '← 通知一覧' }).tap();
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeCloseTo(listScroll, 0);
  await cards.nth(5).tap();
  await expect(list).toBeHidden();
  await expect(page.locator('.pl-scroll-area').first()).toBeVisible();
  await fits(page);
  await page.screenshot({ path: test.info().outputPath('tdnet-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(list).toBeVisible();
  await expect(page.locator('.alerts-detail-pane')).toBeVisible();
  const divider = await page.locator('.pane-divider').boundingBox();
  const before = (await list.boundingBox()).width;
  await page.mouse.move(divider.x + 2, divider.y + 50);
  await page.mouse.down(); await page.mouse.move(divider.x + 62, divider.y + 50); await page.mouse.up();
  expect((await list.boundingBox()).width).toBeGreaterThan(before);
});
test('viewer table viewports reach the right edge without widening the page', async ({ page }) => {
  await page.goto('/?ticker=418A');
  await expect(page.locator('.pl-scroll-area').first()).toBeVisible();
  await fits(page);
  await page.getByRole('button', { name: 'ORDER KPI', exact: true }).tap();
  for (const selector of ['.pl-scroll-area', '.per-share-table-wrap', '.order-kpi-table-wrap', '.table-wrapper']) {
    const wrappers = page.locator(selector);
    expect(await wrappers.count()).toBeGreaterThan(0);
    for (const wrapper of await wrappers.all()) await test.step(selector, () => scrollToEnd(wrapper));
  }
  await page.locator('.order-kpi-tab-btn').filter({ hasText: 'EDINET' }).tap();
  await scrollToEnd(page.locator('.edinet-order-table-wrap'));
  await fits(page);
  expect(await page.locator('#ticker-input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: test.info().outputPath('viewer-mobile.png') });
});
test('screening results scroll independently and accept a native touch swipe in Chromium', async ({ page }) => {
  await page.goto('/?screen=screening');
  await expect(page.locator('.screener-results tbody tr')).toHaveCount(1);
  const results = page.locator('.screener-results');
  await fits(page);
  await scrollToEnd(results);
  await page.screenshot({ path: test.info().outputPath('screening-mobile.png') });
});

test('900px breakpoint switches panes without losing selection', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 844 });
  await page.goto('/?screen=news');
  await page.locator('.news-card').first().tap();
  await expect(page.locator('.news-feed')).toBeHidden();
  await expect(page.locator('.news-detail')).toBeVisible();
  await page.setViewportSize({ width: 901, height: 844 });
  await expect(page.locator('.news-feed')).toBeVisible();
  await expect(page.locator('.news-pane-splitter')).toBeVisible();
  await page.goto('/?screen=tdnet');
  await expect(page.locator('.alerts-list-pane')).toBeVisible();
  await expect(page.locator('.alerts-detail-pane')).toBeVisible();
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(page.locator('.alerts-detail-pane')).toBeHidden();
  await page.getByRole('button', { name: 'Company Viewer', exact: true }).tap();
  await expect(page.locator('.alerts-detail-pane')).toBeVisible();
  await expect(page.locator('.alerts-list-pane')).toBeHidden();
});
