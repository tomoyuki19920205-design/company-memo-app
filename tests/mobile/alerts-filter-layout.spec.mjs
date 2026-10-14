import { test, expect } from '@playwright/test';

const options = [
  ['all', '全体'],
  ['starred', '⭐ スター'],
  ['buyback', '📊 自社株買'],
  ['forecast_up', '📈 上方修正'],
  ['forecast', '📉 業績修正'],
  ['dividend', '💰 配当'],
  ['earnings', '📋 決算'],
  ['management_strategy', '🧭 中期経営・戦略'],
  ['edinet_order', '📦 受注・受注残'],
  ['discord', '🔔 Discord対象'],
];

async function checkControlsFit(page, sameLine) {
  const geometry = await page.locator('.filter-bar').evaluate(bar => {
    const bounds = [...bar.children].filter(child => !child.classList.contains('date-picker-hidden'))
      .map(child => child.getBoundingClientRect().toJSON());
    return { bar: bar.getBoundingClientRect().toJSON(), bounds, pageWidth: document.documentElement.scrollWidth };
  });
  const [category, date, period, search] = geometry.bounds;
  expect(geometry.bounds).toHaveLength(4);
  expect(search.width).toBeGreaterThanOrEqual(200);
  for (const box of geometry.bounds) {
    expect(box.left).toBeGreaterThanOrEqual(geometry.bar.left - 1);
    expect(box.right).toBeLessThanOrEqual(geometry.bar.right + 1);
  }
  for (let i = 1; i < geometry.bounds.length; i++) {
    const previous = geometry.bounds[i - 1], current = geometry.bounds[i];
    expect(current.top > previous.top || current.left >= previous.right - 1).toBeTruthy();
  }
  if (sameLine) {
    const center = box => box.top + box.height / 2;
    expect(center(category)).toBeCloseTo(center(date), 0);
    expect(center(date)).toBeCloseTo(center(period), 0);
    expect(center(period)).toBeCloseTo(center(search), 0);
  }
  expect(geometry.pageWidth).toBeLessThanOrEqual(page.viewportSize().width + 1);
}

test('notification category select keeps all filters and ordered responsive controls', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-06T12:00:00+09:00') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?screen=tdnet&pinFixture=1');
  const select = page.getByRole('combobox', { name: '通知の分類' });
  await expect(select).toBeVisible();
  expect(await select.locator('option').evaluateAll(nodes => nodes.map(node => [node.value, node.textContent]))).toEqual(options);
  await expect(select).toHaveValue('all');
  await checkControlsFit(page, true);

  for (const [key, label] of options) {
    await select.selectOption(key);
    await expect(select).toHaveValue(key);
    await expect(select.locator('option:checked')).toHaveText(label);
  }
  await select.selectOption('dividend');
  await expect(page.locator('.alert-card')).toHaveCount(3);
  await select.selectOption('forecast');
  await expect(page.locator('.alert-card')).toHaveCount(0);
  await select.selectOption('starred');
  await expect(page.locator('.alert-card')).toHaveCount(0);
  await select.selectOption('all');
  await expect(page.locator('.alert-card')).toHaveCount(3);
  await page.locator('.alert-card').first().click();
  await page.locator('.alert-card').first().locator('button[title="スター"]').click();
  await select.selectOption('starred');
  await expect(page.locator('.alert-card')).toHaveCount(1);
  await expect(page.locator('.alert-card').first()).toContainText('418A');
  await select.selectOption('all');

  const search = page.getByRole('textbox', { name: '通知の企業検索' });
  await search.fill('7203');
  await expect(page.locator('.alert-card')).toHaveCount(1);
  await expect(page.locator('.alert-card').first()).toContainText('7203');
  await page.getByRole('button', { name: '全期間OFF' }).click();
  await expect(page.getByRole('button', { name: '全期間ON' })).toBeVisible();
  await expect(page.locator('.alert-card')).toHaveCount(1);
  await page.getByRole('button', { name: /📅/ }).click();
  await expect(page.getByRole('button', { name: '全期間OFF' })).toBeVisible();
  await page.getByRole('button', { name: '日付フィルタを解除' }).click();
  await expect(page.locator('.date-filter-wrap .date-clear-btn')).toHaveCount(0);
  await expect(page.locator('.alert-card')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '← 通知一覧' }).click();
  await expect(page.locator('.filter-bar')).toBeVisible();
  await checkControlsFit(page, false);
  await expect(select).toBeVisible();
  await expect(search).toBeVisible();
});

test('PL has no heading strip above the shared text bar at desktop or narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ticker=418A');
  await expect(page.locator('.pl-section .formula-bar-input')).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.pl-section > .section-title')).toHaveCount(0);
    const gap = await page.locator('.pl-section').evaluate(section => {
      const outer = section.getBoundingClientRect(), bar = section.querySelector('.formula-bar-sticky').getBoundingClientRect();
      return bar.top - outer.top;
    });
    expect(gap).toBeLessThanOrEqual(2);
    await expect(page.locator('.pl-section > .pl-scroll-area').first()).toBeVisible();
  }
});
