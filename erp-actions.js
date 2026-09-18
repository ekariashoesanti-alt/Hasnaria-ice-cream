(function () {
  'use strict';

  const HANDLED = new Set([
    'pack_conversion',
    'recipe_verification',
    'sale_item_mapping',
    'selling_price_confirmation',
    'inventory_baseline_confirmation',
    'financing_payment_review'
  ]);

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const money = value => value == null ? 'Belum tersedia' : 'Rp' + Number(value).toLocaleString('id-ID', {maximumFractionDigits:0});
  const number = value => value == null ? 'Belum tersedia' : Number(value).toLocaleString('id-ID');
  const context = () => window.__HASNARIA_CONTEXT;
  const db = () => window.__HASNARIA_DB;

  function canHandle(type) {
    return HANDLED.has(type);
  }

  function requireOwner() {
    const c = context();
    if (!c || c.role !== 'owner') throw new Error('Tindakan ini hanya dapat diselesaikan oleh Owner.');
  }

  function positive(value, label) {
    const n = Number(value);
    if (!(n > 0)) throw new Error(label + ' harus lebih dari 0.');
    return n;
  }

  function reason(value) {
    const text = String(value || '').trim();
    if (!text) throw new Error('Alasan wajib diisi untuk audit trail.');
    return text;
  }

  function todayJakarta() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function buildRequest(action, values) {
    const meta = action && action.metadata || {};
    const type = action && action.action_type;
    if (!canHandle(type)) throw new Error('Action type belum didukung oleh form ERP.');

    if (type === 'pack_conversion') {
      if (!meta.conversion_id) throw new Error('Conversion ID tidak tersedia.');
      return {
        rpc: 'resolve_inventory_conversion',
        params: {
          p_conversion_id: meta.conversion_id,
          p_units_per_purchase_unit: positive(values.units_per_purchase_unit, 'Isi per pack'),
          p_reason: reason(values.reason)
        }
      };
    }

    if (type === 'recipe_verification') {
      if (!meta.product_id) throw new Error('Product ID tidak tersedia.');
      const effectiveFrom = String(values.effective_from || '').trim();
      if (!effectiveFrom) throw new Error('Tanggal mulai berlaku wajib diisi.');
      if (effectiveFrom > todayJakarta()) throw new Error('Tanggal mulai berlaku tidak boleh di masa depan.');
      return {
        rpc: 'resolve_product_recipe_verification_v2',
        params: {
          p_product_id: meta.product_id,
          p_verified: true,
          p_effective_from: effectiveFrom,
          p_reason: reason(values.reason)
        }
      };
    }

    if (type === 'sale_item_mapping') {
      const productId = meta.suggested_product_id || values.product_id;
      if (!productId) throw new Error('Produk tujuan belum dipilih.');
      return {
        rpc: 'resolve_sale_item_product_mapping',
        params: {
          p_source_name: meta.source_name || action.subject,
          p_product_id: productId,
          p_reason: reason(values.reason)
        }
      };
    }

    if (type === 'selling_price_confirmation') {
      if (!meta.product_id) throw new Error('Product ID tidak tersedia.');
      return {
        rpc: 'resolve_product_selling_price',
        params: {
          p_product_id: meta.product_id,
          p_selling_price: positive(values.selling_price, 'Harga jual'),
          p_reason: reason(values.reason)
        }
      };
    }

    if (type === 'inventory_baseline_confirmation') {
      if (!meta.source_history_id) throw new Error('Source history ID tidak tersedia.');
      return {
        rpc: 'resolve_inventory_baseline_candidate',
        params: {
          p_source_history_id: meta.source_history_id,
          p_reason: reason(values.reason)
        }
      };
    }

    if (type === 'financing_payment_review') {
      if (!meta.source_history_id) throw new Error('Source history ID tidak tersedia.');
      const resolution = String(values.resolution || '');
      if (!['cash_paid','liability_only','exclude'].includes(resolution)) throw new Error('Pilih keputusan pembiayaan.');
      let cashDate = null;
      let cashAmount = null;
      if (resolution === 'cash_paid') {
        cashDate = String(values.cash_date || '').trim();
        if (!cashDate) throw new Error('Tanggal pembayaran kas wajib diisi.');
        cashAmount = positive(values.cash_amount, 'Nominal pembayaran kas');
      }
      return {
        rpc: 'resolve_financing_payment_candidate',
        params: {
          p_source_history_id: meta.source_history_id,
          p_resolution: resolution,
          p_cash_date: cashDate,
          p_cash_amount: cashAmount,
          p_reason: reason(values.reason)
        }
      };
    }

    throw new Error('Action type belum didukung.');
  }

  function commonHeader(action) {
    return '<h2 id="erp-dialog-title">' + esc(action.subject) + '</h2>' +
      '<p>' + esc(action.action_needed || '') + '</p>' +
      '<div class="erp-kpis">' +
        '<div class="erp-kpi"><div>Nilai terkait</div><div class="value">' + money(action.financial_impact) + '</div></div>' +
        '<div class="erp-kpi"><div>Aktivitas terkait</div><div class="value">' + number(action.activity_impact) + '</div></div>' +
      '</div>';
  }

  function formHtml(action) {
    const meta = action.metadata || {};
    const type = action.action_type;
    let body = '';
    let submit = 'Simpan keputusan';

    if (type === 'pack_conversion') {
      body = '<p class="erp-note warn">Isi per pack harus berasal dari kemasan/supplier yang benar. Jangan menebak.</p>' +
        '<label>Isi per pack<input name="units_per_purchase_unit" type="number" min="0.000001" step="any" required placeholder="Contoh: 50"></label>';
      submit = 'Verifikasi konversi';
    } else if (type === 'recipe_verification') {
      body = '<p class="erp-note warn">Verifikasi hanya jika BOM, komponen, dan qty per penjualan sudah lengkap. HPP berlaku mulai tanggal yang dipilih.</p>' +
        '<div class="erp-wide erp-note"><b>Ringkasan resep</b><br>' + esc(meta.recipe_summary || 'Belum tersedia') + '<br><small>Komponen aktif: ' + number(meta.active_components) + '</small></div>' +
        '<label>Tanggal mulai berlaku<input name="effective_from" type="date" max="' + todayJakarta() + '" required></label>';
      submit = 'Verifikasi resep';
    } else if (type === 'sale_item_mapping') {
      if (!meta.suggested_product_id) {
        body = '<p class="erp-note warn">Belum ada saran produk yang dapat dikonfirmasi dari Action Center. Buka modul Penjualan untuk memilih produk tujuan.</p>';
      } else {
        body = '<div class="erp-wide erp-note"><b>Nama transaksi:</b> ' + esc(meta.source_name || action.subject) + '<br><b>Saran produk:</b> ' + esc(meta.suggested_product_name || 'Produk tersaran') + '<br><b>Confidence:</b> ' + esc(meta.suggestion_confidence || 'Belum tersedia') + '</div>';
        submit = 'Konfirmasi mapping';
      }
    } else if (type === 'selling_price_confirmation') {
      body = '<p class="erp-note">Suggestion hanya referensi histori transaksi dan tidak diterapkan otomatis.</p>' +
        '<div class="erp-wide erp-note"><b>Confidence:</b> ' + esc(meta.confidence || 'Belum tersedia') + ' · <b>Observasi:</b> ' + number(meta.observation_count) + '<br><b>Rentang teramati:</b> ' + money(meta.min_observed_price) + ' – ' + money(meta.max_observed_price) + '</div>' +
        '<label>Harga jual<input name="selling_price" type="number" min="0.01" step="any" required value="' + esc(meta.suggested_selling_price || '') + '"></label>';
      submit = 'Simpan harga jual';
    } else if (type === 'inventory_baseline_confirmation') {
      body = '<p class="erp-note warn">Ini baseline historis, bukan stok hari ini. Konfirmasi hanya jika stok akhir periode sumber memang benar.</p>' +
        '<div class="erp-wide erp-note"><b>Tanggal baseline:</b> ' + esc(meta.baseline_date || 'Belum tersedia') + '<br><b>Qty akhir historis:</b> ' + number(meta.ending_qty) + ' ' + esc(meta.unit || '') + '</div>';
      submit = 'Konfirmasi baseline historis';
    } else if (type === 'financing_payment_review') {
      body = '<p class="erp-note warn">Pilih cash_paid hanya jika uang benar-benar keluar dari kas/bank pada tanggal yang diisi.</p>' +
        '<div class="erp-wide erp-note"><b>Tanggal sumber:</b> ' + esc(meta.purchase_date || 'Belum tersedia') + '<br><b>Nilai kandidat:</b> ' + money(meta.amount) + '<br><b>Metode sumber:</b> ' + esc(meta.payment_method || 'Belum tersedia') + '</div>' +
        '<label>Keputusan<select name="resolution" required><option value="">Pilih…</option><option value="cash_paid">Cash paid</option><option value="liability_only">Liability only</option><option value="exclude">Exclude</option></select></label>' +
        '<fieldset id="erp-cash-fields" class="erp-wide" hidden><div class="erp-form"><label>Tanggal pembayaran<input name="cash_date" type="date"></label><label>Nominal dibayar<input name="cash_amount" type="number" min="0.01" step="any"></label></div></fieldset>';
      submit = 'Simpan keputusan pembiayaan';
    }

    const canSubmit = !(type === 'sale_item_mapping' && !meta.suggested_product_id);
    return commonHeader(action) + '<form id="erp-action-form" class="erp-form">' + body +
      '<label class="erp-wide">Alasan / catatan audit<textarea name="reason" rows="3" required placeholder="Tuliskan dasar keputusan"></textarea></label>' +
      '<p id="erp-action-message" class="erp-wide erp-message" role="status"></p>' +
      '<div class="erp-form-actions erp-wide"><button type="button" data-erp-action-close>Tutup</button>' +
      (canSubmit ? '<button class="primary" type="submit">' + esc(submit) + '</button>' : '') + '</div></form>';
  }

  function valuesFrom(form) {
    const out = {};
    new FormData(form).forEach((value, key) => { out[key] = value; });
    return out;
  }

  async function submit(action, form, dialog) {
    requireOwner();
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector('#erp-action-message');
    if (button) button.disabled = true;
    if (message) message.textContent = 'Menyimpan keputusan…';
    try {
      const request = buildRequest(action, valuesFrom(form));
      const result = await db().rpc(request.rpc, request.params).abortSignal(AbortSignal.timeout(30000));
      if (result.error) throw result.error;
      if (message) message.textContent = 'Berhasil disimpan.';
      dialog.close();
      document.dispatchEvent(new CustomEvent('hasnaria:erp-action-resolved', {detail:{actionType:action.action_type,rpc:request.rpc}}));
    } catch (error) {
      if (message) message.textContent = error && error.message ? error.message : String(error);
      if (button) button.disabled = false;
    }
  }

  function open(action, dialog) {
    requireOwner();
    if (!dialog) throw new Error('Dialog ERP tidak tersedia.');
    if (!canHandle(action && action.action_type)) throw new Error('Action type belum didukung oleh form ERP.');
    dialog.innerHTML = formHtml(action);
    const form = dialog.querySelector('#erp-action-form');
    const close = dialog.querySelector('[data-erp-action-close]');
    if (close) close.onclick = () => dialog.close();
    if (form) {
      form.onsubmit = event => { event.preventDefault(); submit(action, form, dialog); };
      const resolution = form.elements.resolution;
      if (resolution) resolution.onchange = () => {
        const cash = dialog.querySelector('#erp-cash-fields');
        const enabled = resolution.value === 'cash_paid';
        if (cash) cash.hidden = !enabled;
        for (const name of ['cash_date','cash_amount']) {
          const field = form.elements[name];
          if (field) {
            field.required = enabled;
            field.disabled = !enabled;
            if (!enabled) field.value = '';
          }
        }
      };
    }
    dialog.showModal();
  }

  window.HasnariaERPActions = {canHandle, open, _buildRequest: buildRequest};
})();