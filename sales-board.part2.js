= allSkus.reduce(function (s, x) { return s + x.rev; }, 0);

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
    html += '<div class="sb-period">' +
      '<div class="sb-cal">' +
      '<b>Periode</b>' +
      '<label>Bulan <select id="sbMonth">' + monthOpts + '</select></label>' +
      '<label>Dari <input id="sbFrom" type="date" value="' + esc(STATE.viewFrom) + '" min="' + esc(mm.min) + '" max="' + esc(mm.max) + '"></label>' +
      '<label>Sampai <input id="sbTo" type="date" value="' + esc(STATE.viewTo) + '" min="' + esc(mm.min) + '" max="' + esc(mm.max) + '"></label>' +
      '<span>' + esc(active.start) + ' s/d ' + esc(active.end) + ' · ' + ar.length + ' hari aktif</span>' +
      '</div>' +
      '<div class="sb-toggle">' +
      ['daily', 'weekly', 'monthly'].map(function (m) {
        var t = m === 'daily' ? 'Harian' : m === 'weekly' ? 'Mingguan' : 'Tahunan';
        return '<button type="button" class="' + (STATE.mode === m ? 'on' : '') + '" data-mode="' + m + '">' + t + '</button>';
      }).join('') +
      '</div>' +
      '</div>';

    // Interactive Slice Alert Banner
    if (STATE.slice) {
      var sliceTypeLabel = STATE.slice.type === 'day' ? 'Harian' : (STATE.slice.type === 'week' ? 'Mingguan' : 'Bulanan');
      html += '<div class="sb-slice-alert">' +
        '<div class="sb-slice-info">' +
        '<span class="sb-slice-badge">⚡ Slice Aktif</span>' +
        '<span>Menampilkan data <b>' + sliceTypeLabel + '</b>: <b>' + esc(STATE.slice.label) + '</b> (' + slicedRows.length + ' hari)</span>' +
        '</div>' +
        '<button type="button" class="sb-slice-reset" id="sbResetSlice">✕ Tampilkan Semua ' + (STATE.mode === 'daily' ? 'Hari' : (STATE.mode === 'weekly' ? 'Minggu' : 'Bulan')) + '</button>' +
        '</div>';
    }

    // KPIs
    html += '<div class="sb-kpis">' +
      kpiCard('Omzet Terpilih', money(aStats.omzet), percent(aStats.omzet, pStats.omzet) + ' ' + vsLab, pctClass(aStats.omzet, pStats.omzet)) +
      kpiCard('Jumlah Transaksi', aStats.trx.toLocaleString('id-ID'), percent(aStats.trx, pStats.trx) + ' ' + vsLab, pctClass(aStats.trx, pStats.trx)) +
      kpiCard('ATV / Rata-rata Struk', money(aStats.atv), percent(aStats.atv, pStats.atv) + ' ' + vsLab, pctClass(aStats.atv, pStats.atv)) +
      kpiCard('Produk Terjual (Qty)', totalSkuQty ? (totalSkuQty.toLocaleString('id-ID') + ' pcs') : (aStats.days + ' hari'), totalSkuQty ? (allSkus.length + ' SKU terdaftar') : 'pembanding: ' + pStats.days + ' hari', '') +
      '</div>';

    // Main Grid: Trend Chart on Left, Stack of Top Seller & Worst Performer on Right
    var skuSubLab = STATE.slice ? ('Slice: ' + STATE.slice.label) : (STATE.mode === 'daily' ? 'Bulan terpilih' : (STATE.mode === 'weekly' ? 'Bulan terpilih' : 'Akumulasi tahun ' + (STATE.viewMonth ? STATE.viewMonth.slice(0,4) : 'terpilih')));

    html += '<div class="sb-grid-main">' +
      '<section class="sb-card sb-trend">' +
      '<div class="sb-card-head">' +
      '<div>' +
      '<h3>Tren Omzet ' + (STATE.mode === 'daily' ? 'Harian' : (STATE.mode === 'weekly' ? 'Mingguan' : 'Tahunan')) + '</h3>' +
      '<span>' + esc(trendLab) + '</span>' +
      '</div>' +
      '</div>' +
      renderChart(trendData) +
      '</section>' +
      '<div class="sales-right-stack">' +
      // Top 5 Seller Card
      '<section class="sb-card sb-top-seller">' +
      '<div class="sb-card-head">' +
      '<div>' +
      '<h3>Top 5 Seller</h3>' +
      '<span>' + esc(skuSubLab) + '</span>' +
      '</div>' +
      '<div class="sb-sku-metric-toggle">' +
      '<button type="button" class="' + (STATE.skuMetric === 'qty' ? 'on' : '') + '" data-sku-metric="qty">Qty</button>' +
      '<button type="button" class="' + (STATE.skuMetric === 'rev' ? 'on' : '') + '" data-sku-metric="rev">Omzet</button>' +
      '</div>' +
      '</div>' +
      renderSkuList(top5, false, totalSkuQty, totalSkuRev) +
      '</section>' +
      // 5 Worst Performer Card
      '<section class="sb-card sb-worst-seller">' +
      '<div class="sb-card-head">' +
      '<div>' +
      '<h3>5 Worst Performer (Slow Moving)</h3>' +
      '<span>' + esc(skuSubLab) + '</span>' +
      '</div>' +
      '</div>' +
      renderSkuList(worst5, true, totalSkuQty, totalSkuRev) +
      '</section>' +
      '</div>' +
      '</div>';

    html += '</div>' + renderFormatHelpModal() + renderImportStatusModal();
    board.innerHTML = html;
    STATE.draw = false;
    bind();
  }

  function bind() {
    var host = document.getElementById('sales'); if (!host) return;

    // Mode switches
    host.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        STATE.mode = b.getAttribute('data-mode');
        applyModeWindow();
        draw();
      };
    });

    // SKU Metric toggle (Qty vs Omzet)
    host.querySelectorAll('[data-sku-metric]').forEach(function (b) {
      b.onclick = function () {
        STATE.skuMetric = b.getAttribute('data-sku-metric');
        draw();
      };
    });

    // Reset slice button
    var resetBtn = host.querySelector('#sbResetSlice');
    if (resetBtn) {
      resetBtn.onclick = function () {
        STATE.slice = null;
        draw();
      };
    }

    // Chart slice triggers (dots on daily, bars on weekly/monthly)
    host.querySelectorAll('[data-slice-type]').forEach(function (el) {
      el.onclick = function () {
        var t = el.getAttribute('data-slice-type');
        var id = el.getAttribute('data-slice-id');
        var lab = el.getAttribute('data-slice-label');
        if (STATE.slice && STATE.slice.type === t && STATE.slice.id === id) {
          STATE.slice = null; // toggle off if already selected
        } else {
          STATE.slice = { type: t, id: id, label: lab };
        }
        draw();
      };
    });

    var statusClose = host.querySelector('#sbImportStatusClose'); if(statusClose) statusClose.onclick=function(){STATE.importStatus=null;draw();};
    var statusOverlay=host.querySelector('#sbImportStatusOverlay'); if(statusOverlay) statusOverlay.onclick=function(e){if(e.target===statusOverlay && STATE.importStatus.type!=='progress'){STATE.importStatus=null;draw();}};
    // Format Help Modal
    var btnFormat = host.querySelector('#sbBtnFormat');
    if (btnFormat) btnFormat.onclick = function () { STATE.showHelp = true; draw(); };
    var modalClose = host.querySelector('#sbModalClose');
    if (modalClose) modalClose.onclick = function () { STATE.showHelp = false; draw(); };
    var modalOk = host.querySelector('#sbModalOk');
    if (modalOk) modalOk.onclick = function () { STATE.showHelp = false; draw(); };
    var modalOverlay = host.querySelector('#sbModalOverlay');
    if (modalOverlay) {
      modalOverlay.onclick = function (e) {
        if (e.target === modalOverlay) { STATE.showHelp = false; draw(); }
      };
    }

    // File selection & staging
    var fileInput = host.querySelector('#sbFileInput');
    var btnChoose = host.querySelector('#sbBtnChoose') || host.querySelector('#sbBtnChooseEmpty');
    if (btnChoose && fileInput) {
      btnChoose.onclick = function () { fileInput.click(); };
    }

    if (fileInput) {
      fileInput.onchange = async function () {
        if (fileInput.files && fileInput.files.length) {
          var flist = Array.prototype.slice.call(fileInput.files);
          STATE.stagedFiles = flist;
          STATE.error = '';
          STATE.msg = '';
          if (flist.length === 1) {
            try {
              var rawPreview = await previewFileType(flist[0]);
              STATE.stagedFileType = rawPreview.label;
              STATE.stagedFileRows = rawPreview.count;
            } catch (e) {
              STATE.stagedFileType = 'File Majoo (' + flist[0].name.split('.').pop().toUpperCase() + ')';
            }
          } else {
            STATE.stagedFileType = flist.length + ' File Majoo';
            STATE.stagedFileRows = 0;
          }
          draw();
        }
      };
    }

    var btnCancelFile = host.querySelector('#sbBtnCancelFile');
    if (btnCancelFile) {
      btnCancelFile.onclick = function () {
        STATE.stagedFiles = [];
        STATE.stagedFileType = '';
        if (fileInput) fileInput.value = '';
        draw();
      };
    }

    // Submit button
    var btnSubmit = host.querySelector('#sbBtnSubmit');
    if (btnSubmit) {
      btnSubmit.onclick = function () {
        if (STATE.stagedFiles && STATE.stagedFiles.length && !STATE.importing) {
          importFiles(STATE.stagedFiles);
        }
      };
    }

    // Demo Data Seeder (quick load of Jan 2026 data if empty)
    var btnSeedDemo = host.querySelector('#sbBtnSeedDemo');
    if (btnSeedDemo) {
      btnSeedDemo.onclick = function () {
        seedJanuary2026();
      };
    }

    // Date filters
    var monthEl = host.querySelector('#sbMonth'), fromEl = host.querySelector('#sbFrom'), toEl = host.querySelector('#sbTo');
    if (monthEl) {
      monthEl.onchange = function () {
        var ym = monthEl.value;
        STATE.viewMonth = ym;
        STATE.slice = null;
        if (!ym) {
          var mm = dataMinMax();
          STATE.viewFrom = mm.min; STATE.viewTo = mm.max;
        } else {
          applyModeWindow();
        }
        draw();
      };
    }

    function applyDates() {
      if (!fromEl || !toEl) return;
      var a = fromEl.value, b = toEl.value;
      if (!a || !b) return;
      STATE.viewFrom = a <= b ? a : b;
      STATE.viewTo = a <= b ? b : a;
      STATE.viewMonth = (STATE.viewFrom.slice(0, 7) === STATE.viewTo.slice(0, 7)) ? STATE.viewFrom.slice(0, 7) : '';
      STATE.slice = null;
      draw();
    }
    if (fromEl) fromEl.onchange = applyDates;
    if (toEl) toEl.onchange = applyDates;
  }

  function addScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  async function ensureXLSX() {
    if (window.XLSX) return;
    await addScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }

  function parseTextLines(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (x) { return x.trim(); });
    if (!lines.length) return [];
    var sample = lines.slice(0, 10).join('\n');
    var delim = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ',';
    if ((sample.match(/\t/g) || []).length > (sample.match(/;/g) || []).length) delim = '\t';
    function split(line) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (c === delim && !q) {
          out.push(cur); cur = '';
        } else cur += c;
      }
      out.push(cur);
      return out;
    }
    return lines.map(split);
  }

  async function readFileMatrix(file) {
    var ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls') {
      await ensureXLSX();
      var buf = await file.arrayBuffer();
      var wb = XLSX.read(buf, { type: 'array', cellDates: true });
      var sh = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    }
    return parseTextLines(await file.text());
  }

  function detectMajooType(matrix) {
    for (var i = 0; i < Math.min(25, matrix.length); i++) {
      var row = (matrix[i] || []).map(normHeader);
      // Format 1: Detail Transaksi
      if (row.some(function (c) { return c.includes('no transaksi'); }) && row.some(function (c) { return c.includes('produk') || c.includes('penjualan') || c.includes('waktu'); })) {
        return { type: 'transactions', headerRow: i, label: 'Detail Transaksi Majoo' };
      }
      // Format 2: Laporan Penjualan Produk
      if (row.some(function (c) { return c === 'produk'; }) && row.some(function (c) { return c === 'sku'; }) && row.some(function (c) { return c.includes('jumlah'); })) {
        return { type: 'products', headerRow: i, label: 'Laporan Penjualan Produk Majoo' };
      }
      // Format 3: Laporan Penjualan per Periode
      if (row.some(function (c) { return c.includes('periode'); }) && row.some(function (c) { return c.includes('penjualan'); }) && row.some(function (c) { return c.includes('transaksi') || c.includes('produk'); })) {
        return { type: 'daily_period', headerRow: i, label: 'Laporan Penjualan per Periode Majoo' };
      }
    }
    return { type: 'generic', headerRow: 0, label: 'File Majoo Standard' };
  }

  async function previewFileType(file) {
    var matrix = await readFileMatrix(file);
    var det = detectMajooType(matrix);
    return { label: det.label, count: matrix.length - det.headerRow - 1 };
  }

  function normalizeImport(matrix) {
    if (!matrix || !matrix.length) throw new Error('File kosong atau tidak terbaca.');
    var det = detectMajooType(matrix);
    var hi = det.headerRow;
    var heads = (matrix[hi] || []).map(function (x, i) { var h = String(x == null ? '' : x).trim(); return h || ('col' + i); });
    var rows = [];

    for (var r = hi + 1; r < matrix.length; r++) {
      var vals = matrix[r] || [];
      var joined = vals.map(function (x) { return String(x == null ? '' : x).trim(); }).join(' ').toLowerCase();
      if (!joined || joined.indexOf('powered by') >= 0) continue;
      var o = {};
      heads.forEach(function (h, idx) { o[h] = vals[idx] == null ? '' : vals[idx]; });
      rows.push(o);
    }
    if (!rows.length) throw new Error('Tidak ada baris data setelah header ' + det.label);

    var keys = Object.keys(rows[0]);

    // TYPE 1: DETAIL TRANSAKSI
    if (det.type === 'transactions') {
      var kDate = findKey(keys, [/waktu order/, /waktu bayar/, /tanggal/, /date/, /periode/]);
      var kTotal = findKey(keys, [/total penjualan/, /penjualan bersih/, /penjualan rp/, /omzet/, /omset/, /^penjualan$/]);
      var kProd = findKey(keys, [/^produk$/, /nama produk/, /item/, /sku/]);
      var kPay = findKey(keys, [/metode pembayaran/, /metode bayar/, /pembayaran/, /payment/]);
      var kTrx = findKey(keys, [/no transaksi/, /order id/, /struk/]);

      var groups = {};
      rows.forEach(function (row, idx) {
        var d = parseDate(kDate ? row[kDate] : null);
        if (!d) return;
        var g = groups[d] || (groups[d] = { date: d, omzet: 0, trxSet: new Set(), cash: 0, qris: 0, tf: 0, skus: {} });
        var tot = revenue(kTotal ? row[kTotal] : null) || 0;
        g.omzet += tot;
        var tid = (kTrx && row[kTrx] ? String(row[kTrx]).trim() : '') || ('r' + idx);
        g.trxSet.add(tid);

        var pay = (kPay && row[kPay] ? String(row[kPay]).toLowerCase() : '');
        if (pay.includes('cash') || pay.includes('tunai')) g.cash += tot;
        else if (pay.includes('qris')) g.qris += tot;
        else g.tf += tot;

        var prodStr = kProd ? String(row[kProd] || '') : '';
        if (prodStr) {
          prodStr.split(',').forEach(function (p) {
            var pName = p.trim();
            if (pName) g.skus[pName] = (g.skus[pName] || 0) + 1;
          });
        }
      });

      return Object.keys(groups).sort().map(function (d) {
        var g = groups[d];
        return {
          date: d,
          omzet: Math.round(g.omzet),
          trx: g.trxSet.size,
          cash: Math.round(g.cash),
          qris: Math.round(g.qris),
          tf: Math.round(g.tf),
          skus: Object.keys(g.skus).map(function (k) {
            var qty = g.skus[k];
            var up = PRICE_MAP[k.toUpperCase()] || 0;
            return { name: k, qty: qty, rev: qty * up };
          }).sort(function (a, b) { return b.qty - a.qty; })
        };
      });
    }

    // TYPE 2: LAPORAN PENJUALAN PRODUK
    if (det.type === 'products') {
      var kProdName = findKey(keys, [/^produk$/, /nama produk/, /item/]);
      var kQty = findKey(keys, [/jumlah terjual/, /qty/, /quantity/, /terjual/]);
      var kRev = findKey(keys, [/penjualan rp/, /penjualan/, /total penjualan/, /omzet/]);

      // Extract date range from top metadata lines
      var rangeStart = 