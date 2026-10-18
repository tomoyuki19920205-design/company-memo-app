import { test, expect } from '@playwright/test';

test('EDINET orders stay the default through loading, reload, and ticker changes', async ({ page }) => {
  await page.goto('/?ticker=418A');

  const edinet = page.getByRole('button', { name: 'EDINET受注', exact: true });
  const order = page.getByRole('button', { name: 'ORDER KPI', exact: true });
  await expect(edinet).toHaveClass(/active/);
  await expect(page.locator('.edinet-order-tbl tbody tr')).toHaveCount(1);
  await expect(page.locator('.edinet-order-table-card')).toContainText('123,456百万円');
  await expect(page.locator('.order-kpi-table-card')).toHaveCount(0);

  await order.click();
  await expect(order).toHaveClass(/active/);
  await expect(page.locator('.order-kpi-tbl tbody tr')).toHaveCount(1);
  await expect(page.locator('.edinet-order-table-card')).toHaveCount(0);

  await page.locator('#ticker-input').fill('7203');
  await page.getByRole('button', { name: '読込', exact: true }).click();
  await expect(edinet).toHaveClass(/active/);
  await expect(page.locator('.edinet-order-table-card')).toContainText('データなし');
  await expect(page.locator('.order-kpi-table-card')).toHaveCount(0);

  await page.locator('#ticker-input').fill('418A');
  await page.getByRole('button', { name: '読込', exact: true }).click();
  await expect(edinet).toHaveClass(/active/);
  await expect(page.locator('.edinet-order-tbl tbody tr')).toHaveCount(1);

  await page.reload();
  await expect(edinet).toHaveClass(/active/);
  await expect(page.locator('.edinet-order-tbl tbody tr')).toHaveCount(1);
});
