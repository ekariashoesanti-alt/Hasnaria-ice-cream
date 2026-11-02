'use strict';
const { test, expect } = require('@playwright/test');
const BASE = process.env.HASNARIA_BASE_URL || '';
const EXACT = 'http://127.0.0.1:4173';

test('HSN compiled preview: canonical bundle and retry markers are served', async ({ request }) => {
  expect(BASE, 'Read-only browser test must use local compiled artifact').toBe(EXACT);
  const checks = [
    ['/', ['/app.js?v=p076', '/owner-shell-guard.js?v=14']],
    ['/app.js?v=p076', ['/sales-board.js?v=50', 'pendingScriptLoads=Object.create(null)']],
    ['/owner-shell-guard.js?v=14', ['data-sales-bootstrap-error', 'if(ok===false)']],
    ['/sales-board.js?v=50', ['!STATE.fetched && !STATE.loading && !STATE.error && pickTokenFromStorage()', '!STATE.fetched && !STATE.error && tries++ < 80']]
  ];
  for (const [path, markers] of checks) {
    const response = await request.get(new URL(path, BASE).toString(), { timeout:30000 });
    expect(response.status(), path + ' should be served by local compiled build').toBe(200);
    const content = await response.text();
    for (const marker of markers) expect(content, path + ' missing ' + marker).toContain(marker);
  }
});

test('HSN compiled preview: unauthenticated login shell stays stable at 100% zoom', async ({ page }) => {
  expect(BASE).toBe(EXACT);
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err.message || err)));
  const response = await page.goto(BASE, { waitUntil:'domcontentloaded', timeout:45000 });
  expect(response.status()).toBe(200);
  await expect(page.locator('#auth')).not.toHaveClass(/hidden/, { timeout:20000 });
  await expect(page.locator('#app')).toHaveClass(/hidden/);
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#loginBtn')).toBeVisible();
  for (const width of [1440,1280,768,390]) {
    await page.setViewportSize({ width, height:900 });
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#loginBtn')).toBeVisible();
  }
  expect(pageErrors, 'Uncaught browser errors on staging login shell').toEqual([]);
});
