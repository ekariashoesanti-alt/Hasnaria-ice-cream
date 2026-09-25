const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.HASNARIA_BASE_URL || 'https://hasnaria-business-analyzer.vercel.app';

test('Public production login shell renders across core viewport widths', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message ? error.message : error)));

  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  expect(response, 'Production navigation should return a response').not.toBeNull();
  expect(response.status(), 'Production should respond without HTTP 4xx/5xx').toBeLessThan(400);

  await expect(page.locator('#auth')).not.toHaveClass(/hidden/, { timeout: 20000 });
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#loginBtn')).toBeVisible();
  await expect(page.locator('#app')).toHaveClass(/hidden/);
  await expect(page.locator('body')).not.toBeEmpty();

  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#auth')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#loginBtn')).toBeVisible();
  }

  expect(pageErrors, `Unexpected browser page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
