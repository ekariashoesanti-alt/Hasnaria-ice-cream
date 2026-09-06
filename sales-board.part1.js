ice && STATE.slice.type === 'day' && STATE.slice.id === x.key;
        return { x: xx, y: yy, d: x, sel: isSelected };
      });

      var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
      var area = 'M' + pts[0].x.toFixed(1) + ' ' + (h - padB) + ' ' + pts.map(function (p) { return 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ') + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (h - padB) + ' Z';

      var labelStep = Math.max(1, Math.ceil(data.length / 8));
      var labels = pts.map(function (p, i) {
        if (i % labelStep === 0 || i === data.length - 1) {
          return '<text x="' + p.x + '" y="' + (h - 16) + '" text-anchor="middle" class="x-label">' + esc(p.d.label) + '</text>';
        }
        return '';
      }).join('');

      var dots = pts.map(function (p) {
        var tip = esc(p.d.sub) + ' · ' + esc(money(p.d.omzet)) + ' (' + p.d.trx + ' trx)';
        var dotClass = 'sb-chart-point' + (p.sel ? ' on-slice' : '');
        return '<g class="sb-chart-dot-group" data-slice-type="day" data-slice-id="' + p.d.key + '" data-slice-label="Tgl ' + esc(p.d.sub) + '">' +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="12" class="sb-touch-target"/>' +
          (p.sel ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="8" class="sb-chart-ring"/>' : '') +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (p.sel ? '5' : '4') + '" class="' + dotClass + '"/>' +
          '<title>' + tip + ' • Klik untuk slice</title></g>';
      }).join('');

      return '<div class="sb-chart-wrap">' +
        '<svg class="sb-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
        '<defs>' +
        '<linearGradient id="sbAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#176b55" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="#176b55" stop-opacity="0.01"/>' +
        '</linearGradient>' +
        '</defs>' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (h - padB) + '" class="axis"/>' +
        '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - padR) + '" y2="' + (h - padB) + '" class="axis"/>' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + (w - padR) + '" y2="' + padT + '" class="grid-line"/>' +
        '<line x1="' + padL + '" y1="' + ((padT + h - padB) / 2) + '" x2="' + (w - padR) + '" y2="' + ((padT + h - padB) / 2) + '" class="grid-line"/>' +
        '<path d="' + area + '" fill="url(#sbAreaGrad)"/>' +
        '<path d="' + path + '" class="trend"/>' +
        dots +
        '<text x="8" y="' + (padT + 4) + '" class="ylabel">' + esc(money(max)) + '</text>' +
        '<text x="8" y="' + ((padT + h - padB) / 2 + 4) + '" class="ylabel">' + esc(money(max / 2)) + '</text>' +
        '<text x="8" y="' + (h - padB) + '" class="ylabel">Rp 0</text>' +
        labels +
        '</svg>' +
        '<div class="sb-chart-hint">💡 Klik titik pada grafik harian untuk slice langsung performa produk hari tersebut</div>' +
        '</div>';
    }

    // Weekly or Monthly Bar Chart
    var nBars = data.length;
    var availW = w - padL - padR;
    var colW = availW / nBars;
    var barW = Math.min(54, colW * 0.65);

    var barsHtml = data.map(function (item, i) {
      var barH = max > 0 ? (h - padT - padB) * (item.omzet / max) : 0;
      var bx = padL + i * colW + (colW - barW) / 2;
      var by = (h - padB) - barH;
      var isSelected = STATE.slice && STATE.slice.type === item.type && STATE.slice.id === item.key;
      var barClass = 'sb-chart-bar' + (isSelected ? ' on-slice' : '');
      var tip = esc(item.label) + (item.sub ? ' (' + item.sub + ')' : '') + ': ' + money(item.omzet) + ' · ' + item.trx + ' trx. Klik untuk slice.';

      return '<g class="sb-bar-group" data-slice-type="' + item.type + '" data-slice-id="' + item.key + '" data-slice-label="' + esc(item.label) + (item.sub ? ' (' + item.sub + ')' : '') + '">' +
        '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(3, barH) + '" rx="5" class="' + barClass + '"/>' +
        (item.omzet > 0 ? '<text x="' + (bx + barW / 2) + '" y="' + (by - 6) + '" text-anchor="middle" class="bar-val-text">' + money(item.omzet).replace('Rp ', '') + '</text>' : '') +
        '<text x="' + (bx + barW / 2) + '" y="' + (h - 22) + '" text-anchor="middle" class="x-label-bold">' + esc(item.label) + '</text>' +
        (item.sub ? '<text x="' + (bx + barW / 2) + '" y="' + (h - 9) + '" text-anchor="middle" class="x-sub-label">' + esc(item.sub) + '</text>' : '') +
        '<title>' + tip + '</title></g>';
    }).join('');

    return '<div class="sb-chart-wrap">' +
      '<svg class="sb-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - padR) + '" y2="' + (h - padB) + '" class="axis"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + (w - padR) + '" y2="' + padT + '" class="grid-line"/>' +
      '<line x1="' + padL + '" y1="' + ((padT + h - padB) / 2) + '" x2="' + (w - padR) + '" y2="' + ((padT + h - padB) / 2) + '" class="grid-line"/>' +
      barsHtml +
      '<text x="8" y="' + (padT + 4) + '" class="ylabel">' + esc(money(max)) + '</text>' +
      '<text x="8" y="' + (h - padB) + '" class="ylabel">Rp 0</text>' +
      '</svg>' +
      '<div class="sb-chart-hint">💡 Klik batang periode untuk mengisolasi dan melihat Top/Worst Performer pada minggu/bulan tersebut</div>' +
      '</div>';
  }

  // Interactive Top & Worst Performer Bar List
  function renderSkuList(items, isWorst, totalQty, totalRev) {
    if (!items.length) {
      return '<div class="sb-empty-list">Belum ada rincian SKU pada slice ini.<br><span style="font-size:11px;color:#7a8982">Upload Detail Transaksi Majoo untuk performa produk harian.</span></div>';
    }
    var metric = STATE.skuMetric;
    var maxVal = Math.max.apply(null, items.map(function (x) { return metric === 'rev' ? x.rev : x.qty; }).concat([1]));
    var grandTotal = metric === 'rev' ? (totalRev || 1) : (totalQty || 1);

    return '<div class="sb-bars">' + items.map(function (x, i) {
      var val = metric === 'rev' ? x.rev : x.qty;
      var valDisplay = metric === 'rev' ? money(val) : (x.qty.toLocaleString('id-ID') + ' pcs');
      var sharePct = ((val / grandTotal) * 100).toFixed(1) + '%';
      var barWidth = Math.max(5, (val / maxVal) * 100);
      var fillClass = isWorst ? 'sb-bar-fill worst' : 'sb-bar-fill';
      var rankClass = isWorst ? 'sb-bar-rank worst' : 'sb-bar-rank';

      return '<div class="sb-bar-row">' +
        '<div class="' + rankClass + '">' + (i + 1) + '</div>' +
        '<div class="sb-bar-label">' +
        '<span title="' + esc(x.name) + '">' + esc(x.name) + '</span>' +
        '<b>' + esc(valDisplay) + ' <small class="sb-share">(' + sharePct + ')</small></b>' +
        '</div>' +
        '<div class="sb-bar-track">' +
        '<div class="' + fillClass + '" style="width:' + barWidth.toFixed(1) + '%"></div>' +
        '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderUploadSection() {
    var hasFiles = STATE.stagedFiles && STATE.stagedFiles.length > 0;
    var pillHtml = '';
    if (hasFiles) {
      var count = STATE.stagedFiles.length;
      var totalBytes = STATE.stagedFiles.reduce(function (sum, f) { return sum + (f.size || 0); }, 0);
      var totalKb = Math.round(totalBytes / 1024);
      var sizeDisp = totalKb >= 1024 ? (totalKb / 1024).toFixed(1) + ' MB' : totalKb + ' KB';

      var titleText = count === 1 ? STATE.stagedFiles[0].name : (count + ' File Dipilih (Multi-Bulan / Periode)');
      var tagText = count === 1 ? (STATE.stagedFileType || 'File Majoo') + ' (' + sizeDisp + ')' : (count + ' file Majoo · Total ' + sizeDisp);

      pillHtml = '<div class="sb-file-pill active" id="sbFilePill">' +
        '<span class="sb-file-icon">' + (count > 1 ? '📚' : '📄') + '</span>' +
        '<div class="sb-file-info">' +
        '<span class="sb-file-name" title="' + esc(titleText) + '">' + esc(titleText) + '</span>' +
        '<span class="sb-file-tag">' + esc(tagText) + '</span>' +
        '</div>' +
        '<button type="button" class="sb-file-del" id="sbBtnCancelFile" title="Batalkan pilihan file">✕</button>' +
        '</div>';
    }

    return '<div class="sb-upload-wrap">' +
      '<input id="sbFileInput" type="file" accept=".csv,.xlsx,.xls,.txt" multiple style="display:none">' +
      '<button type="button" class="sb-btn-upload" id="sbBtnChoose">' +
      '<span>📁</span> Upload dari Majoo' +
      '</button>' +
      pillHtml +
      '<button type="button" class="sb-btn-submit ' + (hasFiles && !STATE.importing ? 'ready' : '') + '" id="sbBtnSubmit" ' + (!hasFiles || STATE.importing ? 'disabled' : '') + '>' +
      (STATE.importing ? '<span class="sb-spin">⏳</span> ' + esc(STATE.importProgress || 'Memproses…') : '<span>⬆</span> Submit Data') +
      '</button>' +
      '<button type="button" class="sb-btn-format" id="sbBtnFormat" title="Panduan multi-periode & 3 format file Majoo">' +
      'Format & Multi-Periode' +
      '</button>' +
      '</div>';
  }


  function paintImportStatus() {
    var s = STATE.importStatus;
    var host = document.getElementById('sales');
    if (!host) return false;
    var overlay = host.querySelector('#sbImportStatusOverlay');
    if (!s) {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      return true;
    }
    if (!overlay) return false;
    var icon = overlay.querySelector('.sb-status-icon');
    var h3 = overlay.querySelector('h3');
    var main = overlay.querySelector('.sb-status-main');
    var detail = overlay.querySelector('.sb-status-detail');
    var fill = overlay.querySelector('.sb-status-fill');
    var pctEl = overlay.querySelector('b');
    var cls = s.type === 'error' ? 'error' : (s.type === 'success' ? 'success' : 'progress');
    if (icon) { icon.className = 'sb-status-icon ' + cls; icon.textContent = s.type === 'error' ? '✕' : (s.type === 'success' ? '✓' : '↑'); }
    if (h3) h3.textContent = s.type === 'error' ? 'Upload Gagal' : (s.type === 'success' ? 'Upload Selesai' : 'Upload Sedang Berjalan');
    if (main) main.textContent = s.message || '';
    if (detail) {
      if (s.detail) { detail.style.display = ''; detail.textContent = s.detail; }
      else detail.style.display = 'none';
    }
    if (s.type === 'progress') {
      var pct = Math.max(3, Math.min(100, Number(s.percent) || 0));
      if (fill) fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    }
    var btn = host.querySelector('#sbBtnSubmit');
    if (btn && STATE.importing) {
      btn.innerHTML = '<span class="sb-spin">⏳</span> ' + esc(STATE.importProgress || 'Memproses…');
      btn.disabled = true;
      btn.className = 'sb-btn-submit';
    }
    return true;
  }

  function setImportStatus(type, message, detail, percent) {
    STATE.importStatus = { type: type, message: message || '', detail: detail || '', percent: percent == null ? 0 : percent };
    if (type === 'progress') STATE.importProgress = message + (detail ? ' — ' + detail : '');
    if (!paintImportStatus()) draw();
  }

  function renderImportStatusModal() {
    var s = STATE.importStatus; if (!s) return '';
    var cls=s.type==='error'?'error':(s.type==='success'?'success':'progress');
    var title=s.type==='error'?'Upload Gagal':(s.type==='success'?'Upload Selesai':'Upload Sedang Berjalan');
    var icon=s.type==='error'?'✕':(s.type==='success'?'✓':'↑');
    return '<div class="sb-modal-overlay" id="sbImportStatusOverlay"><div class="sb-modal-card sb-status-card">' +
      '<div class="sb-status-icon '+cls+'">'+icon+'</div><h3>'+esc(title)+'</h3><p class="sb-status-main">'+esc(s.message||'')+'</p>' +
      (s.detail?'<p class="sb-status-detail">'+esc(s.detail)+'</p>':'') +
      (s.type==='progress'?'<div class="sb-status-track"><div class="sb-status-fill" style="width:'+Math.max(3,Math.min(100,s.percent||0))+'%"></div></div><b>'+Math.round(s.percent||0)+'%</b>':'') +
      ((s.type==='success'||s.type==='error')?'<button id="sbImportStatusClose" class="sb-btn-modal-ok">Tutup</button>':'') +
      '</div></div>';
  }

  function renderFormatHelpModal() {
    if (!STATE.showHelp) return '';
    return '<div class="sb-modal-overlay" id="sbModalOverlay">' +
      '<div class="sb-modal-card">' +
      '<div class="sb-modal-head">' +
      '<h3>Panduan Upload & Multi-Periode Majoo</h3>' +
      '<button type="button" class="sb-modal-close" id="sbModalClose">✕</button>' +
      '</div>' +
      '<div class="sb-modal-body">' +
      '<div class="sb-fmt-box" style="background:#f0fdf4;border-color:#bbf7d0">' +
      '<b>✨ Mendukung Multi-Periode (Januari – Desember):</b>' +
      '<p style="margin:4px 0 0">Anda dapat meng-upload <b>1 file langsung rentang 1 tahun penuh</b>, ATAU memilih <b>sekaligus banyak file bulanan</b> (misal 12 file CSV/Excel Jan–Des dengan menahan tombol Ctrl/Shift). Sistem otomatis membagi dalam batch 50 hari ke Supabase tanpa error/timeout dan langsung menyajikan grafik 12 bulan.</p>' +
      '</div>' +
      '<p style="margin-top:10px">Sistem Hasnaria mendeteksi 3 jenis file export Majoo POS:</p>' +
      '<div class="sb-fmt-box">' +
      '<b>1. Laporan Detail Transaksi (CSV) — Sangat Direkomendasikan ⭐</b>' +
      '<p>Export per nota/struk: tanggal, nomor struk, omzet, metode bayar (Cash, QRIS, Transfer/Gojek), dan <b>rincian produk terjual harian</b>.</p>' +
      '<small>Kolom: No Transaksi, Waktu Order, Produk, Total Penjualan, Metode Pembayaran.</small>' +
      '</div>' +
      '<div class="sb-fmt-box">' +
      '<b>2. Laporan Penjualan per Periode (CSV)</b>' +
      '<p>Ringkasan penjualan harian: tanggal penjualan, omzet harian, jumlah transaksi harian, dan laba kotor.</p>' +
      '<small>Kolom: Periode (Kamis, 01 Jan 2026), Penjualan (Rp.), Total Transaksi.</small>' +
      '</div>' +
      '<div class="sb-fmt-box">' +
      '<b>3. Laporan Penjualan Produk (CSV / Excel)</b>' +
      '<p>Rekapitulasi penjualan per SKU produk, jumlah pcs terjual, omzet produk, dan HPP.</p>' +
      '<small>Kolom: Produk, SKU, Jumlah Terjual, Penjualan (Rp.), Laba Kotor.</small>' +
      '</div>' +
      '<p style="font-size:12px;color:#5d6d66;margin-top:10px">💡 Catatan Database: Upload bulan baru tidak akan menimpa/menghapus bulan yang sudah ada di Supabase. Data tersimpan rapi per tanggal.</p>' +
      '</div>' +
      '<div class="sb-modal-foot">' +
      '<button type="button" class="sb-btn-modal-ok" id="sbModalOk">Mengerti</button>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function draw() {
    var host = document.getElementById('sales'); if (!host) return;
    var board = host.querySelector('.sale-board');
    if (!board) {
      board = document.createElement('div'); board.className = 'sale-board'; board.id = 'saleBoard';
      host.insertBefore(board, host.firstChild);
    }
    if (STATE.draw) return;
    STATE.draw = true;

    var html = '<div class="sb-wrap">' +
      '<div class="sb-head">' +
      '<div>' +
      '<div class="sb-eyebrow">SALES INTELLIGENCE</div>' +
      '<h2>Dashboard Penjualan</h2>' +
      '<p>Tren omzet, performa produk terlaris & terendah, serta integrasi export Majoo.</p>' +
      '</div>' +
      renderUploadSection() +
      '</div>';

    if (STATE.error) html += '<div class="sb-error">' + esc(STATE.error) + '</div>';
    if (STATE.msg) html += '<div class="sb-ok">' + esc(STATE.msg) + '</div>';

    if (STATE.loading) {
      board.innerHTML = html + '<div class="sb-loading">Memuat data penjualan…</div></div>' + renderFormatHelpModal();
      STATE.draw = false; bind(); return;
    }

    if (!STATE.rows.length) {
      html += '<div class="sb-empty">' +
        '<div class="sb-empty-icon">📊</div>' +
        '<h3>Belum ada data penjualan tersimpan</h3>' +
        '<p>Upload file export Majoo (Detail Transaksi, Laporan Periode, atau Laporan Produk) untuk langsung mengaktifkan dashboard interaktif.</p>' +
        '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button type="button" class="sb-btn-upload" id="sbBtnChooseEmpty"><span>📁</span> Pilih File Majoo Sekarang</button>' +
        '<button type="button" class="sb-help" id="sbBtnSeedDemo" style="background:#eef7f3;border-color:#176b55;color:#176b55;font-weight:700">⚡ Muat Data Majoo Jan 2026 (337 Transaksi)</button>' +
        '</div>' +
        '</div></div>' + renderFormatHelpModal();
      board.innerHTML = html; STATE.draw = false; bind(); return;
    }

    ensureView();
    var active = selectedWindow();
    // Tahunan: chart + Top/Worst use the full selected year, while KPI cards
    // remain locked to the selected month exactly as requested.
    var kpiWindow = (STATE.mode === 'monthly' && STATE.viewMonth)
      ? { start: STATE.viewMonth + '-01', end: lastDayOfMonth(STATE.viewMonth) }
      : active;
    var prev = previousFor(kpiWindow);
    var ar = rangeRows(active), pr = rangeRows(prev);
    var kpiRows = rangeRows(kpiWindow);
    var slicedRows = getSlicedRows(ar);

    var aStats = statsFor(getSlicedRows(kpiRows).length ? getSlicedRows(kpiRows) : kpiRows);
    var pStats = statsFor(pr);
    var trendData = groupTrend(ar, STATE.mode);

    // SKUs: annual accumulation in Tahunan mode; monthly/weekly/daily keep their selected window.
    var skuRows = (STATE.mode === 'monthly') ? ar : slicedRows;
    var allSkus = aggregateSku(skuRows);
    var totalSkuQty = allSkus.reduce(function (s, x) { return s + x.qty; }, 0);
    var totalSkuRev = allSkus.reduce(function (s, x) { return s + x.rev; }, 0);

    var metricKey = STATE.skuMetric === 'rev' ? 'rev' : 'qty';
    var sortedSkus = allSkus.slice().sort(function (x, y) { return y[metricKey] - x[metricKey]; });
    var top5 = sortedSkus.slice(0, 5);
    var worst5 = sortedSkus.slice().filter(function (x) { return (x[metricKey] || 0) > 0; }).reverse().slice(0, 5);

    var mm = dataMinMax();
    var months = monthsInData();
    var monthOpts = '<option value="">Semua</option>' + months.map(function (ym) {
      var IDM = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      var lab = IDM[Number(ym.slice(5, 7))] + ' ' + ym.slice(0, 4);
      return '<option value="' + ym + '"' + (STATE.viewMonth === ym ? ' selected' : '') + '>' + lab + '</option>';
    }).join('');

    var vsLab = 'vs bulan lalu';
    var trendLab = STATE.mode === 'monthly' ? (STATE.viewMonth ? 'Januari–Desember tahun yang sama' : 'Semua bulan dalam data') : (STATE.mode === 'weekly' ? 'Minggu 1–5 di bulan ' + monthOfView() : 'Harian di bulan ' + monthOfView());

    // Filter toolbar
    html += '<di