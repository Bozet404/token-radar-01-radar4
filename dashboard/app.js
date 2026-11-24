// Northline dashboard logic. Reads window.RADAR_META (model, validation) and
// window.RADAR (rows, scatter), both written by main.ts, and renders the whole
// page from them. No network: every number on this page comes from the
// snapshot through the fitted model, and the page can recompute them itself.
//
// Row schema (zdata.js rows): {r rank, s slug, n name, c category index,
// ch chains[], t tvl, g change7d|null, a ageDays|null, b base implied $,
// lo p10 $, hi p90 $, rl rankLo, rh rankHi, cf confidence, m momentum,
// v verdict at $1K, gr gross $1K, fe fee $, hr hours, nt net $1K, be break-even %,
// nh net/hour $1K, dr drivers[], rk risk, cp comparable, dq data quality, st steps[]}

(function () {
  var D = window.RADAR;
  var M = window.RADAR_META;
  var meta = M.meta;
  var model = M.model;
  var rows = D.rows;
  var cats = meta.cats;
  var deposit = 1000;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n).toLocaleString('en-US');
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(2);
  }
  function signed(n, digits) {
    if (n === null || n === undefined) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function $(id) { return document.getElementById(id); }

  // ---- farm economics at the selected deposit (gross scales with deposit) ----
  function econFor(row, dep) {
    var gross = row.gr * (dep / 1000);
    var fee = row.fe;
    var net = gross - fee;
    var be = gross > 0 ? (fee / gross) * 100 : null;
    var nh = net / row.hr;
    var verdict = nh >= 10 ? 'Farm' : net > 0 ? 'Thin' : 'Skip';
    return { gross: gross, fee: fee, net: net, be: be, nh: nh, verdict: verdict };
  }
  function bestNet(dep) {
    var best = null;
    var bestNh = -Infinity;
    rows.forEach(function (row) {
      var e = econFor(row, dep);
      if (e.nh > bestNh) { bestNh = e.nh; best = { row: row, e: e }; }
    });
    return best;
  }

  // ---- stats strip ----
  function renderStats() {
    var v = model.validation;
    var stats = [
      ['40/40', 'watchlist covered'],
      [String(rows.length), 'protocols ranked'],
      [String(meta.anchors), 'traded anchors fitted'],
      [String(meta.setAside), 'set aside of ' + meta.total],
      ['×' + v.cvMiss.toFixed(2) + ' vs ×' + v.flatCvMiss.toFixed(2), 'median miss, model vs flat multiple'],
    ];
    $('stats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
    $('snapLine').textContent = 'Snapshot: ' + meta.source + '. Model ' + meta.model + '.';
  }

  // ---- top three spotlight ----
  function renderTop3() {
    var html = rows.slice(0, 3).map(function (row) {
      var e = econFor(row, deposit);
      return '<div class="spotcard" data-slug="' + esc(row.s) + '">' +
        '<span class="rk">#' + row.r + ' · ' + esc(row.cf) + ' confidence · ' + esc(row.m) + '</span>' +
        '<h3>' + esc(row.n) + '</h3>' +
        '<p class="why">' + esc(row.dr[0] || '') + '</p>' +
        '<p class="nums">Implied ' + usd(row.b) + ' (' + usd(row.lo) + '–' + usd(row.hi) + ') · ' +
        'Net/hour ' + usd(e.nh) + ' · ' + esc(e.verdict) + '</p>' +
        '<p class="act">First move: ' + esc(row.st[1].slice(0, 110)) + '…</p></div>';
    }).join('');
    $('top3').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.spotcard'), function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-slug')); });
    });
  }

  // ---- formula + validation + ablation ----
  function renderFormula() {
    $('formulaText').textContent = model.formula;
    $('formulaStrip').textContent = model.formula;
    var v = model.validation;
    $('validStrip').innerHTML =
      'Out of sample — 5-fold: median miss <b>×' + v.cvMiss.toFixed(2) + '</b> vs flat <b>×' + v.flatCvMiss.toFixed(2) + '</b> · ' +
      'blind holdout: <b>×' + v.blindMiss.toFixed(2) + '</b> vs flat ×' + v.flatBlindMiss.toFixed(2) + ' · ' +
      'walk-forward: <b>×' + v.walkMiss.toFixed(2) + '</b>. Full validation, ablation and scatter below the board.';
    var abl = {};
    model.ablation.forEach(function (a) { abl[a.term] = a; });
    function blindLine(term) {
      var a = abl[term];
      if (!a) return '—';
      return 'kept: without it, blind miss ×' + a.blindMiss.toFixed(2) + ', Top-20 kept ' + a.top20Kept + '/20';
    }
    var fam = Object.keys(model.family).map(function (k) {
      return k + ' ×' + model.family[k].toFixed(2);
    }).join(', ');
    var terms = [
      ['Size', 'log10(TVL)', '×' + Math.pow(10, model.logTvl).toFixed(2) + ' per 10× TVL', blindLine('size (log TVL)')],
      ['Growth', '7-day TVL change, as a fraction — winsorized to ' + model.growthClip.lo + '%…+' + model.growthClip.hi + '%, the range the traded tokens span', '10^(' + model.growth.toFixed(2) + '·g)', blindLine('growth (7d change)')],
      ['Seasoning', 'log10(days tracked + 1)', '(age+1)^' + model.seasoning.toFixed(3), blindLine('seasoning (age)')],
      ['Family', 'category offset, fitted', fam, blindLine('family offsets')],
    ];
    $('termsTable').querySelector('tbody').innerHTML = terms.map(function (t) {
      return '<tr><td><b>' + esc(t[0]) + '</b></td><td>' + esc(t[1]) + '</td><td>' + esc(t[2]) + '</td><td>' + esc(t[3]) + '</td></tr>';
    }).join('');
    $('validBox').innerHTML =
      '<b>Out of sample.</b> 5-fold cross-validation: median miss <b>×' + v.cvMiss.toFixed(2) + '</b> (' + v.cvWithin3.toFixed(1) + '% within 3×) vs a flat multiple <b>×' + v.flatCvMiss.toFixed(2) + '</b> (' + v.flatCvWithin3.toFixed(1) + '%). ' +
      'Blind holdout (n=' + v.blindN + ', never touched while fitting): <b>×' + v.blindMiss.toFixed(2) + '</b> (' + v.blindWithin3.toFixed(1) + '%) vs flat ×' + v.flatBlindMiss.toFixed(2) + '. ' +
      'Walk-forward (train on older listings, test on newer, n=' + v.walkN + '): <b>×' + v.walkMiss.toFixed(2) + '</b> (' + v.walkWithin3.toFixed(1) + '% within 3×). ' +
      'Flat multiple is the median mcap/TVL of ' + meta.anchors + ' traded tokens (' + v.flatRatio + '×).';
    $('ablTable').querySelector('tbody').innerHTML = model.ablation.map(function (a) {
      return '<tr><td>' + esc(a.term) + '</td><td>×' + a.blindMiss.toFixed(2) + '</td><td>' + a.blindWithin3.toFixed(1) + '%</td><td>' + a.top20Kept + '/20</td></tr>';
    }).join('');
  }

  // ---- scatter plot: traded tokens, fit line, P25–P75 band ----
  function drawScatter() {
    var sc = D.scatter;
    var W = 520, H = 300, PL = 46, PR = 8, PT = 10, PB = 30;
    var xs = sc.points.map(function (p) { return p[0]; });
    var ys = sc.points.map(function (p) { return p[1]; });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return PL + ((v - x0) / (x1 - x0)) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB); }
    function tick(v) {
      if (v >= 9) return '$' + Math.pow(10, v - 9).toFixed(0) + 'B';
      if (v >= 6) return '$' + Math.pow(10, v - 6).toFixed(0) + 'M';
      if (v >= 3) return '$' + Math.pow(10, v - 3).toFixed(0) + 'K';
      return '$' + Math.pow(10, v).toFixed(0);
    }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of traded tokens">';
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      var anchor = gx === x1 ? 'end' : gx === Math.ceil(x0) ? 'start' : 'middle';
      s += '<line x1="' + X(gx) + '" y1="' + PT + '" x2="' + X(gx) + '" y2="' + (H - PB) + '" stroke="#e6ebef"/>' +
        '<text x="' + X(gx) + '" y="' + (H - 12) + '" font-size="10" fill="#5b6b82" text-anchor="' + anchor + '">' + tick(gx) + ' TVL</text>';
    }
    for (var gy = Math.ceil(y0); gy <= y1; gy++) {
      s += '<line x1="' + PL + '" y1="' + Y(gy) + '" x2="' + (W - PR) + '" y2="' + Y(gy) + '" stroke="#e6ebef"/>' +
        '<text x="' + (PL - 4) + '" y="' + (Y(gy) + 3) + '" font-size="10" fill="#5b6b82" text-anchor="end">' + tick(gy) + '</text>';
    }
    var band = sc.band;
    s += '<polygon points="' + X(band[0][0]) + ',' + Y(band[0][1]) + ' ' + X(band[1][0]) + ',' + Y(band[1][1]) + ' ' +
      X(band[1][0]) + ',' + Y(band[1][2]) + ' ' + X(band[0][0]) + ',' + Y(band[0][2]) + '" fill="#0e6b6b" opacity="0.12"/>';
    var line = sc.line;
    s += '<line x1="' + X(line[0][0]) + '" y1="' + Y(line[0][1]) + '" x2="' + X(line[1][0]) + '" y2="' + Y(line[1][1]) + '" stroke="#0e6b6b" stroke-width="2"/>';
    sc.points.forEach(function (p) {
      s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="3" fill="#0e6b6b"><title>' + esc(p[2]) + ' — ' + esc(p[3]) + '</title></circle>';
    });
    sc.excluded.forEach(function (p) {
      s += '<circle cx="' + X(p[0]) + '" cy="' + (H - PB - 4) + '" r="3" fill="none" stroke="#b3261e"><title>' + esc(p[1]) + ' — no positive mcap, excluded from the fit</title></circle>';
    });
    s += '</svg>';
    $('scatter').innerHTML = s;
    $('scatterCap').textContent = 'Each dot is a traded token (log TVL vs log market cap). Line: the fit at median growth and age, no family offset. Shaded band: P25–P75 of the residuals. Red rings at the bottom: tokens with no positive market cap, excluded from the fit.';
  }

  // ---- board ----
  var gloMin = Math.min.apply(null, rows.map(function (r) { return Math.log10(r.lo); }));
  var gloMax = Math.max.apply(null, rows.map(function (r) { return Math.log10(r.hi); }));
  function rangeBar(row) {
    var lo = ((Math.log10(row.lo) - gloMin) / (gloMax - gloMin)) * 100;
    var hi = ((Math.log10(row.hi) - gloMin) / (gloMax - gloMin)) * 100;
    var mid = ((Math.log10(row.b) - gloMin) / (gloMax - gloMin)) * 100;
    return '<div class="bar"><i style="left:' + lo.toFixed(1) + '%;width:' + Math.max(1, hi - lo).toFixed(1) + '%"></i><b style="left:' + mid.toFixed(1) + '%"></b></div>';
  }
  function filteredRows() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('fCat').value;
    var chain = $('fChain').value;
    var conf = $('fConf').value;
    var verd = $('fVerdict').value;
    var out = rows.filter(function (row) {
      if (q && (row.n + ' ' + row.s + ' ' + cats[row.c]).toLowerCase().indexOf(q) === -1) return false;
      if (cat !== '' && row.c !== parseInt(cat, 10)) return false;
      if (chain !== '' && row.ch.indexOf(chain) === -1) return false;
      if (conf !== '' && row.cf !== conf) return false;
      if (verd !== '' && econFor(row, deposit).verdict !== verd) return false;
      return true;
    });
    var sort = $('fSort').value;
    out.sort(function (a, b) {
      if (sort === 'value') return b.b - a.b;
      if (sort === 'net') return econFor(b, deposit).nh - econFor(a, deposit).nh;
      if (sort === 'tvl') return b.t - a.t;
      if (sort === 'chg') return (b.g === null ? -Infinity : b.g) - (a.g === null ? -Infinity : a.g);
      return a.r - b.r;
    });
    return out;
  }
  function renderBoard() {
    var list = filteredRows();
    $('rowCount').textContent = 'Showing ' + list.length + ' of ' + rows.length;
    $('emptyMsg').hidden = list.length > 0;
    $('boardBody').innerHTML = list.map(function (row) {
      var e = econFor(row, deposit);
      var chg = row.g === null ? '<span class="flat">—</span>' :
        '<span class="' + (row.g > 0 ? 'up' : row.g < 0 ? 'down' : 'flat') + '">' + signed(row.g) + '</span>';
      var age = row.a === null ? '<span class="flat">—</span>' : row.a + 'd';
      var be = e.be === null ? '—' : e.be.toFixed(0) + '%';
      return '<tr data-slug="' + esc(row.s) + '">' +
        '<td>' + row.r + '</td>' +
        '<td><span class="name">' + esc(row.n) + '</span><br><span class="sub">' + esc(cats[row.c]) + ' · ' + esc(row.ch.join(', ')) + '</span></td>' +
        '<td class="num">' + usd(row.t) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num">' + age + '</td>' +
        '<td><b>' + usd(row.b) + '</b> <span class="sub">(' + usd(row.lo) + '–' + usd(row.hi) + ')</span>' + rangeBar(row) + '</td>' +
        '<td class="num">' + row.rl + '–' + row.rh + '</td>' +
        '<td><span class="pill ' + esc(row.cf) + '">' + esc(row.cf) + '</span></td>' +
        '<td>' + esc(row.m) + '</td>' +
        '<td class="num">' + usd(e.net) + '</td>' +
        '<td class="num">' + be + '</td>' +
        '<td class="num">' + usd(e.nh) + '/h</td>' +
        '<td><span class="pill ' + esc(e.verdict) + '">' + esc(e.verdict) + '</span></td></tr>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#boardBody tr'), function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-slug')); });
    });
    var bn = bestNet(deposit);
    $('headline').innerHTML = 'Best net per hands-on hour at ' + usd(deposit) + ': <b>' + esc(bn.row.n) + ' ' + usd(bn.e.nh) + '/h</b> (' + esc(bn.e.verdict) + ') — ' +
      'net ' + usd(bn.e.net) + ' on ' + usd(bn.e.gross) + ' gross if it launches at the base value, ' + usd(bn.e.fee) + ' in fees.';
  }

  // ---- detail view ----
  function openDetail(slug) {
    var row = null;
    rows.forEach(function (r) { if (r.s === slug) row = r; });
    if (!row) return;
    var e1 = econFor(row, 1000);
    var e10 = econFor(row, 10000);
    function econRow(label, e) {
      return '<tr><td>' + label + '</td><td class="num">' + usd(e.gross) + '</td><td class="num">' + usd(e.fee) + '</td>' +
        '<td class="num">' + usd(e.net) + '</td><td class="num">' + (e.be === null ? '—' : e.be.toFixed(0) + '%') + '</td>' +
        '<td class="num">' + usd(e.nh) + '/h</td><td><span class="pill ' + e.verdict + '">' + e.verdict + '</span></td></tr>';
    }
    var lo = ((Math.log10(row.lo) - gloMin) / (gloMax - gloMin)) * 100;
    var hi = ((Math.log10(row.hi) - gloMin) / (gloMax - gloMin)) * 100;
    var mid = ((Math.log10(row.b) - gloMin) / (gloMax - gloMin)) * 100;
    $('detail').hidden = false;
    $('detail').innerHTML =
      '<button class="close" id="closeDetail" type="button">Close</button>' +
      '<h2>#' + row.r + ' ' + esc(row.n) + '</h2>' +
      '<p class="kv">' + esc(cats[row.c]) + ' · ' + esc(row.ch.join(', ')) + ' · TVL ' + usd(row.t) +
      ' · 7d ' + (row.g === null ? 'unreported' : signed(row.g)) + ' · tracked ' + (row.a === null ? 'date unreported' : row.a + ' days') + '</p>' +
      '<p class="kv">Implied value <b>' + usd(row.b) + '</b> · range ' + usd(row.lo) + '–' + usd(row.hi) + ' (P10–P90, 200 refits) · rank range ' + row.rl + '–' + row.rh +
      ' · confidence <b>' + esc(row.cf) + '</b> · momentum ' + esc(row.m) + '</p>' +
      '<div class="rangebar"><i style="left:' + lo.toFixed(1) + '%;width:' + Math.max(1, hi - lo).toFixed(1) + '%"></i><b style="left:' + mid.toFixed(1) + '%"></b></div>' +
      '<p class="cap">Bar: P10–P90 across 200 bootstrap refits (parameter uncertainty only). Marker: base value. The single-protocol residual is wider — see the validation panel.</p>' +
      '<div class="grid"><div><h3>Why it ranks here</h3><ul>' +
      row.dr.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' +
      '<h3>Main risk</h3><p>' + esc(row.rk) + '</p>' +
      '<h3>Comparable</h3><p>' + esc(row.cp) + '</p>' +
      '<h3>Data quality</h3><p>Growth: ' + esc(row.dq.growth) + ' · Age: ' + esc(row.dq.age) + ' · Family offset: ' + esc(row.dq.family) + '</p></div>' +
      '<div><h3>Farm plan — ' + usd(1000) + ' deposit, 8 weeks</h3><ol>' +
      row.st.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>Farm economics</h3><table><thead><tr><th>Deposit</th><th>Gross</th><th>Fees</th><th>Net</th><th>Break-even</th><th>Net/hour</th><th>Verdict</th></tr></thead><tbody>' +
      econRow(usd(1000), e1) + econRow(usd(10000), e10) + '</tbody></table>' +
      '<p class="cap">Assumes 5% of implied value reaches farmers, shared pro-rata to deposit vs TVL; ' + row.hr + ' hands-on hours; gas is a typical per-chain value, not a quote. No token is promised.</p></div></div>';
    $('closeDetail').addEventListener('click', closeDetail);
    $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', '#detail=' + row.s);
  }
  function closeDetail() {
    $('detail').hidden = true;
    if (history.replaceState) history.replaceState(null, '', '#');
  }

  // ---- method + reproducibility badge ----
  function renderMethod() {
    var v = model.validation;
    $('methodBody').innerHTML =
      '<p><b>Value.</b> ' + esc(model.formula) + ' — a Huber robust fit of log market cap on log TVL, 7-day change, seasoning and category offsets, fitted on ' + meta.anchors + ' traded tokens from the same snapshot. Growth is winsorized to ' + model.growthClip.lo + '%…+' + model.growthClip.hi + '%, the range the traded tokens span: a move outside it is read at the edge, never extrapolated. Growth enters with a negative sign in this snapshot: a +10-point 7-day TVL jump predicts about 28% lower value at the same size — fast inflows in a down week read as mercenary, not durable. The blind test keeps the term (median miss ×' + v.blindMiss.toFixed(2) + ' with it vs ×' + (model.ablation[0] ? model.ablation[0].blindMiss.toFixed(2) : '—') + ' without it).</p>' +
      '<p><b>Board scope.</b> Every protocol that records no token and passes the house plausibility screen — no CEX, bridge, liquid-staking or wrapped/staked product, no versioned copy, no exchange-named product. The $50M floor is not applied, so early finds below it are ranked. That leaves ' + rows.length + ' of ' + meta.total + ' protocols; the watchlist’s 40 are all in. parentProtocol is not in the snapshot, so below the floor the screen applies the checks the snapshot supports.</p>' +
      '<p><b>Uncertainty.</b> Each row’s P10–P90 and rank range come from 200 bootstrap refits of the model (seeded, reproducible). Confidence is High/Medium/Low from four facts: a fitted family offset, reported growth, a reported listing date, and a band narrower than 0.7 dex.</p>' +
      '<p><b>Farm economics.</b> Assumes 5% of implied value reaches farmers, shared pro-rata to deposit vs TVL; 8 transactions at typical per-chain gas; 3 hands-on hours over 8 weeks. Verdict: Farm at $10+/hour, Thin above $0, Skip at or below $0 — all at the selected deposit. Costs are typical values, not quotes.</p>' +
      '<p><b>What the snapshot cannot say.</b> It carries one growth window (7 days), no funding, audit, developer or community signal, and no airdrop flag. Nothing here invents those signals: where a signal is missing the row says so, and momentum is scored from the 7-day window plus age alone.</p>';
    verifyBoard();
  }
  function verifyBoard() {
    var ok = 0;
    var checked = 0;
    rows.forEach(function (row) {
      var age = row.a === null ? model.medAge : row.a;
      var g = row.g === null ? model.medChange / 100 : row.g / 100;
      g = Math.max(model.growthClip.lo / 100, Math.min(model.growthClip.hi / 100, g));
      var fam = model.family[cats[row.c]] || 1;
      var pred = Math.pow(10, model.intercept + model.logTvl * Math.log10(row.t) + model.growth * g + model.seasoning * Math.log10(age + 1)) * fam;
      var e = econFor(row, 1000);
      var valOk = Math.abs(pred - row.b) / row.b < 0.005;
      var netOk = Math.abs(e.net - row.nt) < 0.01 && Math.abs(e.nh - row.nh) < 0.01 && e.verdict === row.v;
      var bandOk = row.lo <= row.b && row.b <= row.hi && row.rl <= row.r && row.r <= row.rh;
      checked++;
      if (valOk && netOk && bandOk) ok++;
    });
    $('badge').textContent = 'Reproducibility: board.json = this page — ' + ok + '/' + checked +
      ' ranks, values, verdicts and nets match, recomputed in your browser from the formula and the snapshot figures. Bands are stored P10–P90 from 200 bootstrap refits.';
  }

  // ---- wire controls ----
  function fillSelects() {
    var catSel = $('fCat');
    cats.forEach(function (c, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = c;
      catSel.appendChild(o);
    });
    var chains = [];
    rows.forEach(function (row) {
      row.ch.forEach(function (ch) { if (chains.indexOf(ch) === -1) chains.push(ch); });
    });
    chains.sort();
    var chSel = $('fChain');
    chains.forEach(function (ch) {
      var o = document.createElement('option');
      o.value = ch;
      o.textContent = ch;
      chSel.appendChild(o);
    });
  }
  function setDeposit(d, btn) {
    deposit = d;
    $('dep1k').classList.toggle('on', d === 1000);
    $('dep10k').classList.toggle('on', d === 10000);
    renderBoard();
    renderTop3();
  }
  ['q', 'fCat', 'fChain', 'fConf', 'fVerdict', 'fSort'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  $('dep1k').addEventListener('click', function () { setDeposit(1000); });
  $('dep10k').addEventListener('click', function () { setDeposit(10000); });
  $('resetBtn').addEventListener('click', function () {
    $('q').value = '';
    $('fCat').value = '';
    $('fChain').value = '';
    $('fConf').value = '';
    $('fVerdict').value = '';
    $('fSort').value = 'rank';
    closeDetail();
    setDeposit(1000);
    renderBoard();
  });

  fillSelects();
  renderStats();
  renderTop3();
  renderFormula();
  drawScatter();
  renderBoard();
  renderMethod();
  if (location.hash.indexOf('#detail=') === 0) openDetail(decodeURIComponent(location.hash.slice(8)));
})();
