const { test, expect } = require('@playwright/test');
const XLSX = require('xlsx');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = process.env.HASNARIA_BASE_URL || 'https://hasnaria-business-analyzer.vercel.app';
const EMAIL = process.env.HASNARIA_E2E_EMAIL || '';
const PASSWORD = process.env.HASNARIA_E2E_PASSWORD || '';
const ALLOW_WRITE = process.env.HASNARIA_E2E_ALLOW_WRITE === '1';
const BRAND = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';

function requireCredentials() {
  if (!EMAIL || !PASSWORD) throw new Error('HASNARIA_E2E_EMAIL and HASNARIA_E2E_PASSWORD are required.');
}

function uniqueTag() {
  return `HASNARIA_E2E_2099_12_${Date.now()}`;
}

function makeExcelFixture(tag) {
  const file = path.join(os.tmpdir(), `${tag}.xlsx`);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Tgl', 'Nama Bahan', 'Jumlah', 'Harga Satuan', 'Total', 'Tunai'],
    ['2099-12-15', `${tag} ITEM`, 1, 1000, 1000, 1000],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'BELANJA');
  XLSX.writeFile(wb, file);
  return file;
}

function makeMajooFixture(tag) {
  const file = path.join(os.tmpdir(), `${tag}_MAJOO.xlsx`);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Nama Pemasok', 'No Faktur Pembelian', 'Tanggal Faktur Pembelian', 'SKU', 'Nama Barang', 'Satuan', 'Harga Beli', 'Stok ditambahkan', 'Total Nilai Setelah Diskon Per Produk', 'Total Nilai Produk', 'Status'],
    ['E2E Supplier', `${tag}-INV-1`, '2099-12-15', 'E2E001', `${tag} MAJOO ITEM`, 'pcs', 1500, 1, 1500, 1500, 'Selesai'],
    ['E2E Supplier', `${tag}-INV-VOID`, '2099-12-15', 'E2E002', `${tag} VOID ITEM`, 'pcs', 999, 1, 999, 999, 'Void'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Ekspor Faktur Pembelian');
  XLSX.writeFile(wb, file);
  return file;
}

async function login(page) {
  requireCredentials();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await expect(page.locator('#email')).toBeVisible({ timeout: 20000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#loginBtn').click();
  await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });
  await expect(page.locator('#auth')).toHaveClass(/hidden/);
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
}

async function openTab(page, id) {
  const tab = page.locator(`[data-tab="${id}"]`);
  await expect(tab).toBeVisible({ timeout: 15000 });
  await tab.click();
  await expect(page.locator(`#${id}`)).not.toHaveClass(/hidden/);
}

async function previewAndDismiss(page, inputSelector, filePath) {
  let message = '';
  page.once('dialog', async dialog => {
    message = dialog.message();
    await dialog.dismiss();
  });
  await page.locator(inputSelector).setInputFiles(filePath);
  await expect.poll(() => message, { timeout: 30000 }).not.toBe('');
  return message;
}

async function commitUpload(page, inputSelector, filePath) {
  let message = '';
  page.once('dialog', async dialog => {
    message = dialog.message();
    await dialog.accept();
  });
  await page.locator(inputSelector).setInputFiles([]);
  await page.locator(inputSelector).setInputFiles(filePath);
  await expect.poll(() => message, { timeout: 30000 }).not.toBe('');
  await expect(page.locator('#purchaseDualToast')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#purchaseDualToast')).not.toContainText(/gagal|error/i);
  return message;
}

async function queryFixture(page, sourceFile) {
  return await page.evaluate(async ({ sourceFile, brand }) => {
    const db = window.__HASNARIA_DB;
    if (!db) throw new Error('Shared Supabase client is unavailable.');
    const ev = await db.from('purchase_import_evidence')
      .select('id,import_job_id,source_file,source_period')
      .eq('brand_id', brand)
      .eq('source_file', sourceFile);
    if (ev.error) throw ev.error;
    const hist = await db.from('offline_purchase_history')
      .select('id,source_file,source_period')
      .eq('brand_id', brand)
      .eq('source_file', sourceFile);
    if (hist.error) throw hist.error;
    const jobIds = [...new Set((ev.data || []).map(x => x.import_job_id).filter(Boolean))];
    let jobs = [];
    if (jobIds.length) {
      const jr = await db.from('import_jobs').select('id,status,source_file,module,rows_posted').in('id', jobIds);
      if (jr.error) throw jr.error;
      jobs = jr.data || [];
    }
    return { evidence: ev.data || [], history: hist.data || [], jobs };
  }, { sourceFile, brand: BRAND });
}

async function cleanupFixture(page, sourceFile) {
  return await page.evaluate(async ({ sourceFile, brand }) => {
    const db = window.__HASNARIA_DB;
    if (!db) throw new Error('Shared Supabase client is unavailable.');
    const ev = await db.from('purchase_import_evidence')
      .select('id,import_job_id')
      .eq('brand_id', brand)
      .eq('source_file', sourceFile);
    if (ev.error) throw ev.error;
    const jobIds = [...new Set((ev.data || []).map(x => x.import_job_id).filter(Boolean))];

    const de = await db.from('purchase_import_evidence').delete().eq('brand_id', brand).eq('source_file', sourceFile);
    if (de.error) throw de.error;
    const dh = await db.from('offline_purchase_history').delete().eq('brand_id', brand).eq('source_file', sourceFile);
    if (dh.error) throw dh.error;

    for (const id of jobIds) {
      const u = await db.from('import_jobs').update({
        status: 'rolled_back',
        rows_posted: 0,
        metadata: { e2e_cleanup: true, e2e_source_file: sourceFile }
      }).eq('id', id);
      if (u.error) throw u.error;
    }

    const checkEv = await db.from('purchase_import_evidence').select('id', { count: 'exact', head: true }).eq('brand_id', brand).eq('source_file', sourceFile);
    if (checkEv.error) throw checkEv.error;
    const checkHist = await db.from('offline_purchase_history').select('id', { count: 'exact', head: true }).eq('brand_id', brand).eq('source_file', sourceFile);
    if (checkHist.error) throw checkHist.error;
    return { evidenceRemaining: checkEv.count || 0, historyRemaining: checkHist.count || 0, jobIds };
  }, { sourceFile, brand: BRAND });
}

test.describe.serial('Hasnaria production go-live E2E', () => {
  test('Owner login, navigation, safe Purchase previews, refresh, responsive, logout/login', async ({ page }) => {
    const tag = uniqueTag();
    const excel = makeExcelFixture(tag);
    const majoo = makeMajooFixture(tag);

    await login(page);
    await expect(page.locator('#dashboard')).not.toHaveClass(/hidden/);

    await openTab(page, 'pembelian');
    await expect(page.locator('#purchaseExcelFile')).toBeAttached({ timeout: 20000 });
    await expect(page.locator('#purchaseMajooFile')).toBeAttached({ timeout: 20000 });

    const excelPreview = await previewAndDismiss(page, '#purchaseExcelFile', excel);
    expect(excelPreview).toMatch(/simpan|database|valid|baris|pembelian/i);

    const majooPreview = await previewAndDismiss(page, '#purchaseMajooFile', majoo);
    expect(majooPreview).toMatch(/majoo|simpan|database|baris/i);
    expect(majooPreview).toMatch(/void|non-selesai|diabaikan/i);

    await openTab(page, 'stok');
    await expect(page.locator('#stok')).not.toBeEmpty();

    await openTab(page, 'ops');
    await expect(page.locator('#ops [data-finance-v6="1"]')).toBeVisible({ timeout: 20000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });

    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.locator('#tabs')).toBeVisible();
    }

    await page.locator('#logoutBtn').click();
    await expect(page.locator('#auth')).not.toHaveClass(/hidden/, { timeout: 20000 });
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('#loginBtn').click();
    await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });

    fs.rmSync(excel, { force: true });
    fs.rmSync(majoo, { force: true });
  });

  test('Optional controlled write verifies import_job_id then cleans business rows', async ({ page }) => {
    test.skip(!ALLOW_WRITE, 'Set HASNARIA_E2E_ALLOW_WRITE=1 for the final controlled write gate.');
    const tag = uniqueTag();
    const excel = makeExcelFixture(tag);
    const sourceFile = path.basename(excel);

    await login(page);
    await openTab(page, 'pembelian');
    await expect(page.locator('#purchaseExcelFile')).toBeAttached({ timeout: 20000 });
    await commitUpload(page, '#purchaseExcelFile', excel);

    const saved = await queryFixture(page, sourceFile);
    expect(saved.evidence.length).toBeGreaterThan(0);
    expect(saved.history.length).toBeGreaterThan(0);
    expect(saved.evidence.every(x => !!x.import_job_id)).toBeTruthy();
    expect(saved.jobs.length).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#app')).not.toHaveClass(/hidden/, { timeout: 45000 });
    await openTab(page, 'pembelian');
    const afterRefresh = await queryFixture(page, sourceFile);
    expect(afterRefresh.evidence.length).toBe(saved.evidence.length);

    await openTab(page, 'stok');
    await expect(page.locator('#stok')).not.toBeEmpty();
    await openTab(page, 'ops');
    await expect(page.locator('#ops [data-finance-v6="1"]')).toBeVisible({ timeout: 20000 });

    const cleanup = await cleanupFixture(page, sourceFile);
    expect(cleanup.evidenceRemaining).toBe(0);
    expect(cleanup.historyRemaining).toBe(0);

    fs.rmSync(excel, { force: true });
  });
});
