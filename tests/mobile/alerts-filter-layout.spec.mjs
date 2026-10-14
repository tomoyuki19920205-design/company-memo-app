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

async function checkControlsFit(page, desktop) {
  const geometry = await page.locator('.alerts-list-pane').evaluate(pane => {
    const rect = node => node.getBoundingClientRect().toJSON();
    const controls = pane.querySelector('.alerts-list-controls');
    const primary = controls.querySelector('.filter-primary-row');
    return {
      header: rect(document.querySelector('.alerts-header')),
      pane: rect(pane),
      right: rect(document.querySelector('.alerts-detail-pane')),
      controls: rect(controls),
      primary: rect(primary),
      category: rect(primary.querySelector('select')),
      date: rect(primary.querySelector('.date-filter-wrap')),
      period: rect(primary.querySelector('.filter-period-toggle')),
      search: rect(controls.querySelector('.filter-search')),
      firstCard: pane.querySelector('.alert-card') ? rect(pane.querySelector('.alert-card')) : null,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  const { header, pane, right, controls, primary, category, date, period, search, firstCard } = geometry;
  expect(controls.left).toBeGreaterThanOrEqual(pane.left - 1);
  expect(controls.right).toBeLessThanOrEqual(pane.right + 1);
  expect(controls.top).toBeCloseTo(pane.top, 0);
  expect(search.top).toBeGreaterThanOrEqual(primary.bottom);
  expect(search.width).toBeGreaterThan(pane.width - 40);
  for (const box of [category, date, period, search]) {
    expect(box.left).toBeGreaterThanOrEqual(pane.left - 1);
    expect(box.right).toBeLessThanOrEqual(pane.right + 1);
  }
  expect(category.top).toBeLessThanOrEqual(date.top);
  expect(date.top).toBeLessThanOrEqual(period.top + 4);
  if (firstCard) expect(firstCard.top).toBeGreaterThanOrEqual(controls.bottom - 1);
  if (desktop) {
    expect(pane.top).toBeCloseTo(header.bottom, 0);
    expect(right.top).toBeCloseTo(header.bottom, 0);
    const center = box => box.top + box.height / 2;
    expect(Math.abs(center(date) - center(category))).toBeLessThanOrEqual(2);
    expect(Math.abs(center(period) - center(category))).toBeLessThanOrEqual(2);
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
  expect(await page.locator('.alerts-layout > .filter-bar').count()).toBe(0);

  for (const [key, label] of options) {
    await select.selectOption(key);
    await expect(select).toHaveValue(key);
    await expect(select.locator('option:checked')).toHaveText(label);
    if (key === 'discord') {
      await expect(page.locator('.alerts-list-pane .discord-sort-bar')).toBeVisible();
      await expect(page.locator('.alerts-layout > .discord-sort-bar')).toHaveCount(0);
      await checkControlsFit(page, true);
    }
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

  // Narrowing only the left pane may wrap its controls, without lowering the PL pane.
  await search.fill('');
  const divider = await page.locator('.pane-divider').boundingBox();
  const rightTop = (await page.locator('.alerts-detail-pane').boundingBox()).y;
  await page.mouse.move(divider.x + divider.width / 2, divider.y + 50);
  await page.mouse.down();
  await page.mouse.move(divider.x - 110, divider.y + 50, { steps: 5 });
  await page.mouse.up();
  await checkControlsFit(page, false);
  const wrapped = await page.locator('.filter-primary-row').evaluate(row =>
    row.querySelector('.filter-period-toggle').getBoundingClientRect().top >
    row.querySelector('select').getBoundingClientRect().top + 10);
  expect(wrapped).toBe(true);
  expect((await page.locator('.alerts-detail-pane').boundingBox()).y).toBeCloseTo(rightTop, 0);

  // The controls remain available while only the notification list scrolls.
  await page.setViewportSize({ width: 1440, height: 200 });
  await page.locator('.alerts-list-pane').evaluate(pane => { pane.scrollTop = pane.scrollHeight; });
  await expect.poll(() => page.locator('.alerts-list-pane').evaluate(pane => pane.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole('combobox', { name: '通知の分類' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '通知の企業検索' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });

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
