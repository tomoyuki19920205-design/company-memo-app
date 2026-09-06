import { test, expect } from '@playwright/test';
import { fullMemo, longCompanyName } from './focus-fixtures.mjs';
import { writeFile } from 'node:fs/promises';

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
  await expect(page.locator('.ticker-badge')).toHaveText('418A');
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

test('notification selection waits for slow viewer auth and detail tabs preserve loaded data', async ({ page }) => {
  await page.goto('/?screen=tdnet&delayAuth=1500');
  await page.locator('.alert-card').first().tap();
  await expect(page.locator('.alerts-list-pane')).toBeHidden();
  await expect(page.locator('.pl-scroll-area').first()).toBeVisible();
  await expect(page.locator('#ticker-input')).toHaveValue('418A');
  await page.locator('#right-tab-detail').tap();
  await expect(page.locator('.detail-panel')).toBeVisible();
  await page.locator('#right-tab-company').tap();
  await expect(page.locator('.pl-scroll-area').first()).toBeVisible();
  await fits(page);
});

async function loadFocusViewer(page, extra = '') {
  await page.goto('/?screen=tdnet&fixtureTicker=7203' + extra);
  await page.getByRole('button', { name: 'Company Viewer', exact: true }).tap();
  await expect(page.locator('#ticker-input')).toBeVisible();
  await page.locator('#ticker-input').fill('7203');
  await page.getByRole('button', { name: '読込', exact: true }).tap();
  await expect(page.locator('.pl-row').first()).toBeVisible();
  await expect(page.locator('#ticker-input')).toBeHidden();
}

async function assertFocusGeometry(page) {
  const metrics = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
    };
    return { viewport: innerHeight, body: box('.company-viewer-scroll-body'), header: box('.viewer-header'), market: box('.valuation-card'),
      label: box('.formula-bar-label'), input: box('.formula-bar-input'),
      visible: ['.pl-section > .section-title', '.formula-bar', '.pl-row .num-col'].map(box),
      pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
  });
  expect(metrics.body.height).toBeGreaterThanOrEqual(metrics.viewport * .6);
  expect(metrics.body.bottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.header.height).toBeGreaterThanOrEqual(54);
  expect(metrics.header.height).toBeLessThanOrEqual(60);
  expect(metrics.market.height).toBeGreaterThanOrEqual(48);
  expect(metrics.market.height).toBeLessThanOrEqual(54);
  expect(metrics.label.height).toBeGreaterThanOrEqual(28);
  expect(metrics.label.height).toBeLessThanOrEqual(32);
  expect(metrics.input.y).toBeGreaterThanOrEqual(metrics.label.bottom);
  expect(metrics.input.width).toBeCloseTo(metrics.label.width, 0);
  for (const box of metrics.visible) {
    expect(box.y).toBeGreaterThanOrEqual(metrics.body.y);
    expect(box.bottom).toBeLessThanOrEqual(metrics.viewport);
  }
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  await test.info().attach('focus-geometry', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  await writeFile(test.info().outputPath('focus-geometry.json'), JSON.stringify(metrics, null, 2));
}

test('focus gives PL and full memos priority and preserves ticker, search and scroll across panes', async ({ page }) => {
  await loadFocusViewer(page);
  await expect(page.locator('.company-name')).toHaveText('トヨタ自動車');
  await assertFocusGeometry(page);
  await expect(page.locator('.alerts-header')).toBeHidden();
  await expect(page.locator('.mobile-pane-switch')).toBeHidden();
  await expect(page.getByRole('button', { name: '← 通知一覧' })).toHaveCount(1);
  await expect(page.locator('.formula-bar-resize-handle')).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('focus-initial.png') });
  await scrollToEnd(page.locator('.valuation-card'));
  await scrollToEnd(page.locator('.pl-scroll-area').first());
  const memo = page.locator('.manual-memo-cell').filter({ hasText: fullMemo }).first();
  await memo.tap();
  const formula = page.locator('.formula-bar-input');
  await expect(formula).toHaveValue(fullMemo);
  const style = await formula.evaluate(el => ({ size: parseFloat(getComputedStyle(el).fontSize), wrap: getComputedStyle(el).whiteSpace, overflow: getComputedStyle(el).overflowY, height: el.clientHeight, total: el.scrollHeight }));
  expect(style.size).toBeGreaterThanOrEqual(14);
  expect(style.wrap).toBe('pre-wrap');
  expect(style.overflow).toBe('auto');
  expect(style.total).toBeGreaterThan(style.height);
  await formula.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: test.info().outputPath('focus-memo.png') });
  const toggle = page.getByRole('button', { name: '検索・設定' });
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#ticker-input')).toBeVisible();
  await expect(page.locator('#viewer-controls').getByText('スクリーニング', { exact: true })).toBeVisible();
  await expect(page.locator('#viewer-controls').getByRole('button', { name: 'ログアウト' })).toBeVisible();
  await page.locator('#ticker-input').fill('検索途中');
  await toggle.tap();
  await expect(page.locator('#ticker-input')).toBeHidden();
  const body = page.locator('.company-viewer-scroll-body');
  const before = await body.evaluate(el => el.scrollTop);
  await page.getByRole('button', { name: '← 通知一覧' }).tap();
  await expect(page.locator('.alerts-header')).toBeVisible();
  await expect(page.locator('.mobile-pane-switch')).toBeVisible();
  await expect(page.getByRole('button', { name: '← 通知一覧' })).toBeHidden();
  await page.getByRole('button', { name: 'Company Viewer', exact: true }).tap();
  await expect(page.locator('.ticker-badge')).toHaveText('7203');
  await expect(page.locator('#ticker-input')).toHaveValue('検索途中');
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0);
  await expect(formula).toHaveValue(fullMemo);
  // Selecting a notification adds detail tabs; the height budget must still hold.
  await page.getByRole('button', { name: '← 通知一覧' }).tap();
  await page.locator('.alert-card').first().tap();
  await expect(page.locator('#right-tab-company')).toBeVisible();
  await assertFocusGeometry(page);
});

test('wide desktop retains the single-row header and direct search controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 844 });
  await page.goto('/?ticker=7203&fixtureTicker=7203');
  await expect(page.locator('.company-name')).toHaveText('トヨタ自動車');
  await expect(page.locator('#ticker-input')).toBeVisible();
  await expect(page.locator('.viewer-controls-toggle')).toBeHidden();
  const header = await page.locator('.viewer-header').boundingBox();
  expect(header.height).toBeLessThanOrEqual(60);
  await page.screenshot({ path: test.info().outputPath('desktop-header.png') });
});

test('full company names and focus breakpoint at 390, 900, 901 and 1440', async ({ page }) => {
  await loadFocusViewer(page, '&longName=1');
  const name = page.locator('.company-name');
  await expect(name).toHaveText(longCompanyName);
  for (const width of [390, 900, 901, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await name.evaluate(el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: r.x, right: r.right, total: el.scrollWidth, width: el.clientWidth, height: el.clientHeight, textOverflow: s.textOverflow, whiteSpace: s.whiteSpace };
    });
    expect(geometry.textOverflow).not.toBe('ellipsis');
    expect(geometry.total).toBeLessThanOrEqual(geometry.width + 1);
    if (width <= 900) {
      expect(geometry.right).toBeLessThanOrEqual(width);
      await expect(page.locator('.alerts-header')).toBeHidden();
      expect((await page.locator('.company-viewer-scroll-body').boundingBox()).height).toBeGreaterThanOrEqual(844 * .6);
    } else {
      await expect(page.locator('.alerts-header')).toBeVisible();
      await expect(page.locator('.alerts-list-pane')).toBeVisible();
      await expect(page.locator('.pane-divider')).toBeVisible();
      await expect(page.getByRole('button', { name: '← 通知一覧' })).toBeHidden();
      expect(geometry.whiteSpace).toBe('nowrap');
      // A very long desktop name remains one line and can be read in full.
      const title = await page.locator('.ticker-info').evaluate(el => {
        el.scrollLeft = el.scrollWidth;
        return { left: el.scrollLeft, width: el.clientWidth, total: el.scrollWidth };
      });
      expect(title.left + title.width).toBeGreaterThanOrEqual(title.total - 1);
      expect((await page.locator('.viewer-header').boundingBox()).height).toBeLessThanOrEqual(60);
    }
    await page.screenshot({ path: test.info().outputPath(`focus-long-name-${width}.png`) });
  }
});
