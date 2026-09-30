const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.HASNARIA_BASE_URL || 'https://hasnaria-business-analyzer.vercel.app';
const EMAIL = process.env.HASNARIA_E2E_EMAIL || '';
const PASSWORD = process.env.HASNARIA_E2E_PASSWORD || '';

function requireCredentials() {
  if (!EMAIL || !PASSWORD) throw new Error('Dedicated E2E Owner credentials are required.');
}

async function clearPassword(page) {
  try { await page.locator('#password').fill(''); } catch (_) {}
}

async function directSignup(page) {
  return await page.evaluate(async ({ email, password }) => {
    if (typeof supabase === 'undefined' || !window.HASNARIA_SB || !window.HASNARIA_KEY) {
      return { ok: false, error: 'Supabase client bootstrap is unavailable.' };
    }
    const client = supabase.createClient(window.HASNARIA_SB, window.HASNARIA_KEY, {
      auth: { persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    const r = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin },
    });
    if (r.error) return { ok: false, error: r.error.message || String(r.error) };
    return {
      ok: true,
      hasUser: !!(r.data && r.data.user),
      hasSession: !!(r.data && r.data.session),
    };
  }, { email: EMAIL, password: PASSWORD });
}

test('Dedicated E2E Owner account is provisioned and can authenticate', async ({ page }) => {
  test.setTimeout(120000);
  requireCredentials();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await expect(page.locator('#email')).toBeVisible({ timeout: 20000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#loginBtn').click();

  let authenticated = false;
  try {
    await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 12000 });
    authenticated = true;
  } catch (_) {
    const loginMessage = ((await page.locator('#authMsg').textContent().catch(() => '')) || '').trim();
    if (!/invalid login credentials/i.test(loginMessage)) {
      await clearPassword(page);
      throw new Error(`Dedicated E2E Owner login failed${loginMessage ? `: ${loginMessage}` : ''}`);
    }

    const signup = await directSignup(page);
    await clearPassword(page);
    if (!signup.ok) throw new Error(`Dedicated E2E Owner signup failed: ${signup.error}`);
    if (!signup.hasUser) throw new Error('Dedicated E2E Owner signup returned no user.');
    if (!signup.hasSession) {
      throw new Error('Dedicated E2E Owner was created successfully; email confirmation is required once before P0 acceptance can continue.');
    }

    await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });
    authenticated = true;
  }

  if (!authenticated) throw new Error('Dedicated E2E Owner session was not established.');
  await clearPassword(page);

  // Owner navigation is the stable user-visible proof of successful bootstrap.
  // Do not assert the legacy auth node: production runtime may detach/reparent it.
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-tab="pembelian"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-tab="ops"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-tab="stok"]')).toBeVisible({ timeout: 20000 });
});
