import { test, expect } from '@playwright/test';

test('one PL text bar follows literal, formula and empty KPI cells; edits survive reload', async ({ page }) => {
  await page.goto('/?screen=kpi');
  const cell = slot => page.locator(`[data-kpi-row="0"][data-kpi-slot="${slot}"]`);
  const bar = page.locator('.pl-section .formula-bar-input');
  await expect(cell(1)).toBeVisible();
  await expect(page.locator('.pl-section .formula-bar')).toHaveCount(1);
  await expect(page.locator('.kpi-formula-bar')).toHaveCount(0);
  await cell(2).click();
  await expect(bar).toHaveValue('通常の文字列');
  await expect(page.locator('.kpi-formula-address')).toContainText('KPI!B1');
  await cell(1).click();
  await expect(bar).toHaveValue('=CUM!A1+1');
  await expect(cell(1)).toContainText('1068');
  await cell(3).click();
  await expect(bar).toHaveValue('');
  await cell(1).click();
  await bar.fill('=CUM!A1*2');
  await bar.press('Enter');
  await expect(cell(1)).toContainText('2134');
  await page.reload();
  await cell(1).click();
  await expect(bar).toHaveValue('=CUM!A1*2');
  await expect(cell(1)).toContainText('2134');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: test.info().outputPath('kpi-unified-bar-desktop.png') });
  await page.getByRole('button', { name: '7203' }).click();
  await expect(bar).toHaveValue('');
  await expect(page.locator('.cell-ref-empty')).toContainText('セル未選択');
  await cell(2).click();
  await expect(bar).toHaveValue('通常の文字列');
  await page.getByRole('button', { name: '418A' }).click();
  await expect(bar).toHaveValue('');
  await cell(1).click();
  await expect(bar).toHaveValue('=CUM!A1*2');
  await cell(2).click();
  await bar.fill('編集した文字列');
  await bar.press('Enter');
  await expect(cell(2)).toContainText('編集した文字列');
  await cell(1).click();
  await expect(bar).toHaveValue('=CUM!A1*2');
});

test('cell editing and text bar continue one draft and save once', async ({ page }) => {
  await page.goto('/?screen=kpi');
  const cell = page.locator('[data-kpi-row="0"][data-kpi-slot="1"]');
  const bar = page.locator('.pl-section .formula-bar-input');
  await cell.dblclick();
  const inline = cell.locator('textarea');
  await inline.fill('=CUM!A1+');
  await bar.click();
  await expect(bar).toHaveValue('=CUM!A1+');
  await bar.fill('=CUM!A1+5');
  await bar.press('Enter');
  await expect(cell).toContainText('1072');
  expect(await page.evaluate(() => window.__kpiSaveCount)).toBe(1);
});

test('KPI copy and paste preserve relative references in the unified editor', async ({ page }) => {
  await page.goto('/?screen=kpi');
  const source = page.locator('[data-kpi-row="0"][data-kpi-slot="1"]');
  const destination = page.locator('[data-kpi-row="1"][data-kpi-slot="1"]');
  await source.click();
  const clipboard = await source.evaluate(el => {
    const data = new DataTransfer();
    el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }));
    return { text: data.getData('text/plain'), custom: data.getData('application/x-company-kpi') };
  });
  expect(clipboard.text).toBe('=CUM!A1+1');
  expect(clipboard.custom).toContain('"version":1');
  await destination.click();
  await destination.evaluate((el, copied) => {
    const data = new DataTransfer();
    data.setData('text/plain', copied.text);
    data.setData('application/x-company-kpi', copied.custom);
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, clipboard);
  await expect(page.locator('.pl-section .formula-bar-input')).toHaveValue('=CUM!A2+1');
});

test('reference insertion, undo/redo and IME confirmation share the KPI editor', async ({ page }) => {
  await page.goto('/?screen=kpi');
  const cell = slot => page.locator(`[data-kpi-row="0"][data-kpi-slot="${slot}"]`);
  const bar = page.locator('.pl-section .formula-bar-input');
  await cell(3).click();
  await bar.fill('=');
  await page.locator('[data-formula-ref="CUM|0|0"]').first().click();
  await expect(bar).toHaveValue('=CUM!A1');
  await bar.press('Enter');
  await expect(cell(3)).toContainText('1067');
  await cell(3).press('ControlOrMeta+z');
  await expect(cell(3)).toHaveText('');
  await cell(3).press('ControlOrMeta+y');
  await expect(cell(3)).toContainText('1067');
  await cell(2).click();
  await bar.focus();
  await bar.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '日本語' })));
  await bar.fill('日本語');
  await bar.evaluate(el => {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 229 }));
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本語' }));
  });
  await expect(bar).toHaveValue('日本語');
  await expect(cell(2)).toContainText('通常の文字列');
  await page.waitForTimeout(110);
  await bar.press('Enter');
  await expect(cell(2)).toContainText('日本語');
});

test('narrow layout keeps one input and the reference help opens from its label', async ({ page }) => {
  await page.goto('/?screen=kpi');
  await page.locator('[data-kpi-row="0"][data-kpi-slot="1"]').click();
  await expect(page.locator('.pl-section .formula-bar-input')).toHaveCount(1);
  await expect(page.locator('.kpi-formula-bar')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('kpi-unified-bar-mobile.png') });
  await page.locator('.kpi-formula-help > summary').click();
  await expect(page.locator('.kpi-formula-popover')).toBeVisible();
  const geometry = await page.locator('.formula-bar').evaluate(el => ({ width: el.getBoundingClientRect().width, viewport: innerWidth }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
  await page.screenshot({ path: test.info().outputPath('kpi-reference-help-mobile.png') });
});
