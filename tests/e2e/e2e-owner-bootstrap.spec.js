const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.HASNARIA_BASE_URL || 'https://hasnaria-business-analyzer.vercel.app';
const EMAIL = process.env.HASNARIA_E2E_EMAIL || '';
const PASSWORD = process.env.HASNARIA_E2E_PASSWORD || '';

function requireCredentials() {
  if (!EMAIL || !PASSWORD) throw new Error('Dedicated E2E Owner credentials are required.');
}

async function appIsVisible(page) {
  try {
    return await page.locator('#app').isVisible();
  } catch (_) {
    return false;
  }
}

async function clearPassword(page) {
  try { await page.locator('#password').fill(''); } catch (_) {}
}

test('Dedicated E2E Owner account is provisioned and can authenticate', async ({ page }) => {
  test.setTimeout(120000);
  requireCredentials();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await expect(page.locator('#email')).toBeVisible({ timeout: 20000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#loginBtn').click();

  try {
    await expect(page.locator('#app')).toBeVisible({ timeout: 12000 });
  } catch (_) {
    const loginMessage = ((await page.locator('#authMsg').textContent().catch(() => '')) || '').trim();
    if (!/invalid login credentials/i.test(loginMessage)) {
      await clearPassword(page);
      throw new Error(`Dedicated E2E Owner login failed${loginMessage ? `: ${loginMessage}` : ''}`);
    }

    await page.locator('#password').fill(PASSWORD);
    await page.locator('#signupBtn').click();
    await page.waitForTimeout(2500);

    if (!(await appIsVisible(page))) {
      const signupMessage = ((await page.locator('#authMsg').textContent().catch(() => '')) || '').trim();
      await clearPassword(page);
      if (/akun dibuat|cek email/i.test(signupMessage)) {
        throw new Error('Dedicated E2E Owner was created but email confirmation is required once before P0 acceptance can continue.');
      }
      throw new Error(`Dedicated E2E Owner provisioning failed${signupMessage ? `: ${signupMessage}` : ''}`);
    }
  }

  await clearPassword(page);

  const finalized = await page.evaluate(async () => {
    const db = window.__HASNARIA_DB;
    if (!db) return { ok: false, error: 'Shared Supabase client is unavailable.' };
    const r = await db.rpc('account_activation_finalize_v1');
    if (r.error) return { ok: false, error: r.error.message || String(r.error) };
    return { ok: true, data: r.data || null };
  });
  if (!finalized.ok) throw new Error(`Dedicated E2E Owner finalize failed: ${finalized.error}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });
  await expect(page.locator('#auth')).toHaveClass(/hidden/);
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-tab="pembelian"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-tab="ops"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-tab="stok"]')).toBeVisible({ timeout: 20000 });
});
