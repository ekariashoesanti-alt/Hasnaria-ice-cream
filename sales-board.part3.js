      } else {
        // Distribute or attach to days
        var nDays = outList.length;
        parsedSkus.forEach(function (item) {
          var perDay = item.qty / nDays;
          outList.forEach(function (dRow) {
            dRow.skus.push({ name: item.name, qty: Math.max(0.01, perDay), rev: item.rev / nDays });
          });
        });
      }
      return outList;
    }

    // TYPE 3 & GENERIC: LAPORAN PENJUALAN PER PERIODE
    var kDate3 = findKey(keys, [/^(periode|tanggal|tgl|date|hari)$/, /tanggal/, /periode/]);
    var kTotal3 = findKey(keys, [/penjualan rp/, /total penjualan/, /penjualan bersih/, /omzet/, /omset/, /^penjualan$/]);
    var kTrx3 = findKey(keys, [/total transaksi/, /jumlah transaksi/, /transaksi/, /struk/]);
    var groups3 = {};

    rows.forEach(function (row) {
      var d = parseDate(kDate3 ? row[kDate3] : null);
      if (!d) return;
      var g = groups3[d] || (groups3[d] = { date: d, omzet: 0, trx: 0, cash: 0, qris: 0, tf: 0, skus: [] });
      var rev = revenue(kTotal3 ? row[kTotal3] : null);
      if (rev != null) g.omzet += rev;
      var tx = num(kTrx3 ? row[kTrx3] : null);
      if (tx != null) g.trx = Math.max(g.trx, tx);
    });

    return Object.keys(groups3).sort().map(function (d) {
      var g = groups3[d];
      return {
        date: d,
        omzet: Math.round(g.omzet),
        trx: g.trx,
        cash: 0, qris: 0, tf: 0, skus: []
      };
    });
  }

  async function importFiles(fileOrFiles) {
    var files = Array.isArray(fileOrFiles) ? fileOrFiles : (fileOrFiles ? [fileOrFiles] : []);
    if (!files.length) return;

    STATE.importing = true;
    STATE.error = '';
    STATE.msg = '';
    setImportStatus('progress', 'Menyiapkan upload', files.length + ' file dipilih', 4);
    draw();

    try {
      var allDataByDate = {}; // date -> { date, omzet, trx, cash, qris, tf, skusMap: {} }
      var totalParsed = 0;

      for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];
        setImportStatus('progress', 'Membaca file ' + (fi + 1) + '/' + files.length, file.name, 6 + Math.round((fi / files.length) * 24));

        var matrix = await getFileMatrix(file);
        var fileRows = normalizeImport(matrix);
        totalParsed += fileRows.length;

        fileRows.forEach(function (r) {
          var d = r.date;
          if (!d) return;
          var cur = allDataByDate[d];
          if (!cur) {
            allDataByDate[d] = {
              date: d,
              omzet: r.omzet || 0,
              trx: r.trx || 0,
              cash: r.cash || 0,
              qris: r.qris || 0,
              tf: r.tf || 0,
              skusMap: {}
            };
            (r.skus || []).forEach(function (s) {
              allDataByDate[d].skusMap[s.name] = { name: s.name, qty: s.qty, rev: s.rev };
            });
          } else {
            // Overlapping date: merge smartly
            if (r.omzet > 0) cur.omzet = Math.max(cur.omzet, r.omzet);
            if (r.trx > 0) cur.trx = Math.max(cur.trx, r.trx);
            if (r.cash > 0 || r.qris > 0 || r.tf > 0) {
              cur.cash = Math.max(cur.cash, r.cash || 0);
              cur.qris = Math.max(cur.qris, r.qris || 0);
              cur.tf = Math.max(cur.tf, r.tf || 0);
            }
            (r.skus || []).forEach(function (s) {
              var prevSku = cur.skusMap[s.name];
              if (prevSku) {
                prevSku.qty = Math.max(prevSku.qty, s.qty);
                prevSku.rev = Math.max(prevSku.rev, s.rev);
              } else {
                cur.skusMap[s.name] = { name: s.name, qty: s.qty, rev: s.rev };
              }
            });
          }
        });
      }

      var sortedDates = Object.keys(allDataByDate).sort();
      if (!sortedDates.length) throw new Error('Tidak ada data valid setelah membaca ' + files.length + ' file. Periksa format file.');

      var minDate = sortedDates[0];
      var maxDate = sortedDates[sortedDates.length - 1];

      // Fetch existing records safely using date range (prevents HTTP 414 URI Too Long for 365 days)
      setImportStatus('progress', 'Cek data lama', 'Memeriksa catatan yang sudah ada di database…', 35);

      var oldMap = {};
      try {
        var old = await api('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&metric_date=gte.' + minDate + '&metric_date=lte.' + maxDate + '&limit=5000&select=metric_date,cash_revenue,transactions,notes');
        (old || []).forEach(function (r) { oldMap[r.metric_date] = r; });
      } catch (eOld) {
        console.warn('Could not fetch old metrics for date range', eOld);
      }

      var payload = sortedDates.map(function (d) {
        var x = allDataByDate[d];
        var oldRec = oldMap[d];
        var notesOld = oldRec ? (oldRec.notes || '') : '';
        var payAvailable = x.cash || x.qris || x.tf;

        var skusList = Object.keys(x.skusMap).map(function (k) { return x.skusMap[k]; }).sort(function (a, b) { return b.qty - a.qty; });
        var newSkus = skusList.length ? skusList : parseSku(notesOld);
        var notes = preservePayAndSku(notesOld, newSkus, payAvailable ? { cash: x.cash, qris: x.qris, tf: x.tf } : null);

        var finalOmzet = x.omzet > 0 ? x.omzet : (oldRec ? oldRec.cash_revenue : 0);
        var finalTrx = x.trx > 0 ? x.trx : (oldRec ? oldRec.transactions : 0);

        return {
          brand_id: BRAND,
          metric_date: d,
          cash_revenue: Math.round(finalOmzet),
          transactions: Math.round(finalTrx),
          notes: notes
        };
      });

      // Chunked upsert with timeout — avoids hanging on one giant request.
      var BATCH_SIZE = 80;
      var totalBatches = Math.max(1, Math.ceil(payload.length / BATCH_SIZE));
      var importTok = await getTok();
      if (!importTok) throw new Error('Sesi login belum siap. Silakan masuk kembali.');

      function withTimeout(promise, ms, label) {
        return new Promise(function (resolve, reject) {
          var done = false;
          var t = setTimeout(function () {
            if (done) return;
            done = true;
            reject(new Error((label || 'Request') + ' timeout setelah ' + Math.round(ms / 1000) + 's'));
          }, ms);
          promise.then(function (v) {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(v);
          }, function (e) {
            if (done) return;
            done = true;
            clearTimeout(t);
            reject(e);
          });
        });
      }

      async function apiImport(path, opts) {
        var cfg = opts || {};
        cfg.headers = Object.assign({ apikey: KEY, Authorization: 'Bearer ' + importTok }, cfg.headers || {});
        var fetchPromise = fetch(SB + '/rest/v1/' + path, cfg).then(async function (r) {
          if (!r.ok) {
            var tx = await r.text();
            throw new Error(tx || ('Supabase error ' + r.status));
          }
          var ct = r.headers.get('content-type') || '';
          return ct.indexOf('application/json') >= 0 ? r.json() : null;
        });
        return withTimeout(fetchPromise, 45000, 'Simpan ke database');
      }

      for (var bi = 0; bi < payload.length; bi += BATCH_SIZE) {
        var chunk = payload.slice(bi, bi + BATCH_SIZE);
        var batchNo = Math.floor(bi / BATCH_SIZE) + 1;
        var beforePct = 40 + Math.round(((batchNo - 1) / totalBatches) * 55);
        setImportStatus('progress', 'Menyimpan batch ' + batchNo + '/' + totalBatches, 'Mengirim ' + chunk.length + ' hari…', beforePct);

        try {
          await apiImport('daily_metrics?on_conflict=brand_id,metric_date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(chunk)
          });
        } catch (chunkErr) {
          var em = String(chunkErr && chunkErr.message ? chunkErr.message : chunkErr);
          // Row fallback only for conflict/constraint; otherwise fail fast (no endless hang).
          if (!/conflict|duplicate|unique|23505|on_conflict/i.test(em)) throw chunkErr;
          setImportStatus('progress', 'Mode cadangan batch ' + batchNo + '/' + totalBatches, 'Menyimpan per baris…', beforePct);
          for (var ci = 0; ci < chunk.length; ci++) {
            var prow = chunk[ci];
            var hit = await apiImport('daily_metrics?brand_id=eq.' + encodeURIComponent(BRAND) + '&metric_date=eq.' + prow.metric_date + '&select=id');
            if (hit && hit[0] && hit[0].id) {
              await apiImport('daily_metrics?id=eq.' + hit[0].id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify(prow)
              });
            } else {
              await apiImport('daily_metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify(prow)
              });
            }
            if ((ci + 1) % 10 === 0 || ci === chunk.length - 1) {
              setImportStatus('progress', 'Mode cadangan batch ' + batchNo + '/' + totalBatches, (ci + 1) + '/' + chunk.length + ' baris', beforePct + Math.round(((ci + 1) / chunk.length) * (55 / totalBatches)));
            }
          }
        }

        var processed = Math.min(payload.length, bi + chunk.length);
        setImportStatus('progress', 'Batch ' + batchNo + '/' + totalBatches + ' OK', processed + ' / ' + payload.length + ' hari tersimpan', 40 + Math.round((processed / payload.length) * 55));
      }

      setImportStatus('progress', 'Hampir selesai', 'Menyegarkan dashboard…', 96);

      STATE.stagedFiles = [];
      STATE.stagedFileType = '';
      STATE.importing = false;
      STATE.importProgress = '';
      setImportStatus('success', 'Upload selesai (100%)', payload.length + ' tanggal (' + minDate + ' s/d ' + maxDate + ') tersimpan di database.', 100);
      STATE.msg = '✓ Berhasil update ' + payload.length + ' tanggal (' + minDate + ' s/d ' + maxDate + ') dari ' + files.length + ' file Majoo!';

      // Adjust date filter: if multi-month, switch to monthly view for 12-month overview
      STATE.viewFrom = minDate;
      STATE.viewTo = maxDate;
      if (minDate.slice(0, 7) === maxDate.slice(0, 7)) {
        STATE.viewMonth = minDate.slice(0, 7);
      } else {
        STATE.viewMonth = '';
        STATE.mode = 'monthly';
      }
      STATE.slice = null;
      await loadMetrics();
    } catch (e) {
      STATE.importing = false;
      STATE.importProgress = '';
      setImportStatus('error', 'Upload gagal', (e && e.message) ? e.message : 'Terjadi kesalahan saat memproses data.');
      STATE.error = 'Gagal upload: ' + e.message;
      STATE.msg = '';
      draw();
    }
  }

  function importFile(f) { return importFiles(f); }

  // Pre-seed 337 transactions of Jan 2026 if user clicks quick load
  async function seedJanuary2026() {
    STATE.loading = true;
    STATE.msg = 'Mengimpor 337 transaksi Majoo Januari 2026…';
    STATE.error = '';
    draw();

    // The complete monthly breakdown for January 2026 from user's Majoo data
    var rawPeriodData = [
      { d: '2026-01-01', rev: 209000, tx: 13, skus: 'KUAH ODENG=2|ODENG=3|SOSIS AYAM=2|DUMPLING AYAM=2|CHIKUWA=5|SALMON STICK=2|Banana split=1|SIOMAY=2|Mie sedap=1|Topokki=3|ODENG TIPIS=2|BAKSO UDANG=1|DUMPLING CHEESE=4|SCALLOP=5|BAKSO IKAN=6|BAKSO AYAM=3|CRAB STICK=5|FISHROLL=5|KUAH TOMYAM=1|SHRIMP TAIL=5|MIE KUNING=1', cash: 147000, qris: 46500, tf: 15500 },
      { d: '2026-01-02', rev: 170000, tx: 10, skus: 'RABOKKI=2|SOSIS AYAM=2|BAKSO IKAN=2|FISHROLL=2|CHIKUWA=2|KUAH TOMYAM=2|DUMPLING AYAM=2|NASI AYAM KATSU=2|Mie sedap=2|SIOMAY=2|Topokki=4|ODENG TIPIS=3|ICE LEMON TEA=1|BAKSO UDANG=1|KUAH ODENG=1|SCALLOP=1', cash: 97000, qris: 50000, tf: 23000 },
      { d: '2026-01-03', rev: 278000, tx: 14, skus: 'CHOCOLATE=1|BLACK COFFE=1|VANILLA LATTE=1|Topokki=6|Es Krim Potong Cokelat=1|RABOKKI=4|KUAH TOMYAM=1|BAKSO AYAM=2|SCALLOP=2|BAKSO IKAN=1|SHRIMP TAIL=1|MIE KUNING=1|Kentang Goreng=2|CHIKUWA=3|DUMPLING AYAM=3|KUAH ODENG=3|ODENG=2|SALMON STICK=2|SOSIS AYAM=2|SIOMAY=1|ODENG TIPIS=3|FISHROLL=1|BAKSO UDANG=1|ICE LYCHEE TEA=1|NASI AYAM KATSU=1|COFFE LATTE=1|JASMINE TEA=1', cash: 159000, qris: 30000, tf: 89000 },
      { d: '2026-01-04', rev: 272000, tx: 14, skus: 'KUAH ODENG=2|ODENG=2|SOSIS AYAM=2|DUMPLING AYAM=2|CHIKUWA=2|SALMON STICK=2|Choco Pandan=1|Es krim Turkiy=1|ICE CREAM BOWL=2|Topokki=4|NASI AYAM KATSU=1|Mie Pedas=4|SIOMAY=4|MINI NORI=1|KUAH TOMYAM=3|FISHROLL=3|SHRIMP TAIL=3|DUMPLING CHEESE=4|CRAB STICK=3|SCALLOP=4|FISH TOFU=3|BAKSO IKAN=3|ODENG TIPIS=2|RABOKKI=1|AIR MINERAL BESAR=1|BAKSO UDANG=1', cash: 221000, qris: 26000, tf: 25000 },
      { d: '2026-01-05', rev: 60000, tx: 4, skus: 'KUAH TOMYAM=1|SHRIMP TAIL=1|FISH TOFU=1|SCALLOP=1|BAKSO IKAN=1|MIE KUNING=1|Mie Pedas=1|DUMPLING CHEESE=1|SIOMAY=1|Es krim Turkiy=1|ICE CREAM BOWL=2|POP MIE=1', cash: 60000, qris: 0, tf: 0 },
      { d: '2026-01-06', rev: 284000, tx: 15, skus: 'KUAH ODENG=4|ODENG TIPIS=1|DUMPLING CHEESE=5|CHIKUWA=3|SCALLOP=4|BAKSO UDANG=1|RABOKKI=2|Es Krim Potong Durian=1|Choco Pandan=1|MINI NORI=1|Topokki=6|ODENG=4|DUMPLING AYAM=2|SALMON STICK=2|SOSIS AYAM=3|BAKSO IKAN=4|CRAB STICK=3|FISH TOFU=4|FISHROLL=3|KUAH TOMYAM=3|SHRIMP TAIL=4|ICE LYCHEE TEA=1|MIE KUNING=1|JASMINE TEA=1', cash: 209000, qris: 50000, tf: 25000 },
      { d: '2026-01-07', rev: 193000, tx: 14, skus: 'SHRIMP TAIL=1|FISH TOFU=1|SCALLOP=2|BAKSO IKAN=1|MIE KUNING=1|KUAH TOMYAM=1|Es krim Turkiy=1|ICE CREAM BOWL=2|ROTI BAKAR KEJU SUSU=1|Kentang Goreng=1|BLACK COFFE=1|KUAH ODENG=2|ODENG TIPIS=4|DUMPLING CHEESE=2|CHIKUWA=2|BAKSO UDANG=1|ODENG=2|SOSIS AYAM=1|DUMPLING AYAM=1|SALMON STICK=1|Topokki=6|NASI AYAM KATSU=1|Choco Pandan=1|RABOKKI=1', cash: 129000, qris: 10000, tf: 54000 },
      { d: '2026-01-08', rev: 187000, tx: 8, skus: 'KUAH TOMYAM=2|SHRIMP TAIL=3|FISH TOFU=2|BAKSO IKAN=3|SCALLOP=2|MIE KUNING=2|RABOKKI=1|Topokki=3|ODENG TIPIS=1|Es Krim Potong Neopolitan=1|ODENG=1|KUAH ODENG=1|CRAB STICK=1|FISHROLL=1|ICE LYCHEE TEA=1', cash: 119000, qris: 15000, tf: 53000 },
      { d: '2026-01-09', rev: 155000, tx: 9, skus: 'SHRIMP TAIL=3|FISH TOFU=2|SCALLOP=3|BAKSO UDANG=1|MIE KUNING=2|KUAH TOMYAM=2|Topokki=3|KUAH ODENG=1|ODENG=2|SOSIS AYAM=2|DUMPLING AYAM=1|CHIKUWA=1|SALMON STICK=1|ICE CREAM BOWL=1|FISHROLL=1|DUMPLING CHEESE=1|CRAB STICK=1|BAKSO IKAN=2|SIOMAY=2|Mie Pedas=2|ODENG TIPIS=2|JASMINE TEA=1|MINI NORI=1', cash: 121000, qris: 0, tf: 34000 },
      { d: '2026-01-10', rev: 192000, tx: 11, skus: 'RABOKKI=2|BAKSO IKAN=3|CRAB STICK=2|DUMPLING CHEESE=3|FISH TOFU=3|FISHROLL=2|SCALLOP=3|SHRIMP TAIL=3|KUAH TOMYAM=3|Es krim Turkiy=2|Topokki=3|MIE KUNING=1|BAKSO UDANG=1|CHIKUWA=1|ODENG TIPIS=2|KUAH ODENG=1|SIOMAY=1|Mie Pedas=1|JASMINE TEA=1|ICE LEMON TEA=1|Kentang Goreng=1|ROTI BAKAR KEJU SUSU=1|POP MIE=1|NASI AYAM KATSU=1', cash: 135000, qris: 15000, tf: 42000 },
      { d: '2026-01-11', rev: 500000, tx: 16, skus: 'JASMINE TEA=2|ICE LEMON TEA=1|ICE LYCHEE TEA=1|CAPPUCINO=1|NASI AYAM KATSU=1|Mie Pedas=1|SIOMAY=1|MILO=1|HAZELNUT CHOCO LATTE=1|Topokki=2|MINI NORI=2|Es krim Turkiy=1|ICE CREAM BOWL=4|KUAH ODENG=2|ODENG TIPIS=1|DUMPLING CHEESE=2|SCALLOP=2|CHIKUWA=2|BAKSO UDANG=2|RABOKKI=3|ODENG=3|Es Krim Potong Durian=1|Es Krim Potong Cokelat=1|BAKSO IKAN=1|KUAH TOMYAM=1|FISH TOFU=1|SHRIMP TAIL=1|MIE KUNING=1|DUMPLING AYAM=1|SOSIS AYAM=1|SALMON STICK=1', cash: 406000, qris: 94000, tf: 0 },
      { d: '2026-01-12', rev: 182000, tx: 14, skus: 'Mie Pedas=1|SIOMAY=1|DUMPLING CHEESE=4|NASI AYAM KATSU=1|Es Krim Potong Neopolitan=1|BAKSO UDANG=1|CHIKUWA=3|KUAH ODENG=3|ODENG TIPIS=2|SCALLOP=4|SOSIS AYAM=1|SALMON STICK=1|ODENG=2|DUMPLING AYAM=2|Topokki=3|Es krim Turkiy=1|RABOKKI=1|BAKSO IKAN=3|CRAB STICK=3|FISH TOFU=3|FISHROLL=3|KUAH TOMYAM=3|SHRIMP TAIL=3|MINI NORI=1', cash: 118000, qris: 64000, tf: 0 },
      { d: '2026-01-13', rev: 196000, tx: 12, skus: 'ROTI BAKAR KEJU SUSU=1|COFFE LATTE=1|KUAH ODENG=2|ODENG TIPIS=4|SCALLOP=3|DUMPLING CHEESE=4|CHIKUWA=2|BAKSO UDANG=2|Es krim Turkiy=1|Topokki=4|SIOMAY=3|Mie Pedas=3|BAKSO IKAN=2|CRAB STICK=2|FISH TOFU=2|FISHROLL=2|SHRIMP TAIL=2|KUAH TOMYAM=1|RABOKKI=1|MINI NORI=1|ICE CREAM BOWL=1', cash: 196000, qris: 0, tf: 0 },
      { d: '2026-01-14', rev: 77000, tx: 4, skus: 'Topokki=2|ODENG TIPIS=1|RABOKKI=2|AIR MINERAL BESAR=1|ODENG=1|JASMINE TEA=1', cash: 28000, qris: 0, tf: 49000 },
      { d: '2026-01-15', rev: 188000, tx: 11, skus: 'Topokki=1|ODENG=5|MINI NORI=2|KUAH ODENG=4|ODENG TIPIS=2|SCALLOP=2|DUMPLING CHEESE=3|CHIKUWA=4|BAKSO UDANG=2|Mie Pedas=1|SIOMAY=1|RABOKKI=2|ICE CREAM BOWL=1|SOSIS AYAM=3|DUMPLING AYAM=3|SALMON STICK=3|CAPPUCINO=1|JASMINE TEA=1|BAKSO IKAN=1|SHRIMP TAIL=1|MIE KUNING=1|FISH TOFU=1', cash: 160000, qris: 28000, tf: 0 },
      { d: '2026-01-16', rev: 247000, tx: 14, skus: 'ICE CREAM BOWL=1|KUAH ODENG=2|ODENG=3|DUMPLING CHEESE=3|Snack 3000=1|AIR MINERAL BESAR=1|Topokki=3|ODENG TIPIS=3|RABOKKI=3|CHIKUWA=1|DUMPLING AYAM=1|SALMON STICK=1|SOSIS AYAM=1|ICE LEMON TEA=1|JASMINE TEA=1|Mie Pedas=1|SIOMAY=1|BAKSO IKAN=4|CRAB STICK=2|FISHROLL=2|FISH TOFU=4|KUAH TOMYAM=4|SCALLOP=4|SHRIMP TAIL=4|MIE KUNING=2|Es Krim Turkiy Mix rasa=1|Choco Pandan=1', cash: 235000, qris: 12000, tf: 0 },
      { d: '2026-01-17', rev: 184000, tx: 15, skus: 'KUAH ODENG=4|ODENG=4|SOSIS AYAM=3|CHIKUWA=5|DUMPLING AYAM=3|SALMON STICK=3|Es Krim Potong Cokelat=2|KUAH TOMYAM=1|SHRIMP TAIL=2|BAKSO IKAN=2|FISH TOFU=1|SCALLOP=3|MIE KUNING=2|Mie Pedas=2|SIOMAY=3|Es krim Turkiy=1|Topokki=2|ODENG TIPIS=3|DUMPLING CHEESE=3|CRAB STICK=2|FISHROLL=3|Snack 3000=1|NASI AYAM KATSU=1|BAKSO UDANG=1', cash: 125500, qris: 18000, tf: 40500 },
      { d: '2026-01-18', rev: 152000, tx: 7, skus: 'MIX PLATER=1|ROTI BAKAR COKELAT KEJU=1|AIR MINERAL BESAR=1|Topokki=5|ODENG TIPIS=4|NASI AYAM KATSU=2|MATCHA LATTE=3', cash: 128000, qris: 24000, tf: 0 },
      { d: '2026-01-19', rev: 78000, tx: 6, skus: 'Es krim Turkiy=2|Topokki=2|ODENG TIPIS=2|Snack 3000=1|RABOKKI=1|SOSIS AYAM=1|POP MIE=1|BAKSO UDANG=1|CHIKUWA=1|DUMPLING CHEESE=1|SCALLOP=1|KUAH ODENG=1', cash: 66000, qris: 12000, tf: 0 },
      { d: '2026-01-20', rev: 112000, tx: 8, skus: 'Topokki=3|ODENG TIPIS=2|Es krim Turkiy=1|RABOKKI=3|SIOMAY=1|Mie Pedas=1|CHIKUWA=1|DUMPLING AYAM=1|KUAH ODENG=1|ODENG=2|SALMON STICK=1|SOSIS AYAM=1', cash: 97000, qris: 15000, tf: 0 },
      { d: '2026-01-21', rev: 150000, tx: 9, skus: 'Topokki=7|ODENG TIPIS=4|DUMPLING CHEESE=1|ODENG=1|SHRIMP TAIL=1|FISHROLL=1|CRAB STICK=1|Snack 3000=1|JASMINE TEA=1|RABOKKI=2', cash: 108000, qris: 0, tf: 42000 },
      { d: '2026-01-22', rev: 132000, tx: 7, skus: 'MOCCACINO=1|ICE LEMON TEA=1|Es Krim Potong Neopolitan=1|RABOKKI=1|Mie Pedas=1|SIOMAY=1|DUMPLING CH