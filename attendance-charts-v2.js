/* HASNARIA Attendance analytics v2 — scan-based dashboard. No assumptions about shifts, absence or verified check-out. */
(function () {
  'use strict';
  if (window.__HASNARIA_ATTENDANCE_CHARTS_V2) return;
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function minute(v) {
    var s = String(v || '').slice(0, 5);
    if (!/^\d\d:\d\d$/.test(s)) return null;
    var h = Number(s.slice(0, 2)), m = Number(s.slice(3, 5));
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  function clock(n) {
    if (!Number.isFinite(n)) return '—';
    n = Math.round(n);
    return String(Math.floor(n / 60) % 24).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }
  function analyze(rows, period) {
    var people = Object.create(null), dateSet = Object.create(null), map = Object.create(null);
    (rows || []).forEach(function (r) {
      if (!r || !r.scan_date || !r.device_person_id) return;
      var id = String(r.cloud_id || '') + '|' + String(r.device_person_id);
      var key = id + '|' + String(r.scan_date);
      if (!map[key]) map[key] = {id:id, name:String(r.employee_name || 'Tanpa nama'), date:String(r.scan_date), times:[], raw:false};
      var x = minute(r.scan_time);
      if (x != null) map[key].times.push(x);
      if (r.conversion_mode === 'raw_only') map[key].raw = true;
      if (!people[id]) people[id] = {name:String(r.employee_name || 'Tanpa nama'), days:0, paired:0, review:0};
      dateSet[String(r.scan_date)] = true;
    });
    var groups = Object.keys(map).map(function (key) {
      var g = map[key], t = Array.from(new Set(g.times)).sort(function(a,b){return a-b});
      g.first = t.length ? t[0] : null;
      g.last = t.length > 1 ? t[t.length-1] : null;
      g.paired = !g.raw && t.length > 1;
      g.single = t.length <= 1;
      g.rawOnly = g.raw && t.length > 1;
      people[g.id].days++;
      if (g.paired) people[g.id].paired++;
      else people[g.id].review++;
      return g;
    });
    var paired = groups.filter(function(g){return g.paired}).length;
    var singles = groups.filter(function(g){return g.single}).length;
    var rawOnly = groups.filter(function(g){return g.rawOnly}).length;
    var firsts = groups.map(function(g){return g.first}).filter(function(v){return v != null});
    var lasts = groups.filter(function(g){return g.paired}).map(function(g){return g.last});
    var avg = function(a){return a.length ? a.reduce(function(x,y){return x+y},0)/a.length : null};
    var counts = Object.create(null);
    groups.forEach(function(g){counts[g.date]=(counts[g.date]||0)+1});
    var daily = [], year = Number(String(period||'').slice(0,4)), month = Number(String(period||'').slice(5,7));
    if (year>=2025 && month>=1 && month<=12) {
      var today = new Date(), days = new Date(year, month, 0).getDate();
      var current = today.getFullYear()===year && today.getMonth()+1===month;
      var upper = current ? Math.min(today.getDate(), days) : days;
      for (var d=1;d<=upper;d++){
        var date=year+'-'+String(month).padStart(2,'0')+'-'+String(d).padStart(2,'0');
        daily.push({day:d,count:counts[date]||0});
      }
    }
    return {employees:Object.keys(people).length, days:Object.keys(dateSet).length,
      personDays:groups.length, scans:(rows||[]).length, paired:paired, singles:singles, rawOnly:rawOnly,
      firstAvg:avg(firsts), lastAvg:avg(lasts), groups:groups, people:Object.keys(people).map(function(k){return people[k]}),
      daily:daily, firsts:firsts};
  }
  function kpi(label, value, hint, kind) {
    return '<div class="at2-kpi '+(kind||'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(hint)+'</small></div>';
  }
  function kpis(model) {
    var pct = model.personDays ? Math.round(model.paired / model.personDays * 100) + '%' : '—';
    return kpi('Pegawai tercatat', model.employees, 'Dari log periode ini')+
      kpi('Hari dengan scan', model.days, model.personDays+' pegawai-hari tercatat')+
      kpi('Pasangan scan', pct, model.paired+'/'+model.personDays+' pegawai-hari, bukan attendance rate')+
      kpi('Rerata scan pertama', clock(model.firstAvg), 'Indikasi masuk, bukan jadwal shift')+
      kpi('Rerata scan terakhir', clock(model.lastAvg), 'Hanya 2+ scan; belum terverifikasi')+
      kpi('Perlu review', model.personDays-model.paired, model.singles+' tunggal · '+model.rawOnly+' log mentah', 'at2-warn');
  }
  function noData() {return '<div class="at2-no-data">Belum ada data pada periode terpilih.</div>';}
  function trend(m) {
    if (!m.scans || !m.daily.length) return noData();
    var data=m.daily,max=Math.max(1,Math.max.apply(null,data.map(function(r){return r.count})));
    var points=data.map(function(r,i){var x=27+i*516/Math.max(1,data.length-1),y=93-(r.count/max)*73;return [x,y]});
    var path=points.map(function(p,i){return(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ');
    var area=path+' L '+points[points.length-1][0].toFixed(1)+' 93 L 27 93 Z';
    var labels=[0,Math.floor((data.length-1)/3),Math.floor((data.length-1)*2/3),data.length-1];
    labels=Array.from(new Set(labels));
    var grid=[0,1,2].map(function(i){var y=20+i*36.5;return '<line x1="27" x2="545" y1="'+y+'" y2="'+y+'" class="at2-gridline"/><text x="21" y="'+(y+3)+'" text-anchor="end" class="at2-axis">'+Math.round(max*(2-i)/2)+'</text>'}).join('');
    var xLabels=labels.map(function(i){return '<text x="'+points[i][0].toFixed(1)+'" y="113" text-anchor="middle" class="at2-axis">'+data[i].day+'</text>'}).join('');
    var dots=points.filter(function(p,i){return data[i].count>0}).map(function(p){return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6" fill="#176b55"/>'}).join('');
    return '<svg viewBox="0 0 560 118" preserveAspectRatio="none" role="img" aria-label="Grafik jumlah pegawai dengan log scan setiap tanggal"><title>Tren pegawai dengan scan per hari</title>'+grid+
      '<path d="'+area+'" fill="#dff4e9" opacity=".7"/><path d="'+path+'" fill="none" stroke="#176b55" stroke-width="2.5" stroke-linejoin="round"/>'+dots+xLabels+'</svg>';
  }
  function donut(m) {
    if (!m.personDays) return noData();
    var parts=[{n:m.paired,t:'Pasangan 2+ scan',c:'#176b55'},{n:m.singles,t:'Scan tunggal',c:'#e7ab45'},{n:m.rawOnly,t:'Log mentah 2+',c:'#9eafab'}];
    var circumference=2*Math.PI*36,offset=0;
    var rings=parts.map(function(p){if(!p.n)return '';var length=p.n/m.personDays*circumference;
      var html='<circle cx="58" cy="56" r="36" fill="none" stroke="'+p.c+'" stroke-width="15" stroke-dasharray="'+length.toFixed(3)+' '+(circumference-length).toFixed(3)+'" stroke-dashoffset="'+(-offset).toFixed(3)+'" transform="rotate(-90 58 56)"/>';
      offset+=length;return html;
    }).join('');
    var legend=parts.map(function(p){return '<div class="at2-legend-item"><i class="at2-dot" data-tone="'+(p.c==='#176b55'?'green':p.c==='#e7ab45'?'amber':'gray')+'"></i><span>'+esc(p.t)+'</span><b>'+p.n+'</b></div>'}).join('');
    return '<div class="at2-donut-wrap"><svg viewBox="0 0 116 112" role="img" aria-label="Komposisi pasangan scan, scan tunggal, dan log mentah"><circle cx="58" cy="56" r="36" fill="none" stroke="#e9f0ec" stroke-width="15"/>'+rings+'<text x="58" y="53" text-anchor="middle" class="at2-donut-number">'+Math.round(m.paired/m.personDays*100)+'%</text><text x="58" y="66" text-anchor="middle" class="at2-donut-label">berpasangan</text></svg><div class="at2-legend">'+legend+'</div></div>';
  }
  function distribution(m) {
    if (!m.firsts.length) return noData();
    var labels=['00–08','08–11','11–14','14–17','17–24'];
    var boundaries=[0,480,660,840,1020,1440],values=[0,0,0,0,0];
    m.firsts.forEach(function(v){for(var i=0;i<5;i++)if(v>=boundaries[i]&&v<boundaries[i+1]){values[i]++;break}});
    var max=Math.max(1,Math.max.apply(null,values));
    var bars=values.map(function(v,i){var x=44+i*103,ht=v/max*72,y=90-ht;
      return '<rect x="'+x+'" y="'+y.toFixed(1)+'" width="56" height="'+ht.toFixed(1)+'" rx="5" fill="'+(i%2?'#55ab89':'#176b55')+'"/><text x="'+(x+28)+'" y="'+Math.max(12,y-5).toFixed(1)+'" text-anchor="middle" class="at2-bar-number">'+v+'</text><text x="'+(x+28)+'" y="108" text-anchor="middle" class="at2-axis">'+labels[i]+'</text>';
    }).join('');
    return '<svg viewBox="0 0 560 118" preserveAspectRatio="none" role="img" aria-label="Distribusi jam scan pertama menurut rentang waktu"><line x1="24" x2="548" y1="90" y2="90" class="at2-gridline"/>'+bars+'</svg>';
  }
  function ranking(m) {
    if (!m.people.length) return noData();
    var positive=m.people.slice().sort(function(a,b){return b.paired/b.days-a.paired/a.days||b.days-a.days||a.name.localeCompare(b.name,'id')}).slice(0,5);
    var caution=m.people.filter(function(p){return p.review>0}).sort(function(a,b){return b.review-a.review||b.days-a.days||a.name.localeCompare(b.name,'id')}).slice(0,5);
    function list(a,negative) {
      if(!a.length)return '<p class="at2-rank-empty">Tidak ada data perlu review.</p>';
      return a.map(function(p,i){return '<div class="at2-rank-row"><em>'+(i+1)+'</em><span title="'+esc(p.name)+'">'+esc(p.name)+'</span><b>'+ (negative?p.review+' kasus':p.paired+'/'+p.days+' hari')+'</b></div>'}).join('');
    }
    return '<div class="at2-rank-columns"><div><h4>Top 5 pasangan scan</h4>'+list(positive,false)+'</div><div><h4>Top 5 perlu review</h4>'+list(caution,true)+'</div></div>';
  }
  function chartPanel(title,sub,body) {
    return '<section class="at2-panel"><div class="at2-panel-title"><b>'+esc(title)+'</b><small>'+esc(sub)+'</small></div><div class="at2-plot">'+body+'</div></section>';
  }
  function charts(m) {
    return '<div class="at2-dashboard" aria-label="Infografis Attendance">'+
      chartPanel('Tren Kehadiran Tercatat','Pegawai dengan scan per tanggal · nol = tidak ada log',trend(m))+
      chartPanel('Komposisi Status Scan','Klasifikasi hasil konversi, bukan kehadiran resmi',donut(m))+
      chartPanel('Distribusi Jam Scan Pertama','Pola waktu scan · bukan klasifikasi terlambat',distribution(m))+
      chartPanel('Peringkat Kelengkapan Log','Berdasarkan pasangan scan, bukan disiplin jadwal',ranking(m))+
      '</div>';
  }
  window.__HASNARIA_ATTENDANCE_CHARTS_V2={analyze:analyze,kpis:kpis,charts:charts};
})();