(function () {
  'use strict';

  const HANDLED = new Set([
    'pack_conversion',
    'recipe_verification',
    'sale_item_mapping',
    'selling_price_confirmation',
    'inventory_baseline_confirmation',
    'financing_payment_review',
    'invalid_purchase_qty',
    'unmatched_purchase',
    'unverified_inventory',
    'zero_amount_purchase'
  ]);

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const money = value => value == null ? 'Belum tersedia' : 'Rp' + Number(value).toLocaleString('id-ID', {maximumFractionDigits:0});
  const number = value => value == null ? 'Belum tersedia' : Number(value).toLocaleString('id-ID');
  const context = () => window.__HASNARIA_CONTEXT;
  const db = () => window.__HASNARIA_DB;

  function canHandle(type) { return HANDLED.has(type); }
  function requireOwner() { const c=context(); if(!c||c.role!=='owner') throw new Error('Tindakan ini hanya dapat diselesaikan oleh Owner.'); }
  function positive(value,label){ const n=Number(value); if(!(n>0)) throw new Error(label+' harus lebih dari 0.'); return n; }
  function reason(value){ const text=String(value||'').trim(); if(!text) throw new Error('Alasan wajib diisi untuk audit trail.'); return text; }
  function todayJakarta(){ return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10); }

  function buildRequest(action, values) {
    const meta=action&&action.metadata||{};
    const type=action&&action.action_type;
    if(!canHandle(type)) throw new Error('Action type belum didukung oleh form ERP.');

    if(type==='zero_amount_purchase'){
      if(!meta.source_history_id) throw new Error('Source history ID tidak tersedia.');
      const resolution=String(values.resolution||'');
      if(!['actual_amount','exclude'].includes(resolution)) throw new Error('Pilih keputusan untuk baris Rp0.');
      let effectiveAmount=null;
      if(resolution==='actual_amount') effectiveAmount=positive(values.effective_amount,'Nominal aktual');
      return {rpc:'resolve_zero_amount_purchase_candidate',params:{p_source_history_id:meta.source_history_id,p_resolution:resolution,p_effective_amount:effectiveAmount,p_reason:reason(values.reason)}};
    }

    if(type==='unmatched_purchase'||type==='unverified_inventory'){
      const sourceName=String(values.source_name||action.subject||'').trim();
      if(!sourceName) throw new Error('Nama sumber pembelian tidak tersedia.');
      const ruleType=type==='unverified_inventory'?'inventory_alias':String(values.rule_type||'');
      if(!['inventory_alias','expense_candidate','payment_candidate','exclude'].includes(ruleType)) throw new Error('Pilih klasifikasi pembelian.');
      let inventoryItemId=null,expenseCategory=null,qtyMultiplier=null;
      if(ruleType==='inventory_alias'){
        inventoryItemId=String(values.inventory_item_id||'').trim();
        if(!inventoryItemId) throw new Error('Pilih inventory item tujuan.');
        qtyMultiplier=positive(values.qty_multiplier,'Quantity multiplier');
      }else if(ruleType==='expense_candidate'){
        expenseCategory=String(values.expense_category||'').trim();
        if(!expenseCategory) throw new Error('Kategori biaya wajib diisi.');
      }
      return {rpc:'resolve_purchase_item_rule',params:{p_source_name:sourceName,p_rule_type:ruleType,p_inventory_item_id:inventoryItemId,p_expense_category:expenseCategory,p_qty_multiplier:qtyMultiplier,p_reason:reason(values.reason),p_post:values.post===true||values.post==='on'||values.post==='true'}};
    }

    if(type==='invalid_purchase_qty'){
      const sourceHistoryId=values.source_history_id||meta.source_history_id;
      if(!sourceHistoryId) throw new Error('Pilih baris pembelian yang akan diperbaiki.');
      return {rpc:'resolve_purchase_quantity_override',params:{p_source_history_id:sourceHistoryId,p_effective_qty:positive(values.effective_qty,'Quantity efektif'),p_reason:reason(values.reason)}};
    }
    if(type==='pack_conversion'){
      if(!meta.conversion_id) throw new Error('Conversion ID tidak tersedia.');
      return {rpc:'resolve_inventory_conversion',params:{p_conversion_id:meta.conversion_id,p_units_per_purchase_unit:positive(values.units_per_purchase_unit,'Isi per pack'),p_reason:reason(values.reason)}};
    }
    if(type==='recipe_verification'){
      if(!meta.product_id) throw new Error('Product ID tidak tersedia.');
      const effectiveFrom=String(values.effective_from||'').trim();
      if(!effectiveFrom) throw new Error('Tanggal mulai berlaku wajib diisi.');
      if(effectiveFrom>todayJakarta()) throw new Error('Tanggal mulai berlaku tidak boleh di masa depan.');
      return {rpc:'resolve_product_recipe_verification_v2',params:{p_product_id:meta.product_id,p_verified:true,p_effective_from:effectiveFrom,p_reason:reason(values.reason)}};
    }
    if(type==='sale_item_mapping'){
      const productId=meta.suggested_product_id||values.product_id;
      if(!productId) throw new Error('Produk tujuan belum dipilih.');
      return {rpc:'resolve_sale_item_product_mapping',params:{p_source_name:meta.source_name||action.subject,p_product_id:productId,p_reason:reason(values.reason)}};
    }
    if(type==='selling_price_confirmation'){
      if(!meta.product_id) throw new Error('Product ID tidak tersedia.');
      return {rpc:'resolve_product_selling_price',params:{p_product_id:meta.product_id,p_selling_price:positive(values.selling_price,'Harga jual'),p_reason:reason(values.reason)}};
    }
    if(type==='inventory_baseline_confirmation'){
      if(!meta.source_history_id) throw new Error('Source history ID tidak tersedia.');
      return {rpc:'resolve_inventory_baseline_candidate',params:{p_source_history_id:meta.source_history_id,p_reason:reason(values.reason)}};
    }
    if(type==='financing_payment_review'){
      if(!meta.source_history_id) throw new Error('Source history ID tidak tersedia.');
      const resolution=String(values.resolution||'');
      if(!['cash_paid','liability_only','exclude'].includes(resolution)) throw new Error('Pilih keputusan pembiayaan.');
      let cashDate=null,cashAmount=null;
      if(resolution==='cash_paid'){
        cashDate=String(values.cash_date||'').trim();
        if(!cashDate) throw new Error('Tanggal pembayaran kas wajib diisi.');
        cashAmount=positive(values.cash_amount,'Nominal pembayaran kas');
      }
      return {rpc:'resolve_financing_payment_candidate',params:{p_source_history_id:meta.source_history_id,p_resolution:resolution,p_cash_date:cashDate,p_cash_amount:cashAmount,p_reason:reason(values.reason)}};
    }
    throw new Error('Action type belum didukung.');
  }

  function commonHeader(action){
    return '<h2 id="erp-dialog-title">'+esc(action.subject)+'</h2><p>'+esc(action.action_needed||'')+'</p><div class="erp-kpis"><div class="erp-kpi"><div>Nilai terkait</div><div class="value">'+money(action.financial_impact)+'</div></div><div class="erp-kpi"><div>Aktivitas terkait</div><div class="value">'+number(action.activity_impact)+'</div></div></div>';
  }
  function invalidRowLabel(row){ return [row.purchase_date||'Tanpa tanggal',row.quantity_text?'qty sumber '+row.quantity_text:'qty sumber kosong',money(row.total_amount),(row.source_file||'file')+' #'+(row.row_no||'—')].join(' · '); }

  async function openInvalidQuantity(action,dialog){
    dialog.innerHTML=commonHeader(action)+'<p class="erp-note warn">Perbaikan dilakukan per baris sumber. Raw Excel tidak diubah; override akan diaudit.</p><p role="status">Memuat baris pembelian…</p>';
    dialog.showModal();
    const result=await db().from('ui_invalid_quantity_queue').select('*').eq('brand_id',context().brandId).eq('item_name',action.subject).order('purchase_date',{ascending:false}).limit(100).abortSignal(AbortSignal.timeout(30000));
    if(result.error) throw result.error;
    const rows=result.data||[];
    if(!rows.length){
      dialog.innerHTML=commonHeader(action)+'<p class="erp-note">Tidak ada lagi baris invalid quantity untuk item ini. Muat ulang Action Center.</p><div class="erp-form-actions"><button type="button" data-erp-action-close>Tutup</button></div>';
      const close=dialog.querySelector('[data-erp-action-close]'); if(close) close.onclick=()=>dialog.close(); return;
    }
    dialog.innerHTML=commonHeader(action)+'<p class="erp-note warn">Pilih baris sumber yang benar. Suggested quantity hanya diisi otomatis jika total ÷ harga satuan menghasilkan angka bulat secara deterministik.</p><form id="erp-action-form" class="erp-form"><label class="erp-wide">Baris pembelian<select name="source_history_id" required><option value="">Pilih…</option>'+rows.map(row=>'<option value="'+esc(row.source_history_id)+'">'+esc(invalidRowLabel(row))+'</option>').join('')+'</select></label><label>Quantity efektif<input name="effective_qty" type="number" min="0.000001" step="any" required></label><div id="erp-invalid-hint" class="erp-note">Pilih baris untuk melihat apakah ada suggestion deterministik.</div><label class="erp-wide">Alasan / catatan audit<textarea name="reason" rows="3" required placeholder="Tuliskan dasar quantity yang benar"></textarea></label><p id="erp-action-message" class="erp-wide erp-message" role="status"></p><div class="erp-form-actions erp-wide"><button type="button" data-erp-action-close>Tutup</button><button class="primary" type="submit">Simpan quantity efektif</button></div></form>';
    const form=dialog.querySelector('#erp-action-form'),close=dialog.querySelector('[data-erp-action-close]'),select=form.elements.source_history_id,qty=form.elements.effective_qty,hint=dialog.querySelector('#erp-invalid-hint');
    if(close) close.onclick=()=>dialog.close();
    select.onchange=()=>{const row=rows.find(x=>String(x.source_history_id)===select.value);qty.value='';if(!row){hint.textContent='Pilih baris untuk melihat apakah ada suggestion deterministik.';return;}if(row.can_apply_suggestion&&Number(row.suggested_qty)>0){qty.value=row.suggested_qty;hint.textContent='Suggestion deterministik: '+number(row.suggested_qty)+' ('+row.suggestion_method+'). Tetap periksa dokumen sumber sebelum simpan.';}else hint.textContent='Tidak ada suggestion deterministik. Isi quantity dari dokumen sumber.';};
    form.onsubmit=event=>{event.preventDefault();submit(action,form,dialog);};
  }

  function inventoryOptions(rows){ return '<option value="">Pilih inventory item…</option>'+rows.map(row=>'<option value="'+esc(row.inventory_item_id)+'">'+esc(row.item_name+' · '+(row.unit||'tanpa satuan'))+'</option>').join(''); }
  async function openPurchaseRule(action,dialog){
    dialog.innerHTML=commonHeader(action)+'<p class="erp-note warn">Klasifikasi ini adalah keputusan bisnis manual. Tidak ada pilihan yang diterapkan otomatis.</p><p role="status">Memuat master inventory…</p>';dialog.showModal();
    const result=await db().from('ui_inventory_items').select('inventory_item_id,item_name,unit,category,brand_id').eq('brand_id',context().brandId).order('item_name',{ascending:true}).limit(500).abortSignal(AbortSignal.timeout(30000));
    if(result.error) throw result.error;
    const inventory=result.data||[],fixedInventory=action.action_type==='unverified_inventory';
    dialog.innerHTML=commonHeader(action)+'<p class="erp-note warn">'+(fixedInventory?'Konfirmasi inventory item dan multiplier. Jangan gunakan multiplier 1 kecuali benar sesuai unit pembelian.':'Pilih klasifikasi untuk nama sumber ini. Khusus item ambigu seperti PINES, jangan pilih inventory/expense tanpa bukti sumber.')+'</p><form id="erp-action-form" class="erp-form"><input type="hidden" name="source_name" value="'+esc(action.subject)+'">'+(fixedInventory?'<input type="hidden" name="rule_type" value="inventory_alias"><div class="erp-wide erp-note"><b>Klasifikasi:</b> Inventory alias (perlu dikonfirmasi)</div>':'<label>Klasifikasi<select name="rule_type" required><option value="">Pilih…</option><option value="inventory_alias">Inventory alias</option><option value="expense_candidate">Expense candidate</option><option value="payment_candidate">Payment candidate</option><option value="exclude">Exclude</option></select></label>')+'<div id="erp-rule-inventory" class="erp-wide" '+(fixedInventory?'':'hidden')+'><div class="erp-form"><label>Inventory item<select name="inventory_item_id">'+inventoryOptions(inventory)+'</select></label><label>Quantity multiplier<input name="qty_multiplier" type="number" min="0.000001" step="any" placeholder="Wajib untuk inventory alias"></label></div><p class="erp-note">Multiplier mengubah quantity sumber menjadi unit inventory. Jangan menebak.</p></div><label id="erp-rule-expense" class="erp-wide" hidden>Kategori biaya<input name="expense_category" placeholder="Contoh: store_supplies"></label><label class="erp-wide erp-check"><input name="post" type="checkbox"> Posting transaksi historis setelah rule tersimpan <small>Default tidak aktif. Aktifkan hanya jika mapping/unit sudah benar.</small></label><label class="erp-wide">Alasan / catatan audit<textarea name="reason" rows="3" required placeholder="Tuliskan dasar klasifikasi"></textarea></label><p id="erp-action-message" class="erp-wide erp-message" role="status"></p><div class="erp-form-actions erp-wide"><button type="button" data-erp-action-close>Tutup</button><button class="primary" type="submit">Simpan klasifikasi</button></div></form>';
    const form=dialog.querySelector('#erp-action-form'),close=dialog.querySelector('[data-erp-action-close]'),rule=form.elements.rule_type,inventoryBlock=dialog.querySelector('#erp-rule-inventory'),expenseField=dialog.querySelector('#erp-rule-expense');
    if(close) close.onclick=()=>dialog.close();
    const sync=()=>{const value=fixedInventory?'inventory_alias':rule.value;if(inventoryBlock)inventoryBlock.hidden=value!=='inventory_alias';if(expenseField)expenseField.hidden=value!=='expense_candidate';const inv=form.elements.inventory_item_id,mult=form.elements.qty_multiplier,exp=form.elements.expense_category;if(inv)inv.required=value==='inventory_alias';if(mult)mult.required=value==='inventory_alias';if(exp)exp.required=value==='expense_candidate';if(value!=='inventory_alias'){if(inv)inv.value='';if(mult)mult.value='';}if(value!=='expense_candidate'&&exp)exp.value='';};
    if(rule&&!fixedInventory) rule.onchange=sync;sync();form.onsubmit=event=>{event.preventDefault();submit(action,form,dialog);};
  }

  function formHtml(action){
    const meta=action.metadata||{},type=action.action_type;let body='',submitLabel='Simpan keputusan';
    if(type==='pack_conversion'){
      body='<p class="erp-note warn">Isi per pack harus berasal dari kemasan/supplier yang benar. Jangan menebak.</p><label>Isi per pack<input name="units_per_purchase_unit" type="number" min="0.000001" step="any" required placeholder="Contoh: 50"></label>';submitLabel='Verifikasi konversi';
    }else if(type==='recipe_verification'){
      body='<p class="erp-note warn">Verifikasi hanya jika BOM, komponen, dan qty per penjualan sudah lengkap. HPP berlaku mulai tanggal yang dipilih.</p><div class="erp-wide erp-note"><b>Ringkasan resep</b><br>'+esc(meta.recipe_summary||'Belum tersedia')+'<br><small>Komponen aktif: '+number(meta.active_components)+'</small></div><label>Tanggal mulai berlaku<input name="effective_from" type="date" max="'+todayJakarta()+'" required></label>';submitLabel='Verifikasi resep';
    }else if(type==='sale_item_mapping'){
      if(!meta.suggested_product_id) body='<p class="erp-note warn">Belum ada saran produk yang dapat dikonfirmasi dari Action Center. Buka modul Penjualan untuk memilih produk tujuan.</p>';
      else{body='<div class="erp-wide erp-note"><b>Nama transaksi:</b> '+esc(meta.source_name||action.subject)+'<br><b>Saran produk:</b> '+esc(meta.suggested_product_name||'Produk tersaran')+'<br><b>Confidence:</b> '+esc(meta.suggestion_confidence||'Belum tersedia')+'</div>';submitLabel='Konfirmasi mapping';}
    }else if(type==='selling_price_confirmation'){
      body='<p class="erp-note">Suggestion hanya referensi histori transaksi dan tidak diterapkan otomatis.</p><div class="erp-wide erp-note"><b>Confidence:</b> '+esc(meta.confidence||'Belum tersedia')+' · <b>Observasi:</b> '+number(meta.observation_count)+'<br><b>Rentang teramati:</b> '+money(meta.min_observed_price)+' – '+money(meta.max_observed_price)+'</div><label>Harga jual<input name="selling_price" type="number" min="0.01" step="any" required value="'+esc(meta.suggested_selling_price||'')+'"></label>';submitLabel='Simpan harga jual';
    }else if(type==='inventory_baseline_confirmation'){
      body='<p class="erp-note warn">Ini baseline historis, bukan stok hari ini. Konfirmasi hanya jika stok akhir periode sumber memang benar.</p><div class="erp-wide erp-note"><b>Tanggal baseline:</b> '+esc(meta.baseline_date||'Belum tersedia')+'<br><b>Qty akhir historis:</b> '+number(meta.ending_qty)+' '+esc(meta.unit||'')+'</div>';submitLabel='Konfirmasi baseline historis';
    }else if(type==='zero_amount_purchase'){
      body='<p class="erp-note warn">Baris sumber bernilai Rp0. Isi nominal aktual hanya dari bukti pembelian; jika baris memang tidak seharusnya diposting, pilih Exclude.</p><div class="erp-wide erp-note"><b>Tanggal sumber:</b> '+esc(meta.purchase_date||'Belum tersedia')+'<br><b>Mapping:</b> '+esc(meta.mapping_status||'Belum tersedia')+'<br><b>File:</b> '+esc((meta.source_file||'—')+' #'+(meta.row_no||'—'))+'</div><label>Keputusan<select name="resolution" required><option value="">Pilih…</option><option value="actual_amount">Isi nominal aktual</option><option value="exclude">Exclude</option></select></label><label id="erp-zero-fields" hidden>Nominal aktual<input name="effective_amount" type="number" min="0.01" step="any" placeholder="Nominal berdasarkan bukti"></label>';submitLabel='Simpan keputusan nominal';
    }else if(type==='financing_payment_review'){
      body='<p class="erp-note warn">Pilih cash_paid hanya jika uang benar-benar keluar dari kas/bank pada tanggal yang diisi.</p><div class="erp-wide erp-note"><b>Tanggal sumber:</b> '+esc(meta.purchase_date||'Belum tersedia')+'<br><b>Nilai kandidat:</b> '+money(meta.amount)+'<br><b>Metode sumber:</b> '+esc(meta.payment_method||'Belum tersedia')+'</div><label>Keputusan<select name="resolution" required><option value="">Pilih…</option><option value="cash_paid">Cash paid</option><option value="liability_only">Liability only</option><option value="exclude">Exclude</option></select></label><fieldset id="erp-cash-fields" class="erp-wide" hidden><div class="erp-form"><label>Tanggal pembayaran<input name="cash_date" type="date"></label><label>Nominal dibayar<input name="cash_amount" type="number" min="0.01" step="any"></label></div></fieldset>';submitLabel='Simpan keputusan pembiayaan';
    }
    const canSubmit=!(type==='sale_item_mapping'&&!meta.suggested_product_id);
    return commonHeader(action)+'<form id="erp-action-form" class="erp-form">'+body+'<label class="erp-wide">Alasan / catatan audit<textarea name="reason" rows="3" required placeholder="Tuliskan dasar keputusan"></textarea></label><p id="erp-action-message" class="erp-wide erp-message" role="status"></p><div class="erp-form-actions erp-wide"><button type="button" data-erp-action-close>Tutup</button>'+(canSubmit?'<button class="primary" type="submit">'+esc(submitLabel)+'</button>':'')+'</div></form>';
  }

  function valuesFrom(form){const out={};new FormData(form).forEach((value,key)=>{out[key]=value;});return out;}
  async function submit(action,form,dialog){
    requireOwner();const button=form.querySelector('button[type="submit"]'),message=form.querySelector('#erp-action-message');if(button)button.disabled=true;if(message)message.textContent='Menyimpan keputusan…';
    try{const request=buildRequest(action,valuesFrom(form));const result=await db().rpc(request.rpc,request.params).abortSignal(AbortSignal.timeout(30000));if(result.error)throw result.error;if(message)message.textContent='Berhasil disimpan.';dialog.close();document.dispatchEvent(new CustomEvent('hasnaria:erp-action-resolved',{detail:{actionType:action.action_type,rpc:request.rpc}}));}catch(error){if(message)message.textContent=error&&error.message?error.message:String(error);if(button)button.disabled=false;}
  }

  function open(action,dialog){
    requireOwner();if(!dialog)throw new Error('Dialog ERP tidak tersedia.');if(!canHandle(action&&action.action_type))throw new Error('Action type belum didukung oleh form ERP.');
    if(action.action_type==='unmatched_purchase'||action.action_type==='unverified_inventory'){
      openPurchaseRule(action,dialog).catch(error=>{dialog.innerHTML=commonHeader(action)+'<p class="erp-note error">'+esc(error&&error.message?error.message:error)+'</p><div class="erp-form-actions"><button type="button" data-erp-action-close>Tutup</button></div>';const close=dialog.querySelector('[data-erp-action-close]');if(close)close.onclick=()=>dialog.close();});return;
    }
    if(action.action_type==='invalid_purchase_qty'){
      openInvalidQuantity(action,dialog).catch(error=>{dialog.innerHTML=commonHeader(action)+'<p class="erp-note error">'+esc(error&&error.message?error.message:error)+'</p><div class="erp-form-actions"><button type="button" data-erp-action-close>Tutup</button></div>';const close=dialog.querySelector('[data-erp-action-close]');if(close)close.onclick=()=>dialog.close();});return;
    }
    dialog.innerHTML=formHtml(action);const form=dialog.querySelector('#erp-action-form'),close=dialog.querySelector('[data-erp-action-close]');if(close)close.onclick=()=>dialog.close();
    if(form){
      form.onsubmit=event=>{event.preventDefault();submit(action,form,dialog);};
      const resolution=form.elements.resolution;
      if(resolution) resolution.onchange=()=>{
        const cash=dialog.querySelector('#erp-cash-fields'),cashEnabled=resolution.value==='cash_paid';if(cash)cash.hidden=!cashEnabled;
        for(const name of ['cash_date','cash_amount']){const field=form.elements[name];if(field){field.required=cashEnabled;field.disabled=!cashEnabled;if(!cashEnabled)field.value='';}}
        const zero=dialog.querySelector('#erp-zero-fields'),zeroEnabled=resolution.value==='actual_amount';if(zero)zero.hidden=!zeroEnabled;const amount=form.elements.effective_amount;if(amount){amount.required=zeroEnabled;amount.disabled=!zeroEnabled;if(!zeroEnabled)amount.value='';}
      };
      if(resolution)resolution.onchange();
    }
    dialog.showModal();
  }

  window.HasnariaERPActions={canHandle,open,_buildRequest:buildRequest};
})();