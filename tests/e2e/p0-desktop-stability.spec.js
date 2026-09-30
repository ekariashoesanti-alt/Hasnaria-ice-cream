const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.HASNARIA_BASE_URL || 'https://hasnaria-business-analyzer.vercel.app';
const EMAIL = process.env.HASNARIA_E2E_EMAIL || '';
const PASSWORD = process.env.HASNARIA_E2E_PASSWORD || '';
const TABS = ['dashboard', 'sales', 'pembelian', 'operasional', 'ops', 'stok'];

function requireCredentials() {
  if (!EMAIL || !PASSWORD) throw new Error('HASNARIA_E2E_EMAIL and HASNARIA_E2E_PASSWORD are required.');
}

async function submitLogin(page) {
  const password = page.locator('#password');
  await password.fill(PASSWORD);
  await page.locator('#loginBtn').click();
  try {
    await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });
  } catch (error) {
    let authMessage = '';
    try { authMessage = (await page.locator('#authMsg').textContent()) || ''; } catch (_) {}
    try { await password.fill(''); } catch (_) {}
    throw new Error(`Owner login failed${authMessage ? `: ${authMessage}` : ''}`);
  }
  try { await password.fill(''); } catch (_) {}
}

async function login(page) {
  requireCredentials();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await expect(page.locator('#email')).toBeVisible({ timeout: 20000 });
  await page.locator('#email').fill(EMAIL);
  await submitLogin(page);
  await expect(page.locator('#auth')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
}

async function waitCanonicalSurface(page, id) {
  if (id === 'dashboard') {
    await expect(page.locator('#dashboard')).not.toHaveClass(/hidden/);
    return;
  }
  if (id === 'sales') {
    await expect(page.locator('#sales .sale-board')).toBeVisible({ timeout: 20000 });
    return;
  }
  if (id === 'pembelian') {
    await expect(page.locator('#pembelian #paRoot')).toBeVisible({ timeout: 20000 });
    return;
  }
  if (id === 'operasional') {
    await expect(page.locator('#operasional [data-operational-v1="1"]')).toBeVisible({ timeout: 20000 });
    return;
  }
  if (id === 'ops') {
    await expect(page.locator('#ops [data-finance-v6="1"]')).toBeVisible({ timeout: 20000 });
    return;
  }
  if (id === 'stok') {
    await expect(page.locator('#stok .sc3-shell')).toBeVisible({ timeout: 20000 });
  }
}

test('P0 desktop: repeated Owner tab cycle stays single-surface and duplicate-free', async ({ page }) => {
  test.setTimeout(120000);
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', error => pageErrors.push(String(error && error.message ? error.message : error)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await login(page);

  await page.evaluate((tabs) => {
    const samples = [];
    let stopped = false;
    const visible = () => tabs.filter(id => {
      const el = document.getElementById(id);
      return !!el && !el.classList.contains('hidden');
    });
    const sample = () => {
      if (stopped) return;
      samples.push({ t: performance.now(), visible: visible() });
      requestAnimationFrame(sample);
    };
    window.__HASNARIA_P0_SAMPLES = samples;
    window.__HASNARIA_P0_STOP = () => { stopped = true; };
    requestAnimationFrame(sample);
  }, TABS);

  for (let round = 0; round < 3; round += 1) {
    for (const id of TABS) {
      const tab = page.locator(`[data-tab="${id}"]`);
      await expect(tab).toBeVisible({ timeout: 15000 });
      await tab.click();
      await expect(page.locator(`#${id}`)).not.toHaveClass(/hidden/);
      await waitCanonicalSurface(page, id);

      const state = await page.evaluate((tabs) => {
        const visible = tabs.filter(name => {
          const el = document.getElementById(name);
          return !!el && !el.classList.contains('hidden');
        });
        const activeTabs = Array.from(document.querySelectorAll('#tabs .tab.on[data-tab]'))
          .map(el => el.getAttribute('data-tab'))
          .filter(name => tabs.includes(name));
        return {
          visible,
          activeTabs,
          purchaseRoots: document.querySelectorAll('#purchaseFinanceAlignment').length,
          operationalRoots: document.querySelectorAll('#operasional [data-operational-v1="1"]').length,
          financeRoots: document.querySelectorAll('#ops [data-finance-v6="1"]').length,
          stockRoots: document.querySelectorAll('#stok .sc3-shell').length,
        };
      }, TABS);

      expect(state.visible).toEqual([id]);
      expect(state.activeTabs).toEqual([id]);
      expect(state.purchaseRoots).toBeLessThanOrEqual(1);
      expect(state.operationalRoots).toBeLessThanOrEqual(1);
      expect(state.financeRoots).toBeLessThanOrEqual(1);
      expect(state.stockRoots).toBeLessThanOrEqual(1);
    }
  }

  const frameSamples = await page.evaluate(() => {
    if (window.__HASNARIA_P0_STOP) window.__HASNARIA_P0_STOP();
    return window.__HASNARIA_P0_SAMPLES || [];
  });
  const invalidFrames = frameSamples.filter(sample => sample.visible.length !== 1);

  expect(invalidFrames, `Frames with zero/multiple Owner surfaces: ${JSON.stringify(invalidFrames.slice(0, 10))}`).toEqual([]);
  expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `Console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});
