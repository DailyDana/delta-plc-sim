// Delta PLC simülatörü — arayüz (ladder çizimi, düzenleyici, çalışma döngüsü)
'use strict';
const { parseIL, toIL, validate, Sim, contact, par, coil, output, rung, checkOperand, timerBase, parseK, SPECIAL_M } = PLC;

// Çizim ölçüleri (px)
const CW = 92;     // kontak hücresi genişliği
const RH = 64;     // satır yüksekliği
const HEAD = 20;   // satır üstü açıklama payı
const LEFT = 52;   // sol ray x
const COILW = 190; // bobin alanı genişliği
const GAP = 20;

const STORE = 'deltaPlcSim.il';
const octal = (p, n) => Array.from({ length: n }, (_, i) => p + i.toString(8));
const XS = octal('X', 16), YS = octal('Y', 16);

let prog = { rungs: [], labels: {} };
let sim = new Sim();
let mode = 'stop'; // stop | run | pause
let speed = 1;
let selId = null;
const inputs = {};   // X anlık durumu
const locked = {};   // sağ tıkla kilitlenen girişler
let pwEls = [], clEls = [], qEls = [], tvEls = [];
let slots = [];      // sürükle-bırak için geçerli bırakma noktaları (her çizimde yeniden toplanır)

// ------------------------------------------------------------------ korumalı depolama
// Gizli pencere, gömülü tarayıcı (ör. Claude uygulaması) ya da kapalı çerez ayarında localStorage
// hata atabilir ya da hiç yazmayabilir. Tüm erişim buradan geçer: hata olursa bellekte tutulur ve
// kullanıcıya "kayıtlar kalıcı değil" uyarısı gösterilir; uygulama asla bu yüzden çökmez.
const store = (function () {
  const mem = {};
  let ok = true;
  try {
    const k = '__deltaPlcSim_test';
    localStorage.setItem(k, '1');
    if (localStorage.getItem(k) !== '1') ok = false;
    localStorage.removeItem(k);
  } catch (e) {
    ok = false;
  }
  const api = {
    get ok() { return ok; },
    get(k) {
      if (ok) {
        try { return localStorage.getItem(k); } catch (e) { ok = false; storageFailed(); }
      }
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    set(k, v) {
      mem[k] = String(v);
      if (!ok) return false;
      try {
        localStorage.setItem(k, String(v));
        return true;
      } catch (e) {
        // kota dolu ya da erişim engellendi: bellekte devam et, kullanıcıyı uyar
        ok = false;
        storageFailed();
        return false;
      }
    },
    remove(k) {
      delete mem[k];
      if (ok) try { localStorage.removeItem(k); } catch (e) { /* önemsiz */ }
    },
  };
  // Destekleniyorsa tarayıcıdan kalıcı depolama iste (temizlikte silinmesin)
  try { if (ok && navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* önemsiz */ }
  return api;
})();
function storageFailed() {
  const w = document.getElementById('storeWarn');
  if (w) w.classList.add('show');
}
let zoom = parseFloat(store.get('deltaPlcSim.zoom')) || 1;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ------------------------------------------------------------------ boyutlar
function bsz(b) {
  if (b.t === 'c') return { w: 1, h: 1 };
  let w = 0, h = 0;
  for (const br of b.branches) { const s = ssz(br); w = Math.max(w, s.w); h += s.h; }
  return { w, h };
}
function ssz(s) {
  let w = 0, h = 1;
  for (const b of s) { const z = bsz(b); w += z.w; h = Math.max(h, z.h); }
  return { w, h };
}

// ------------------------------------------------------------------ çizim
const wire = (x1, y1, x2, y2, pw) => `<line class="w" data-pw="${pw}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

function drawContact(c, x, cy, out) {
  const m = x + CW / 2;
  out.push(wire(x, cy, m - 9, cy, c.id + ':in'));
  out.push(wire(m + 9, cy, x + CW, cy, c.id + ':out'));
  let sym = `<rect class="cbody" x="${m - 9}" y="${cy - 13}" width="18" height="26"/>
    <line class="cbar" x1="${m - 9}" y1="${cy - 15}" x2="${m - 9}" y2="${cy + 15}"/>
    <line class="cbar" x1="${m + 9}" y1="${cy - 15}" x2="${m + 9}" y2="${cy + 15}"/>`;
  if (c.kind === 'NC') sym += `<line class="cbar" x1="${m - 14}" y1="${cy + 13}" x2="${m + 14}" y2="${cy - 13}"/>`;
  if (c.kind === 'P') sym += `<text class="edge" x="${m}" y="${cy + 6}" text-anchor="middle">↑</text>`;
  if (c.kind === 'F') sym += `<text class="edge" x="${m}" y="${cy + 6}" text-anchor="middle">↓</text>`;
  out.push(`<g class="ct" data-cl="${c.id}">${sym}</g>`);
  const bad = checkOperand(c.op, 'contact');
  out.push(`<text class="op${bad ? ' bad' : ''}" x="${m}" y="${cy - 20}" text-anchor="middle">${esc(c.op || '?')}</text>`);
  const lbl = prog.labels[c.op] || (SPECIAL_M[c.op] ? 'özel röle' : '');
  if (lbl) out.push(`<text class="lbl" x="${m}" y="${cy + 29}" text-anchor="middle">${esc(trunc(lbl, 14))}</text>`);
  out.push(`<rect class="hit" data-sel="${c.id}" x="${x + 4}" y="${cy - RH / 2 + 2}" width="${CW - 8}" height="${RH - 4}"><title>${esc(c.op)} — tıkla: düzenle · sürükle: taşı (Ctrl: kopyala)</title></rect>`);
  slots.push({ t: 'p', id: c.id, x: m, y: cy + RH / 2 - 4 });
}

function drawCoil(o, x, cy, out) {
  const c = o.coil;
  const bad = checkOperand(c.op, c.type, c.k);
  const lbl = prog.labels[c.op] || '';
  if (c.type === 'OUT') {
    const m = x + COILW / 2;
    out.push(wire(x, cy, m - 13, cy, o.id + ':q'));
    out.push(`<g class="coil" data-q="${o.id}"><circle class="cfill" cx="${m}" cy="${cy}" r="11"/>
      <path class="cbar" fill="none" d="M${m - 7},${cy - 14} Q${m - 16},${cy} ${m - 7},${cy + 14} M${m + 7},${cy - 14} Q${m + 16},${cy} ${m + 7},${cy + 14}"/></g>`);
    out.push(`<line class="w0" x1="${m + 13}" y1="${cy}" x2="${x + COILW}" y2="${cy}"/>`);
    out.push(`<text class="op${bad ? ' bad' : ''}" x="${m}" y="${cy - 20}" text-anchor="middle">${esc(c.op || '?')}</text>`);
    if (lbl) out.push(`<text class="lbl" x="${m}" y="${cy + 29}" text-anchor="middle">${esc(trunc(lbl, 22))}</text>`);
  } else {
    out.push(wire(x, cy, x + 6, cy, o.id + ':q'));
    const k = c.type === 'TMR' || c.type === 'CNT' ? ' K' + (isNaN(parseK(c.k)) ? '?' : parseK(c.k)) : '';
    out.push(`<g class="coil" data-q="${o.id}"><rect class="box" x="${x + 6}" y="${cy - 15}" width="${COILW - 12}" height="30" rx="3"/></g>`);
    out.push(`<text class="boxt${bad ? ' op bad' : ''}" x="${x + COILW / 2}" y="${cy + 5}" text-anchor="middle">${esc(c.type + ' ' + (c.op || '?') + k)}</text>`);
    out.push(`<line class="w0" x1="${x + COILW - 6}" y1="${cy}" x2="${x + COILW}" y2="${cy}"/>`);
    const tvOp = c.op;
    out.push(`<text class="tv" data-tv="${esc(tvOp)}" x="${x + COILW / 2}" y="${cy + 28}" text-anchor="middle"></text>`);
    if (lbl) out.push(`<text class="lbl" x="${x + COILW / 2}" y="${cy - 19}" text-anchor="middle">${esc(trunc(lbl, 22))}</text>`);
  }
  out.push(`<rect class="hit" data-sel="${o.id}" x="${x + 2}" y="${cy - RH / 2 + 2}" width="${COILW - 4}" height="${RH - 4}"><title>${esc(c.type + ' ' + c.op)} — tıkla: düzenle · sürükle: taşı (Ctrl: kopyala)</title></rect>`);
}

// ctx: bırakma noktası türü — 'input' (satır girişi), 'branch' (paralel dal içi), 'pre' (çıkış dalı), null (nokta yok)
function drawSeries(s, x, y, w, pw, out, ctx) {
  let cx = x;
  const cy = y + RH / 2;
  // Komşu serilerin noktaları üst üste binmesin diye dal içindekileri biraz içeri kaydır
  const inset = ctx === 'branch' ? 14 : ctx === 'pre' ? 16 : 0;
  if (ctx && s.length === 0) slots.push({ t: 'c', series: s, index: 0, x: x + 26, y: cy, ctx });
  s.forEach((b, i) => {
    if (ctx) slots.push({ t: 'c', series: s, index: i, x: cx + (i === 0 ? inset : 0), y: cy, ctx });
    const z = bsz(b);
    drawBlock(b, cx, y, z, pw, out);
    pw = b.id + ':out';
    cx += z.w * CW;
  });
  if (ctx && s.length) slots.push({ t: 'c', series: s, index: s.length, x: cx - (ctx === 'branch' ? 14 : ctx === 'input' ? 6 : 0), y: cy, ctx });
  const ex = x + w * CW;
  if (ex > cx + 0.5) out.push(wire(cx, cy, ex, cy, pw));
  return pw;
}

function drawBlock(b, x, y, z, pw, out) {
  if (b.t === 'c') return drawContact(b, x, y + RH / 2, out);
  const W = z.w * CW;
  let by = y;
  const cys = [];
  for (const br of b.branches) {
    cys.push(by + RH / 2);
    drawSeries(br, x, by, z.w, b.id + ':in', out, 'branch');
    by += ssz(br).h * RH;
  }
  const last = cys[cys.length - 1];
  out.push(wire(x, y + RH / 2, x, last, b.id + ':in'));
  out.push(wire(x + W, y + RH / 2, x + W, last, b.id + ':out'));
}

function drawRung(r, ri, y0, cols, coilX, rightX, out) {
  const iz = ssz(r.input);
  const orows = r.outputs.map((o) => ssz(o.pre).h);
  const rows = Math.max(iz.h, orows.reduce((a, b) => a + b, 0) || 1);
  const top = y0 + HEAD, H = rows * RH;
  out.push(`<rect class="rungbg${selId === r.id ? ' sel' : ''}" data-sel="${r.id}" x="2" y="${y0}" width="${rightX + 6}" height="${HEAD + H}"/>`);
  out.push(`<text class="rnum" data-sel="${r.id}" x="${LEFT - 12}" y="${top + RH / 2 + 5}" text-anchor="end">${ri + 1}<title>Satır ${ri + 1} — tıkla: satır işlemleri</title></text>`);
  if (r.comment) out.push(`<text class="rcom" x="${LEFT + 8}" y="${y0 + 15}">${esc(r.comment.split('\n')[0])}</text>`);

  slots.push({ t: 'r', index: ri, x: (LEFT + rightX) / 2, y: y0 + 1, x0: LEFT, x1: rightX });
  let pwJ = drawSeries(r.input, LEFT, top, iz.w, '1', out, 'input');
  if (r.input.length === 0) pwJ = '1';
  const J = LEFT + iz.w * CW;
  let oy = top, prevCy = null;
  // Tek çıkışlı satırda "çıkış dalına kontak" ile "satır sonuna seri" aynı şeydir: ayrı nokta gösterme
  const preSlots = r.outputs.length > 1 || r.outputs.some((o) => o.pre.length);
  r.outputs.forEach((o, oi) => {
    const cy = oy + RH / 2;
    if (oi > 0) out.push(wire(J, prevCy, J, cy, pwJ));
    drawSeries(o.pre, J, oy, cols - iz.w, pwJ, out, preSlots ? 'pre' : null);
    out.push(wire(LEFT + cols * CW, cy, coilX, cy, o.id + ':q'));
    drawCoil(o, coilX, cy, out);
    out.push(`<line class="w0" x1="${coilX + COILW}" y1="${cy}" x2="${rightX}" y2="${cy}"/>`);
    slots.push({ t: 'o', rung: r, index: oi + 1, x: coilX + COILW / 2, y: oy + orows[oi] * RH - 3 });
    prevCy = cy;
    oy += orows[oi] * RH;
  });
  if (r.outputs.length === 0) out.push(wire(J, top + RH / 2, coilX, top + RH / 2, pwJ));
  return top + H + 8;
}

function render() {
  let cols = 3;
  for (const r of prog.rungs) {
    let pw = 0;
    r.outputs.forEach((o) => (pw = Math.max(pw, ssz(o.pre).w)));
    cols = Math.max(cols, ssz(r.input).w + pw + 1);
  }
  const coilX = LEFT + cols * CW + GAP;
  const rightX = coilX + COILW + 14;
  const out = [];
  slots = [];
  let y = 8;
  prog.rungs.forEach((r, ri) => (y = drawRung(r, ri, y, cols, coilX, rightX, out)));
  out.push(`<g class="addrow" id="addRung"><rect x="${LEFT + 10}" y="${y + 6}" width="${rightX - LEFT - 20}" height="36" rx="8"/>
    <text x="${(LEFT + rightX) / 2}" y="${y + 29}" text-anchor="middle">＋ Yeni satır ekle — ya da parçayı buraya sürükle</text></g>`);
  slots.push({ t: 'r', index: prog.rungs.length, x: (LEFT + rightX) / 2, y: y + 24, x0: LEFT, x1: rightX });
  const H = y + 54;
  const rails = `<line class="rail" data-pw="1" x1="${LEFT}" y1="4" x2="${LEFT}" y2="${y}"/>
    <line class="rail" x1="${rightX}" y1="4" x2="${rightX}" y2="${y}"/>`;
  const svg = $('#ladder');
  svg.setAttribute('width', Math.round((rightX + 16) * zoom));
  svg.setAttribute('height', Math.round(H * zoom));
  svg.setAttribute('viewBox', `0 0 ${rightX + 16} ${H}`);
  $('#zVal').textContent = Math.round(zoom * 100) + '%';
  svg.innerHTML = out.join('') + rails;
  pwEls = svg.querySelectorAll('[data-pw]');
  clEls = svg.querySelectorAll('[data-cl]');
  qEls = svg.querySelectorAll('[data-q]');
  tvEls = svg.querySelectorAll('[data-tv]');
  svg.querySelectorAll('.hit').forEach((h) => h.classList.toggle('sel', h.dataset.sel === selId));
  buildDevices();
  updateView();
}

// ------------------------------------------------------------------ canlı durum
function devText(op) {
  const d = op[0];
  if (d === 'T') {
    const t = sim.T[op];
    const sv = t && t.sv != null ? t.sv : svOf(op);
    const cv = t ? t.cv : 0;
    return `${cv} / ${sv}   (${((cv * timerBase(op)) / 1000).toFixed(1)} s)`;
  }
  if (d === 'C') {
    const t = sim.C[op];
    return `${t ? t.cv : 0} / ${t && t.sv != null ? t.sv : svOf(op)}`;
  }
  return `${op} = ${sim.get(op) && mode !== 'stop' ? 1 : 0}`;
}
function svOf(op) {
  for (const r of prog.rungs) for (const o of r.outputs) if (o.coil.op === op && (o.coil.type === 'TMR' || o.coil.type === 'CNT')) return parseK(o.coil.k);
  return '?';
}

function updateView() {
  const live = mode !== 'stop';
  const V = sim.vis;
  for (const el of pwEls) {
    const k = el.dataset.pw;
    let on = false;
    if (live) {
      if (k === '1') on = true;
      else {
        const [id, w] = k.split(':');
        const v = V[id];
        if (v) on = w === 'out' ? v.out : v.pin;
      }
    }
    el.classList.toggle('on', !!on);
  }
  for (const el of clEls) { const v = V[el.dataset.cl]; el.classList.toggle('on', live && !!(v && v.closed)); }
  for (const el of qEls) { const v = V[el.dataset.q]; el.classList.toggle('on', live && !!(v && v.pin)); }
  for (const el of tvEls) el.textContent = devText(el.dataset.tv);
  updatePanels();
  $('#status').innerHTML = `<span class="pill ${mode}"><i></i>${{ stop: 'STOP', run: 'RUN', pause: 'DURAKLATILDI' }[mode]}</span>tarama ${sim.scan} · ${(sim.timeMs / 1000).toFixed(1)} s`;
  $('#bRun').classList.toggle('active', mode === 'run');
  $('#bPause').classList.toggle('active', mode === 'pause');
}

// ------------------------------------------------------------------ G/Ç panelleri
function buildIO() {
  $('#inputs').innerHTML = XS.map((x) => `<div class="xbtn" data-x="${x}">${x}<small></small></div>`).join('');
  $('#outputs').innerHTML = YS.map((y) => `<div class="lamp" data-y="${y}"><i></i><span>${y}<br><small></small></span></div>`).join('');
  document.querySelectorAll('.xbtn').forEach((b) => {
    const x = b.dataset.x;
    const push = () => document.querySelector('input[name=xmode]:checked').value === 'push';
    b.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (push()) setInput(x, true);
      else setInput(x, !inputs[x]);
    });
    const release = () => { if (push() && !locked[x]) setInput(x, false); };
    b.addEventListener('mouseup', release);
    b.addEventListener('mouseleave', release);
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      locked[x] = !locked[x];
      setInput(x, !!locked[x]);
    });
  });
}
// Kısa basış kilidi: basış, PLC en az bir tarama boyunca görene kadar tutulur. Yoksa iki tarama
// arasında basılıp bırakılan bir buton (hızlı tıklama, klavyede hızlı tuş) hiç görülmez; mühürleme
// ve sayıcılar "çalışmıyor" gibi görünür. Duraklatılmışken yapılan basış da bir sonraki Adım'da görülür.
const pulse = {};
function setInput(x, v) {
  inputs[x] = v;
  if (v) pulse[x] = true;
  updatePanels();
}
function clearPulses() {
  for (const k in pulse) delete pulse[k];
}
function updatePanels() {
  const live = mode !== 'stop';
  document.querySelectorAll('.xbtn').forEach((b) => {
    const x = b.dataset.x;
    b.classList.toggle('on', !!inputs[x]);
    b.classList.toggle('lock', !!locked[x]);
    b.querySelector('small').textContent = prog.labels[x] || '';
  });
  document.querySelectorAll('.lamp').forEach((l) => {
    const y = l.dataset.y;
    l.classList.toggle('on', live && !!sim.bits[y]);
    l.querySelector('small').textContent = prog.labels[y] || '';
  });
  document.querySelectorAll('[data-dev]').forEach((el) => {
    const op = el.dataset.dev;
    const d = op[0];
    if (d === 'T' || d === 'C') {
      const t = (d === 'T' ? sim.T : sim.C)[op];
      const sv = t && t.sv ? t.sv : svOf(op);
      const cv = t ? t.cv : 0;
      el.querySelector('b').textContent = devText(op).replace(/\s+\(/, ' (');
      const bar = el.nextElementSibling;
      bar.firstElementChild.style.width = Math.min(100, (cv / (sv || 1)) * 100) + '%';
      bar.classList.toggle('done', !!(t && t.done));
      el.classList.toggle('on', live && !!(t && t.done));
    } else {
      const on = live && sim.get(op);
      el.querySelector('b').textContent = on ? '1' : '0';
      el.classList.toggle('on', !!on);
    }
  });
}
function usedDevices() {
  const set = new Set();
  const walk = (s) => s.forEach((b) => (b.t === 'c' ? set.add(b.op) : b.branches.forEach(walk)));
  prog.rungs.forEach((r) => { walk(r.input); r.outputs.forEach((o) => { walk(o.pre); set.add(o.coil.op); }); });
  const num = (a) => parseInt(a.slice(1), 10);
  const pick = (d) => [...set].filter((o) => o && o[0] === d && /^\w\d+$/.test(o)).sort((a, b) => num(a) - num(b));
  return { X: pick('X'), Y: pick('Y'), M: pick('M'), S: pick('S'), T: pick('T'), C: pick('C') };
}
function buildDevices() {
  const u = usedDevices();
  let h = '';
  [...u.M, ...u.S].forEach((m) => (h += `<div class="dev" data-dev="${m}"><span>${m}${prog.labels[m] ? ' · ' + esc(prog.labels[m]) : ''}</span><b>0</b></div>`));
  [...u.T, ...u.C].forEach((t) => (h += `<div class="dev" data-dev="${t}"><span>${t}</span><b></b></div><div class="bar"><i></i></div>`));
  $('#devices').innerHTML = h || '<div class="hint">Programda M/T/C yok.</div>';
}

// ------------------------------------------------------------------ seçim & düzenleme
function locate(id) {
  for (let ri = 0; ri < prog.rungs.length; ri++) {
    const r = prog.rungs[ri];
    if (r.id === id) return { kind: 'rung', r, ri };
    let f = findIn(r.input, id, null);
    if (f) return Object.assign(f, { r, ri, where: 'input' });
    for (let oi = 0; oi < r.outputs.length; oi++) {
      const o = r.outputs[oi];
      if (o.id === id) return { kind: 'output', r, ri, o, oi };
      f = findIn(o.pre, id, null);
      if (f) return Object.assign(f, { r, ri, o, oi, where: 'pre' });
    }
  }
  return null;
}
function findIn(series, id, parent) {
  for (let i = 0; i < series.length; i++) {
    const b = series[i];
    if (b.id === id) return { kind: b.t === 'c' ? 'contact' : 'par', node: b, series, index: i, parent };
    if (b.t === 'p')
      for (const br of b.branches) {
        const f = findIn(br, id, { par: b, series, index: i });
        if (f) return f;
      }
  }
  return null;
}

function select(id) {
  selId = id;
  document.querySelectorAll('#ladder .hit').forEach((h) => h.classList.toggle('sel', h.dataset.sel === id));
  document.querySelectorAll('#ladder .rungbg').forEach((h) => h.classList.toggle('sel', h.dataset.sel === id));
  buildEditor();
}

// ------------------------------------------------------------------ geri al / yinele (sekme başına, bellekte)
let restoring = false;
let lastPushT = 0;
function recordHistory(newIl, coalesce) {
  const t = tabs[activeTab];
  if (!t || restoring || t.il === newIl) return;
  t.undo = t.undo || [];
  const now = Date.now();
  // Adres kutusuna yazarken her tuş ayrı adım olmasın: 1 sn içindeki yazımları birleştir
  if (!(coalesce && now - lastPushT < 1000 && t.undo.length)) {
    t.undo.push(t.il);
    if (t.undo.length > 150) t.undo.shift();
  }
  lastPushT = coalesce ? now : 0;
  t.redo = [];
}
function applyHistory(il) {
  restoring = true;
  prog = parseIL(il).prog;
  if (selId && !locate(selId)) selId = null;
  selId = null;
  commit();
  restoring = false;
}
function undo() {
  const t = tabs[activeTab];
  if (!t || !t.undo || !t.undo.length) return toast('Geri alınacak adım yok');
  (t.redo = t.redo || []).push(t.il);
  applyHistory(t.undo.pop());
  toast('Geri alındı');
}
function redo() {
  const t = tabs[activeTab];
  if (!t || !t.redo || !t.redo.length) return toast('Yinelenecek adım yok');
  (t.undo = t.undo || []).push(t.il);
  applyHistory(t.redo.pop());
  toast('Yinelendi');
}
function updateUndoButtons() {
  const t = tabs[activeTab];
  $('#bUndo').disabled = !(t && t.undo && t.undo.length);
  $('#bRedo').disabled = !(t && t.redo && t.redo.length);
}

// Model değişti: IL'yi yenile, çiz, kaydet
function commit(keepEditor) {
  const il = toIL(prog);
  recordHistory(il, keepEditor);
  $('#il').value = il;
  syncTab(il);
  render();
  showProblems();
  updateUndoButtons();
  if (!keepEditor) buildEditor();
}

function showProblems() {
  const p = validate(prog);
  $('#problems').innerHTML = p.length
    ? '<h2 style="margin-top:12px">Uyarılar</h2>' +
      p.map((e) => `<div class="${e.warn ? 'wn' : 'e'}" data-go="${e.id || ''}">Satır ${e.rung + 1}: ${esc(e.msg)}</div>`).join('')
    : '<div class="okmsg" style="margin-top:8px">✓ Adres hatası yok</div>';
  $('#problems').querySelectorAll('[data-go]').forEach((d) => d.addEventListener('click', () => d.dataset.go && select(d.dataset.go)));
}

const CHIPS = ['X0', 'X1', 'X2', 'X3', 'Y0', 'Y1', 'Y2', 'M0', 'M1', 'T0', 'T1', 'C0', 'M1000', 'M1013'];

function buildEditor() {
  const ed = $('#editor');
  const info = selId && locate(selId);
  if (!info) {
    ed.innerHTML = `<h2>Düzenleyici</h2><div class="hint">Düzenlemek için ladder'da bir kontağa, bobine ya da satır numarasına tıkla.
      Panodan parça <b>sürükle</b> ya da panodaki parçaya <b>tıkla</b>.</div>
      <div class="shortcuts">
        <span><kbd>F5</kbd></span><span>RUN</span>
        <span><kbd>Boşluk</kbd></span><span>Duraklat / devam</span>
        <span><kbd>0</kbd>–<kbd>7</kbd></span><span>X0–X7 girişine bas</span>
        <span><kbd>Ctrl</kbd>+<kbd>Z</kbd></span><span>Geri al</span>
        <span><kbd>Ctrl</kbd>+sürükle</span><span>Kopyalayarak taşı</span>
        <span><kbd>Del</kbd></span><span>Seçiliyi sil</span>
      </div>`;
    return;
  }
  if (info.kind === 'contact') {
    const c = info.node;
    ed.innerHTML = `<h3>Kontak <span class="tag">satır ${info.ri + 1}</span></h3>
      <label>Tür<select id="eKind">
        <option value="NO">─| |─  Normalde açık (LD / AND / OR)</option>
        <option value="NC">─|/|─  Normalde kapalı (LDI / ANI / ORI)</option>
        <option value="P">─|↑|─  Yükselen kenar (LDP / ANDP / ORP)</option>
        <option value="F">─|↓|─  Düşen kenar (LDF / ANDF / ORF)</option></select></label>
      <label>Adres<input id="eOp" value="${esc(c.op)}"></label>
      <div class="chips">${CHIPS.map((x) => `<button data-chip="${x}"${x === c.op ? ' class="cur"' : ''}>${x}</button>`).join('')}</div>
      <div class="err" id="eErr"></div>
      <label>Etiket (${esc(c.op)} için açıklama)<input id="eLbl" value="${esc(prog.labels[c.op] || '')}" placeholder="ör. start"></label>
      <div class="btns">
        <button data-act="addL">← Sola seri ekle</button><button data-act="addR">Sağa seri ekle →</button>
        <button data-act="parC">↓ Bu kontağa paralel</button><button data-act="parS">↓ Bütün hatta paralel</button>
        <button data-act="del" class="danger wide">Sil (Delete)</button>
      </div>
      <p class="tip">"Bütün hatta paralel": bu kontağın bulunduğu seri hattın tamamına alt dal açar — mühürleme (Y0'ı start'a paralel) gibi.</p>`;
    $('#eKind').value = c.kind;
    const opErr = () => ($('#eErr').textContent = checkOperand(c.op, 'contact'));
    opErr();
    $('#eKind').onchange = (e) => { c.kind = e.target.value; commit(true); };
    $('#eOp').oninput = (e) => { c.op = e.target.value.toUpperCase().trim(); opErr(); commit(true); };
    $('#eOp').onchange = () => buildEditor();
    $('#eLbl').oninput = (e) => { prog.labels[c.op] = e.target.value; commit(true); };
    ed.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => { c.op = b.dataset.chip; commit(); }));
  } else if (info.kind === 'output') {
    const c = info.o.coil;
    const isTC = c.type === 'TMR' || c.type === 'CNT';
    let kHint = '';
    if (c.type === 'TMR' && /^T\d+$/.test(c.op)) {
      const base = timerBase(c.op), k = parseK(c.k);
      kHint = `${c.op}: ${base} ms taban → K${isNaN(k) ? '?' : k} = ${isNaN(k) ? '?' : ((k * base) / 1000).toFixed(base === 100 ? 1 : 3)} s`;
    }
    ed.innerHTML = `<h3>Çıkış <span class="tag">satır ${info.ri + 1}</span></h3>
      <label>Komut<select id="eType">
        <option value="OUT">─( )  OUT — bobin</option>
        <option value="SET">[SET]  kur (kalıcı 1)</option>
        <option value="RST">[RST]  sıfırla (bit, T veya C)</option>
        <option value="TMR">[TMR]  zamanlayıcı</option>
        <option value="CNT">[CNT]  sayıcı</option>
        <option value="PLS">[PLS]  yükselen kenarda tek darbe</option>
        <option value="PLF">[PLF]  düşen kenarda tek darbe</option></select></label>
      <label>Adres<input id="eOp" value="${esc(c.op)}"></label>
      <div class="chips">${CHIPS.filter((x) => x[0] !== 'X').map((x) => `<button data-chip="${x}"${x === c.op ? ' class="cur"' : ''}>${x}</button>`).join('')}</div>
      ${isTC ? `<label>Ayar değeri K<input id="eK" type="number" min="1" max="32767" value="${esc(c.k)}"></label><div class="tip">${kHint}</div>` : ''}
      <div class="err" id="eErr"></div>
      <label>Etiket (${esc(c.op)} için açıklama)<input id="eLbl" value="${esc(prog.labels[c.op] || '')}" placeholder="ör. motor"></label>
      <div class="btns">
        <button data-act="addOut">↓ Alta çıkış ekle</button><button data-act="addPre">Bu dala kontak ekle</button>
        <button data-act="delOut" class="danger wide">Sil (Delete)</button>
      </div>
      <p class="tip">Alta çıkış: aynı koşulla çalışan ikinci bobin (tahtadaki Y0 + TMR T0 gibi). Bu dala kontak: yalnızca bu çıkışa giden ek koşul (IL'de MPS/MRD/MPP olur).</p>`;
    $('#eType').value = c.type;
    const opErr = () => ($('#eErr').textContent = checkOperand(c.op, c.type, c.k));
    opErr();
    $('#eType').onchange = (e) => {
      c.type = e.target.value;
      if (c.type === 'TMR') { if (!/^T/.test(c.op)) c.op = 'T0'; if (!c.k) c.k = '50'; }
      else if (c.type === 'CNT') { if (!/^C/.test(c.op)) c.op = 'C0'; if (!c.k) c.k = '5'; }
      else if (/^[TC]/.test(c.op) && c.type !== 'RST') c.op = 'Y0';
      commit();
    };
    $('#eOp').oninput = (e) => { c.op = e.target.value.toUpperCase().trim(); opErr(); commit(true); };
    $('#eOp').onchange = () => buildEditor();
    if (isTC) {
      $('#eK').oninput = (e) => { c.k = e.target.value; opErr(); commit(true); };
      $('#eK').onchange = () => buildEditor();
    }
    $('#eLbl').oninput = (e) => { prog.labels[c.op] = e.target.value; commit(true); };
    ed.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => { c.op = b.dataset.chip; commit(); }));
  } else if (info.kind === 'rung') {
    ed.innerHTML = `<h3>Satır ${info.ri + 1}</h3>
      <label>Açıklama<textarea id="eCom" rows="2" placeholder="Bu satır ne yapıyor?">${esc(info.r.comment)}</textarea></label>
      <div class="btns">
        <button data-act="rAbove">＋ Üstüne satır</button><button data-act="rBelow">＋ Altına satır</button>
        <button data-act="rUp">↑ Yukarı taşı</button><button data-act="rDown">↓ Aşağı taşı</button>
        <button data-act="rDel" class="danger wide">Satırı sil</button>
      </div>`;
    $('#eCom').oninput = (e) => { info.r.comment = e.target.value; commit(true); };
  }
  ed.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => doAction(b.dataset.act)));
}

const newRung = () => rung([contact('NO', 'X0')], [output([], coil('OUT', 'Y0'))]);

// Kontağı sil; dal boşalırsa dalı, tek dal kalırsa paraleli kaldır
function removeContact(info) {
  info.series.splice(info.index, 1);
  const p = info.parent;
  if (p && info.series.length === 0) {
    p.par.branches.splice(p.par.branches.indexOf(info.series), 1);
    if (p.par.branches.length === 1) p.series.splice(p.index, 1, ...p.par.branches[0]);
  }
}

function doAction(act) {
  const info = selId && locate(selId);
  if (!info) return;
  let next = selId;
  switch (act) {
    case 'addL':
    case 'addR': {
      const n = contact('NO', 'X0');
      info.series.splice(info.index + (act === 'addR' ? 1 : 0), 0, n);
      next = n.id;
      break;
    }
    case 'parC': {
      const n = contact('NO', 'X0');
      if (info.parent && info.series.length === 1) info.parent.par.branches.push([n]);
      else info.series[info.index] = par([[info.node], [n]]);
      next = n.id;
      break;
    }
    case 'parS': {
      const n = contact('NO', 'X0');
      const old = info.series.splice(0, info.series.length);
      info.series.push(par([old, [n]]));
      next = n.id;
      break;
    }
    case 'del':
      removeContact(info);
      next = info.r.id;
      break;
    case 'dup': {
      if (info.kind === 'contact') {
        const n = contact(info.node.kind, info.node.op);
        info.series.splice(info.index + 1, 0, n);
        next = n.id;
      } else if (info.kind === 'output') {
        const o = output(PLC.cloneSeries(info.o.pre), { ...info.o.coil });
        info.r.outputs.splice(info.oi + 1, 0, o);
        next = o.id;
      } else if (info.kind === 'rung') {
        const r = parseIL(toIL({ rungs: [info.r], labels: {} })).prog.rungs[0];
        prog.rungs.splice(info.ri + 1, 0, r);
        next = r.id;
      }
      break;
    }
    case 'addOut': {
      const o = output([], coil('OUT', 'Y0'));
      info.r.outputs.splice(info.oi + 1, 0, o);
      next = o.id;
      break;
    }
    case 'addPre': {
      const n = contact('NO', 'X0');
      info.o.pre.push(n);
      next = n.id;
      break;
    }
    case 'delOut':
      if (info.r.outputs.length <= 1) {
        toast('Satırın en az bir çıkışı olmalı — satırı silmek için satır numarasına tıkla', true);
        return;
      }
      info.r.outputs.splice(info.oi, 1);
      next = info.r.id;
      break;
    case 'rAbove':
    case 'rBelow': {
      const r = newRung();
      prog.rungs.splice(info.ri + (act === 'rBelow' ? 1 : 0), 0, r);
      next = r.id;
      break;
    }
    case 'rUp':
    case 'rDown': {
      const j = info.ri + (act === 'rUp' ? -1 : 1);
      if (j < 0 || j >= prog.rungs.length) return;
      [prog.rungs[info.ri], prog.rungs[j]] = [prog.rungs[j], prog.rungs[info.ri]];
      break;
    }
    case 'rDel':
      prog.rungs.splice(info.ri, 1);
      next = null;
      break;
  }
  selId = next;
  commit();
  const op = $('#eOp');
  if (op && ['addL', 'addR', 'parC', 'parS', 'addPre', 'addOut'].includes(act)) { op.focus(); op.select(); }
}

// ------------------------------------------------------------------ parça panosu
const PARTS = [
  { g: 'c', k: 'NO', name: 'Açık kontak' },
  { g: 'c', k: 'NC', name: 'Kapalı kontak' },
  { g: 'c', k: 'P', name: 'Yükselen kenar' },
  { g: 'c', k: 'F', name: 'Düşen kenar' },
  { g: 'o', k: 'OUT', name: 'Bobin (OUT)' },
  { g: 'o', k: 'SET', name: 'Kur (SET)' },
  { g: 'o', k: 'RST', name: 'Sıfırla (RST)' },
  { g: 'o', k: 'TMR', name: 'Zamanlayıcı' },
  { g: 'o', k: 'CNT', name: 'Sayıcı' },
  { g: 'o', k: 'PLS', name: 'Yükselen darbe' },
  { g: 'o', k: 'PLF', name: 'Düşen darbe' },
];
let eraser = false;

// Pano / sürükleme önizlemesi için küçük ladder sembolü (ladder'daki çizimle aynı dil)
function partIcon(g, k) {
  const s = 'stroke="currentColor" fill="none" stroke-linecap="round"';
  if (g === 'c') {
    let extra = '';
    if (k === 'NC') extra = `<line x1="30" y1="19" x2="46" y2="5" ${s} stroke-width="2.2"/>`;
    if (k === 'P') extra = `<path d="M38 17V8M34.5 11.5L38 8l3.5 3.5" ${s} stroke-width="1.8"/>`;
    if (k === 'F') extra = `<path d="M38 7v9M34.5 12.5L38 16l3.5-3.5" ${s} stroke-width="1.8"/>`;
    return `<svg class="pi" viewBox="0 0 76 24"><path d="M4 12h28M44 12h28" ${s} stroke-width="2"/><path d="M32 3v18M44 3v18" ${s} stroke-width="2.6"/>${extra}</svg>`;
  }
  if (k === 'OUT')
    return `<svg class="pi" viewBox="0 0 76 24"><path d="M4 12h24M48 12h24" ${s} stroke-width="2"/><path d="M33 3Q25 12 33 21M43 3Q51 12 43 21" ${s} stroke-width="2.4"/></svg>`;
  return `<svg class="pi" viewBox="0 0 76 24"><path d="M2 12h8M66 12h8" ${s} stroke-width="2"/><rect x="10" y="3" width="56" height="18" rx="3" ${s} stroke-width="2"/><text x="38" y="16.5" text-anchor="middle" fill="currentColor" font-family="Consolas,monospace" font-weight="700" font-size="11">${k}</text></svg>`;
}

// Programda kullanılmayan ilk adres (ör. Y0 doluysa Y1)
function nextFree(d, octalNum) {
  const used = new Set();
  prog.rungs.forEach((r) => r.outputs.forEach((o) => used.add(o.coil.op)));
  for (let i = 0; i < 256; i++) {
    const op = d + (octalNum ? i.toString(8) : i);
    if (!used.has(op)) return op;
  }
  return d + '0';
}
function makeCoil(type) {
  switch (type) {
    case 'TMR': return coil('TMR', nextFree('T'), '50');
    case 'CNT': return coil('CNT', nextFree('C'), '5');
    case 'OUT': return coil('OUT', nextFree('Y', true));
    case 'RST': return coil('RST', 'M0');
    default: return coil(type, 'M0');
  }
}

// Tıklama ile ekleme: seçili öğenin yanına
function insertPart(part, targetId, zone) {
  if (eraser) toggleEraser(false);
  const info = targetId && locate(targetId);
  let newId;
  if (part.g === 'c') {
    const c = contact(part.k, 'X0');
    newId = c.id;
    if (!info) prog.rungs.push(rung([c], [output([], makeCoil('OUT'))]));
    else if (info.kind === 'contact') {
      if (zone === 'par') {
        if (info.parent && info.series.length === 1) info.parent.par.branches.push([c]);
        else info.series[info.index] = par([[info.node], [c]]);
      } else info.series.splice(info.index + (zone === 'left' ? 0 : 1), 0, c);
    } else if (info.kind === 'output') {
      if (zone === 'left') info.o.pre.unshift(c);
      else info.o.pre.push(c);
    } else info.r.input.push(c);
  } else {
    const o = output([], makeCoil(part.k));
    newId = o.id;
    if (!info) prog.rungs.push(rung([contact('NO', 'X0')], [o]));
    else if (info.kind === 'output') info.r.outputs.splice(info.oi + 1, 0, o);
    else info.r.outputs.push(o);
  }
  selId = newId;
  commit();
  focusOp();
}
function focusOp() {
  const op = $('#eOp');
  if (op) { op.focus({ preventScroll: true }); op.select(); }
}

function toggleEraser(on) {
  eraser = on === undefined ? !eraser : on;
  document.body.classList.toggle('eraser', eraser);
  const b = $('#pEraser');
  if (b) b.classList.toggle('on', eraser);
}

function buildPalette() {
  const item = (p, i) => `<button class="part" data-part="${i}" title="${p.name} — sürükle ya da tıkla">${partIcon(p.g, p.k)}<span>${p.name}</span></button>`;
  $('#palette').innerHTML =
    '<div class="trashMsg"><svg class="ico" style="width:22px;height:22px"><use href="#i-trash"/></svg><br>Buraya bırak: sil</div>' +
    '<h2>Kontaklar</h2>' + PARTS.map((p, i) => (p.g === 'c' ? item(p, i) : '')).join('') +
    '<h2>Çıkışlar</h2>' + PARTS.map((p, i) => (p.g === 'o' ? item(p, i) : '')).join('') +
    `<h2>Araçlar</h2>
     <button class="part tool" id="pRung" title="Seçili satırın altına yeni satır"><svg class="ico"><use href="#i-rows"/></svg><span>Satır</span></button>
     <button class="part tool" id="pDel" title="Seçiliyi sil (Delete)"><svg class="ico"><use href="#i-trash"/></svg><span>Sil</span></button>
     <button class="part tool" id="pEraser" title="Açıkken tıkladığın parça silinir (Esc ile kapanır)"><svg class="ico"><use href="#i-eraser"/></svg><span>Silgi</span></button>`;
  $('#palette').querySelectorAll('[data-part]').forEach((b) => {
    const p = PARTS[+b.dataset.part];
    b.addEventListener('click', () => insertPart(p, selId, 'right'));
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      beginPointer(e, { src: 'palette', g: p.g, k: p.k, name: p.name });
    });
  });
  $('#pRung').onclick = () => {
    const r = newRung();
    const info = selId && locate(selId);
    prog.rungs.splice(info ? info.ri + 1 : prog.rungs.length, 0, r);
    selId = r.input[0].id;
    commit();
  };
  $('#pDel').onclick = () => {
    const info = selId && locate(selId);
    if (info) doAction({ contact: 'del', output: 'delOut', rung: 'rDel' }[info.kind]);
    else toast('Önce silinecek parçayı seç');
  };
  $('#pEraser').onclick = () => toggleEraser();
}

// ------------------------------------------------------------------ sürükle-bırak (pointer tabanlı)
// Sürükleme başlayınca tüm geçerli bırakma noktaları ladder'da gösterilir; imlece en yakın nokta
// (mıknatıs yarıçapı içinde) seçilir ve ne olacağı etiketle yazılır. Ladder'daki parça sürüklenirse
// taşınır (Ctrl: kopyalanır); panoya bırakılırsa silinir. Esc iptal eder.
const SNAP = 64;          // mıknatıs yarıçapı (ekran px)
const DRAG_START = 5;     // tıklama ile sürüklemeyi ayıran mesafe (px)
let drag = null;
let suppressClick = false;

function beginPointer(e, payload) {
  if (eraser && payload.src === 'ladder') return;
  drag = { payload, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, started: false, hot: null, overTrash: false, copy: false };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', cancelDrag);
}

function startDrag() {
  drag.started = true;
  document.body.classList.add('dragging');
  const p = drag.payload;
  if (p.src === 'ladder') {
    const info = locate(p.id);
    if (!info) return cancelDrag();
    p.info = info;
    p.g = info.kind === 'contact' ? 'c' : 'o';
    p.k = info.kind === 'contact' ? info.node.kind : info.o.coil.type;
    p.name = info.kind === 'contact' ? info.node.op : `${info.o.coil.type} ${info.o.coil.op}`;
    const h = document.querySelector(`#ladder .hit[data-sel="${p.id}"]`);
    if (h) h.classList.add('dragsrc');
    $('#palette').classList.add('trash');
  }
  const g = $('#dragGhost');
  g.innerHTML = partIcon(p.g, p.k) + `<span id="ghostTxt">${esc(p.name)}</span>`;
  g.style.display = 'flex';
  drag.valid = slots.filter((s) => slotAccepts(s, p));
  drawSlotLayer();
  drag.raf = requestAnimationFrame(autoScroll);
}

// Bu nokta bu parçayı kabul eder mi?
function slotAccepts(s, p) {
  if (p.g === 'c') {
    if (s.t === 'o') return false;
    if (p.src === 'ladder' && s.t === 'p' && s.id === p.id) return false;
    return true;
  }
  if (s.t === 'c' || s.t === 'p') return false;
  if (p.src === 'ladder' && s.t === 'o' && s.rung === p.info.r && (s.index === p.info.oi || s.index === p.info.oi + 1)) return false;
  return true;
}

function slotLabel(s, p) {
  const copy = drag && drag.copy && p.src === 'ladder';
  const verb = p.src === 'palette' ? '' : copy ? 'kopyala: ' : 'taşı: ';
  switch (s.t) {
    case 'c':
      if (s.ctx === 'pre') return verb + 'bu çıkışın dalına';
      if (s.ctx === 'branch') return verb + 'paralel dalın içine seri';
      return verb + (s.index === 0 ? 'satır başına seri' : s.index === s.series.length ? 'satır sonuna seri' : 'araya seri');
    case 'p': return verb + 'altına paralel (OR)';
    case 'o': return verb + 'alta çıkış ekle';
    case 'r': return verb + (s.index >= prog.rungs.length ? 'yeni satır (en alta)' : 'buraya yeni satır');
  }
  return '';
}

const svgPt = (cx, cy) => {
  const r = $('#ladder').getBoundingClientRect();
  return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
};

function nearestSlot(px, py) {
  let best = null, bd = SNAP / zoom;
  for (const s of drag.valid) {
    let d;
    if (s.t === 'r') {
      if (px < s.x0 - 30 || px > s.x1 + 30) continue;
      d = Math.abs(py - s.y) * 1.6 + 4; // satır aralığı: yatayda her yer geçerli, dikeyde sıkı
    } else d = Math.hypot(px - s.x, py - s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function drawSlotLayer() {
  const svg = $('#ladder');
  let layer = svg.querySelector('#slotLayer');
  if (!layer) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.id = 'slotLayer';
    svg.appendChild(layer);
  }
  let h = '';
  for (const s of drag.valid) {
    if (s === drag.hot) continue;
    if (s.t === 'r') h += `<rect class="slot" x="${s.x0 + 12}" y="${s.y - 1}" width="${s.x1 - s.x0 - 24}" height="2" rx="1"/>`;
    else h += `<circle class="slot" cx="${s.x}" cy="${s.y}" r="4.5"/>`;
  }
  const s = drag.hot;
  if (s) {
    if (s.t === 'c') h += `<rect class="hotbar" x="${s.x - 2}" y="${s.y - 20}" width="4" height="40" rx="2"/>`;
    else if (s.t === 'p') h += `<rect class="hotbar" x="${s.x - 34}" y="${s.y - 2}" width="68" height="4" rx="2"/>`;
    else if (s.t === 'o') h += `<rect class="hotbar" x="${s.x - 80}" y="${s.y - 2}" width="160" height="4" rx="2"/>`;
    else h += `<rect class="hotbar" x="${s.x0 + 6}" y="${s.y - 2}" width="${s.x1 - s.x0 - 12}" height="4" rx="2"/>`;
    const cx = s.t === 'r' ? s.x0 + 30 : s.x, cy = s.y;
    h += `<circle class="hotring" cx="${cx}" cy="${cy}" r="10"/><path class="hotplus" d="M${cx - 5} ${cy}h10M${cx} ${cy - 5}v10"/>`;
    const txt = slotLabel(s, drag.payload);
    const w = txt.length * 6.6 + 16;
    const lx = cx + 14, ly = cy - 30;
    h += `<g class="hotlbl"><rect x="${lx}" y="${ly}" width="${w}" height="20" rx="6"/><text x="${lx + 8}" y="${ly + 14}">${esc(txt)}</text></g>`;
  }
  layer.innerHTML = h;
}

function onDragMove(e) {
  if (!drag) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < DRAG_START) return;
    startDrag();
    if (!drag) return;
  }
  drag.copy = e.ctrlKey;
  updateDragTarget();
}

function updateDragTarget() {
  const g = $('#dragGhost');
  g.style.transform = `translate(${drag.x + 14}px, ${drag.y + 14}px)`;
  const pal = $('#palette').getBoundingClientRect();
  drag.overTrash = drag.payload.src === 'ladder' && drag.x >= pal.left && drag.x <= pal.right && drag.y >= pal.top && drag.y <= pal.bottom;
  $('#palette').classList.toggle('hot', drag.overTrash);
  const wrap = $('#ladderWrap').getBoundingClientRect();
  const inLadder = drag.x >= wrap.left && drag.x <= wrap.right && drag.y >= wrap.top && drag.y <= wrap.bottom;
  const pt = svgPt(drag.x, drag.y);
  const hot = !drag.overTrash && inLadder ? nearestSlot(pt.x, pt.y) : null;
  const changed = hot !== drag.hot;
  drag.hot = hot;
  const txt = $('#ghostTxt');
  g.classList.toggle('del', drag.overTrash);
  g.classList.toggle('nodrop', !hot && !drag.overTrash);
  // nokta yakalanınca etiket ladder'da yazar; kutuda yalnızca sembol kalsın (üst üste binmesin)
  txt.textContent = drag.overTrash ? 'Bırak: sil' : hot ? '' : drag.payload.name + (inLadder ? ' — mavi bir noktaya yaklaştır' : '');
  txt.style.display = txt.textContent ? '' : 'none';
  if (changed || drag.lastCopy !== drag.copy) drawSlotLayer();
  drag.lastCopy = drag.copy;
}

// Ladder kenarına yaklaşınca otomatik kaydır
function autoScroll() {
  if (!drag || !drag.started) return;
  const w = $('#ladderWrap'), r = w.getBoundingClientRect();
  const edge = 44;
  let dy = 0, dx = 0;
  if (drag.x > r.left && drag.x < r.right) {
    if (drag.y < r.top + edge && drag.y > r.top - 30) dy = -Math.ceil((r.top + edge - drag.y) / 4);
    else if (drag.y > r.bottom - edge && drag.y < r.bottom + 30) dy = Math.ceil((drag.y - (r.bottom - edge)) / 4);
  }
  if (drag.y > r.top && drag.y < r.bottom) {
    if (drag.x > r.right - edge && drag.x < r.right + 30) dx = Math.ceil((drag.x - (r.right - edge)) / 4);
    else if (drag.x < r.left + edge && drag.x > r.left - 10) dx = -Math.ceil((r.left + edge - drag.x) / 4);
  }
  if (dy || dx) {
    w.scrollTop += dy;
    w.scrollLeft += dx;
    updateDragTarget();
  }
  drag.raf = requestAnimationFrame(autoScroll);
}

function endDragUI() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', cancelDrag);
  document.body.classList.remove('dragging');
  $('#dragGhost').style.display = 'none';
  $('#palette').classList.remove('trash', 'hot');
  const layer = $('#ladder').querySelector('#slotLayer');
  if (layer) layer.remove();
  document.querySelectorAll('#ladder .dragsrc').forEach((h) => h.classList.remove('dragsrc'));
  if (drag && drag.raf) cancelAnimationFrame(drag.raf);
}
function cancelDrag() {
  if (drag && drag.started) suppressClick = true;
  endDragUI();
  drag = null;
}
function onDragUp(e) {
  if (!drag) return;
  const d = drag;
  if (!d.started) { endDragUI(); drag = null; return; } // sadece tıklama: normal click işler
  suppressClick = true;
  d.copy = e.ctrlKey;
  endDragUI();
  drag = null;
  if (d.overTrash && d.payload.src === 'ladder') {
    const info = locate(d.payload.id);
    if (info) {
      selId = d.payload.id;
      doAction(info.kind === 'contact' ? 'del' : 'delOut');
      toast('Silindi — geri almak için Ctrl+Z');
    }
    return;
  }
  if (!d.hot) {
    if (d.payload.src === 'palette') toast('Bırakma noktası yoktu — parçayı mavi noktalardan birine yaklaştır');
    return;
  }
  performDrop(d.payload, d.hot, d.copy);
}

// Bırakmayı uygula. Önce yeni düğüm yerine konur, sonra (taşımada) eskisi silinir:
// böylece nokta referansları silme yüzünden kaymaz.
function performDrop(p, s, copy) {
  if (eraser) toggleEraser(false);
  let node;
  const moving = p.src === 'ladder' && !copy;
  if (p.src === 'palette') node = p.g === 'c' ? contact(p.k, 'X0') : output([], makeCoil(p.k));
  else {
    const info = locate(p.id);
    if (!info) return;
    if (info.kind === 'contact') node = contact(info.node.kind, info.node.op);
    else {
      if (moving && info.r.outputs.length === 1) {
        toast('Satırın tek çıkışı taşınamaz — Ctrl basılı bırakıp kopyala ya da önce başka çıkış ekle', true);
        return;
      }
      node = output(PLC.cloneSeries(info.o.pre), { ...info.o.coil });
    }
  }
  switch (s.t) {
    case 'c': s.series.splice(s.index, 0, node); break;
    case 'p': {
      const info = locate(s.id);
      if (!info) return;
      if (info.parent && info.series.length === 1) info.parent.par.branches.push([node]);
      else info.series[info.index] = par([[info.node], [node]]);
      break;
    }
    case 'o': s.rung.outputs.splice(s.index, 0, node); break;
    case 'r':
      prog.rungs.splice(s.index, 0, p.g === 'c' ? rung([node], [output([], makeCoil('OUT'))]) : rung([contact('NO', 'X0')], [node]));
      break;
  }
  if (moving) {
    const old = locate(p.id);
    if (old && old.kind === 'contact') removeContact(old);
    else if (old && old.kind === 'output') old.r.outputs.splice(old.oi, 1);
  }
  selId = node.id;
  commit();
  if (p.src === 'palette') focusOp();
  else toast(moving ? 'Taşındı' : 'Kopyalandı');
}

// ------------------------------------------------------------------ program yükleme
function loadIL(text, quiet) {
  const r = parseIL(text);
  const hard = r.errors.filter((e) => !e.warn);
  $('#ilErrors').innerHTML = r.errors
    .map((e) => `<div class="${e.warn ? 'wn' : 'e'}">IL satır ${e.line}: ${esc(e.msg)}</div>`)
    .join('');
  if (hard.length && !quiet) {
    $('#ilErrors').insertAdjacentHTML('afterbegin', '<div class="e"><b>Devre kurulamadı — önce hataları düzelt:</b></div>');
    return false;
  }
  prog = r.prog;
  selId = null;
  stop();
  commit();
  return true;
}

function stop() {
  mode = 'stop';
  sim.reset();
  clearPulses();
  updateView();
}
// STOP'tan çalışmaya geçiş: PLC sıfırdan başlar; STOP'tayken yapılan basışlar sayılmaz (gerçek PLC gibi)
function startFromStop() {
  sim.reset();
  clearPulses();
}

// ------------------------------------------------------------------ çalışma döngüsü
// Simülasyon zamanı ekran karelerinden (requestAnimationFrame) bağımsız ilerler: tarayıcı kareleri
// seyrek çizse de (arka plan sekmesi, küçültülmüş ya da gömülü pencere) geçen gerçek süre kadar
// taranır. Ekran yalnızca requestAnimationFrame'de, durum değiştiyse yenilenir.
const MAX_CATCHUP_MS = 60000; // uzun uyku/askıdan dönüşte en çok 60 s yetiştir (sonrası "duraklamış" sayılır)
const MAX_SCANS_PER_TICK = 8000;
let last = performance.now();
let viewDirty = false;
function scanOnce(dt) {
  for (const x of XS) sim.bits[x] = !!inputs[x] || !!pulse[x];
  sim.runScan(prog, dt);
  clearPulses();
}
function simTick(now) {
  if (now === undefined) now = performance.now();
  const real = Math.min(Math.max(0, now - last), MAX_CATCHUP_MS);
  last = now;
  if (mode !== 'run') return;
  const total = real * speed;
  if (total <= 0) return;
  // ~10 ms'lik taramalar; çok uzun aralıkta tarama sayısı sınırlanır, her tarama biraz uzar
  const n = Math.max(1, Math.min(MAX_SCANS_PER_TICK, Math.ceil(total / 10)));
  for (let i = 0; i < n; i++) scanOnce(total / n);
  viewDirty = true;
}
function loop() {
  simTick();
  if (viewDirty) {
    viewDirty = false;
    updateView();
  }
  requestAnimationFrame(loop);
}
// requestAnimationFrame seyrekleştiğinde de zaman aksın diye ayrıca zamanlayıcıyla sür
setInterval(() => simTick(), 16);

// ------------------------------------------------------------------ uygulama içi diyaloglar
// Tarayıcının prompt()/confirm()/alert() pencereleri gömülü tarayıcılarda (ör. Claude uygulaması)
// desteklenmez ya da sessizce null döner; bu yüzden hepsi bu Promise tabanlı pencereden geçer.
// Testler window.__dlgAuto = ({ title, input, text }) => yanıt ile pencereyi atlayabilir.
let dlgFinish = null;
function openDialog(o) {
  if (typeof window.__dlgAuto === 'function') return Promise.resolve(window.__dlgAuto(o));
  if (dlgFinish) dlgFinish(undefined); // önceki pencere açık kaldıysa kapat
  const hasInput = o.input != null;
  const hasText = o.text != null;
  const cancelValue = hasInput || hasText ? null : false;
  return new Promise((resolve) => {
    const d = $('#dlg'), inp = $('#dlgInput'), ta = $('#dlgText'), ok = $('#dlgOk'), cancel = $('#dlgCancel');
    const prevFocus = document.activeElement;
    $('#dlgTitle').textContent = o.title || '';
    $('#dlgMsg').textContent = o.msg || '';
    $('#dlgMsg').style.display = o.msg ? '' : 'none';
    inp.style.display = hasInput ? '' : 'none';
    inp.value = hasInput ? o.input : '';
    ta.style.display = hasText ? '' : 'none';
    ta.value = hasText ? o.text : '';
    ta.readOnly = !!o.readOnly;
    ta.placeholder = o.placeholder || '';
    d.classList.toggle('wide', hasText);
    ok.textContent = o.okText || 'Tamam';
    ok.classList.toggle('primary', !o.danger);
    ok.classList.toggle('danger-solid', !!o.danger);
    cancel.textContent = o.cancelText || 'Vazgeç';
    d.classList.add('show');
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(cancelValue); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); ok.click(); }
      else if (e.key === 'Tab') {
        // odak pencerenin içinde dolaşsın
        const f = [...d.querySelectorAll('input, textarea, button')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    function finish(v) {
      d.classList.remove('show');
      window.removeEventListener('keydown', onKey, true);
      dlgFinish = null;
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* önemsiz */ }
      resolve(v);
    }
    dlgFinish = finish;
    window.addEventListener('keydown', onKey, true);
    ok.onclick = () => finish(hasInput ? inp.value : hasText ? ta.value : true);
    cancel.onclick = () => finish(cancelValue);
    d.onclick = (e) => { if (e.target === d) finish(cancelValue); };
    setTimeout(() => {
      if (hasInput) { inp.focus(); inp.select(); }
      else if (hasText) { ta.focus(); if (o.readOnly) ta.select(); }
      else ok.focus();
    }, 0);
  });
}
// Metin sorar; boş ya da vazgeçilirse null
async function askText(title, def, msg) {
  const v = await openDialog({ title, msg, input: def || '', okText: 'Tamam' });
  return v == null || !String(v).trim() ? null : String(v).trim();
}
const askConfirm = (title, msg, o) => openDialog(Object.assign({ title, msg, okText: 'Evet' }, o || {})).then((v) => v === true);
// Metni gösterir; "Kopyala" panoya kopyalar (pano API'si engelliyse metin seçili kalır, Ctrl+C ile alınır)
async function showText(title, text, msg) {
  const v = await openDialog({ title, msg: msg || 'İndirme çalışmıyorsa bu metni kopyalayıp bir dosyaya yapıştırabilirsin.', text, readOnly: true, okText: 'Kopyala', cancelText: 'Kapat' });
  if (v == null) return;
  if (await copyText(text)) toast('Panoya kopyalandı');
  else {
    toast('Pano erişimi engelli — metni seçip Ctrl+C ile kopyala', true);
    showText(title, text, 'Pano erişimi engelli: metin seçili, Ctrl+C ile kopyala.');
  }
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* aşağıdaki yönteme düş */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------------ sekmeler
// Her sekme ayrı bir devredir. Sekmeler tarayıcıda (localStorage) otomatik saklanır,
// tarayıcı kapanıp açılınca aynen geri gelir.
const TABS_KEY = 'deltaPlcSim.tabs';
const LIB_KEY = 'deltaPlcSim.library';
let tabs = [];
let activeTab = 0;
let tabSeq = 1;

const newTabObj = (name, il, savedAs) => ({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, il, base: il, savedAs: savedAs || null });
const isDirty = (t) => t.il !== t.base;

function syncTab(il) {
  const t = tabs[activeTab];
  if (!t) return;
  t.il = il;
  persistTabs();
  renderTabs();
}
function persistTabs() {
  try {
    // geri al geçmişi yalnızca bellekte tutulur
    store.set(TABS_KEY, JSON.stringify({ tabs, active: activeTab, seq: tabSeq }, (k, v) => (k === 'undo' || k === 'redo' ? undefined : v)));
  } catch (e) {
    toast('Tarayıcı belleğine yazılamadı: ' + e.message, true);
  }
}
function renderTabs() {
  const bar = $('#tabs');
  bar.innerHTML =
    tabs
      .map(
        (t, i) => `<div class="tab${i === activeTab ? ' active' : ''}" data-tab="${i}" title="${esc(t.savedAs ? 'Kayıt: ' + t.savedAs : 'Kaydedilmemiş')} — çift tık: yeniden adlandır">
          <span class="tname">${esc(t.name)}</span>${isDirty(t) || !t.savedAs ? `<span class="tdot" title="${t.savedAs ? 'Kaydedilmemiş değişiklik var' : 'Henüz kayıtlara eklenmedi'}"></span>` : ''}
          <button class="tclose" title="Sekmeyi kapat" aria-label="Sekmeyi kapat"><svg class="ico" style="width:13px;height:13px"><use href="#i-x"/></svg></button></div>`
      )
      .join('') + `<button id="tabAdd" title="Yeni sekme" aria-label="Yeni sekme"><svg class="ico"><use href="#i-plus"/></svg></button>`;
  bar.querySelectorAll('.tab').forEach((el) => {
    const i = +el.dataset.tab;
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); closeTab(i); }
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tclose')) closeTab(i);
      else switchTab(i);
    });
    el.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.tclose')) renameTab(i);
    });
  });
  $('#tabAdd').onclick = () => newBlankTab();
}
function loadTabProgram() {
  const t = tabs[activeTab];
  const r = parseIL(t.il);
  $('#ilErrors').innerHTML = r.errors.map((e) => `<div class="${e.warn ? 'wn' : 'e'}">IL satır ${e.line}: ${esc(e.msg)}</div>`).join('');
  prog = r.prog;
  selId = null;
  toggleEraser(false);
  stop();
  const wasDirty = isDirty(t);
  restoring = true;
  commit(); // IL'yi normalleştirir (geri al geçmişine yazılmaz)
  restoring = false;
  if (!wasDirty) t.base = t.il; // yalnızca biçim farkı yüzünden "değişti" görünmesin
  persistTabs();
  renderTabs();
  $('#ladderWrap').scrollTop = 0;
}
function switchTab(i) {
  if (i === activeTab || !tabs[i]) return;
  activeTab = i;
  loadTabProgram();
}
function openInNewTab(name, il, savedAs) {
  const t = newTabObj(name, il, savedAs);
  tabs.push(t);
  activeTab = tabs.length - 1;
  loadTabProgram();
  t.base = t.il;
  persistTabs();
  renderTabs();
}
function newBlankTab() {
  const il = toIL({ rungs: [newRung()], labels: {} });
  openInNewTab('Yeni devre ' + tabSeq++, il);
}
async function closeTab(i) {
  const t = tabs[i];
  if (!t) return;
  if (isDirty(t) || (!t.savedAs && t.il.split('\n').length > 4)) {
    const ok = await askConfirm('Sekme kapatılsın mı?', `"${t.name}" kaydedilmedi; kapatırsan değişiklikler kaybolur.\nSaklamak için Vazgeç'e bas, sonra Kaydet (Ctrl+S).`, { okText: 'Kaydetmeden kapat', danger: true });
    if (!ok) return;
  }
  i = tabs.indexOf(t); // pencere açıkken sekme sırası değişmiş olabilir
  if (i < 0) return;
  tabs.splice(i, 1);
  if (tabs.length === 0) {
    newBlankTab();
    return;
  }
  if (i < activeTab) { activeTab--; renderTabs(); persistTabs(); }
  else if (i === activeTab) { activeTab = Math.min(i, tabs.length - 1); loadTabProgram(); }
  else { renderTabs(); persistTabs(); }
}
async function renameTab(i) {
  const t = tabs[i];
  if (!t) return;
  const n = await askText('Sekmeyi yeniden adlandır', t.name);
  if (!n) return;
  t.name = n;
  persistTabs();
  renderTabs();
}

// ------------------------------------------------------------------ kayıtlar (program içi kütüphane)
function lib() {
  try { return JSON.parse(store.get(LIB_KEY)) || {}; } catch (e) { return {}; }
}
function setLib(L) {
  store.set(LIB_KEY, JSON.stringify(L));
}
async function saveCurrent(asNew) {
  const t = tabs[activeTab];
  let name = t.savedAs;
  if (!name || asNew) {
    name = await askText(asNew ? 'Farklı kaydet' : 'Kaydet', asNew && t.savedAs ? t.savedAs + ' kopya' : t.name, 'Kayıt adı:');
    if (!name) return;
    if (lib()[name] && name !== t.savedAs && !(await askConfirm('Üzerine yazılsın mı?', `"${name}" adında bir kayıt zaten var.`, { okText: 'Üzerine yaz', danger: true }))) return;
  }
  if (tabs[activeTab] !== t) return; // pencere açıkken sekme değiştiyse yanlış devreyi kaydetme
  const L = lib();
  L[name] = { il: toIL(prog), savedAt: Date.now() };
  setLib(L);
  t.savedAs = name;
  t.name = name;
  t.base = t.il;
  persistTabs();
  renderTabs();
  if ($('#lib').classList.contains('show')) renderLib();
  toast(store.ok ? 'Kaydedildi: ' + name : 'Kaydedildi (yalnızca bu oturumda): ' + name, !store.ok);
}
function downloadText(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fileSafe = (s) => s.replace(/[\\/:*?"<>|]+/g, '_');
function renderLib() {
  const L = lib();
  const names = Object.keys(L).sort((a, b) => L[b].savedAt - L[a].savedAt);
  const t = tabs[activeTab];
  $('#libCur').textContent = t.savedAs ? `Bu sekme "${t.savedAs}" kaydına bağlı.` : 'Bu sekme henüz kaydedilmedi.';
  $('#libList').innerHTML = names.length
    ? names
        .map((n) => {
          const rungs = parseIL(L[n].il).prog.rungs.length;
          const open = tabs.some((x) => x.savedAs === n);
          return `<tr><td><b>${esc(n)}</b>${open ? ' <span class="badge">açık</span>' : ''}</td>
            <td class="muted">${new Date(L[n].savedAt).toLocaleString('tr-TR')}</td>
            <td class="muted">${rungs} satır</td>
            <td class="acts"><button data-lopen="${esc(n)}">Aç</button><button data-lren="${esc(n)}">Ad değiştir</button><button data-ldl="${esc(n)}">.txt</button><button data-lshow="${esc(n)}" title="Metni göster / kopyala">Metin</button><button data-ldel="${esc(n)}" class="danger">Sil</button></td></tr>`;
        })
        .join('')
    : '<tr><td class="muted" colspan="4">Henüz kayıt yok. Bir devre kurup 💾 Kaydet\'e bas (Ctrl+S).</td></tr>';
  const q = (sel, fn) => $('#libList').querySelectorAll(sel).forEach((b) => (b.onclick = () => fn(b.dataset[Object.keys(b.dataset)[0]])));
  q('[data-lopen]', (n) => {
    const i = tabs.findIndex((x) => x.savedAs === n);
    if (i >= 0) switchTab(i);
    else openInNewTab(n, lib()[n].il, n);
    $('#lib').classList.remove('show');
  });
  q('[data-lren]', async (n) => {
    const nn = await askText('Kaydı yeniden adlandır', n, 'Yeni ad:');
    if (!nn || nn === n) return;
    if (lib()[nn] && !(await askConfirm('Üzerine yazılsın mı?', `"${nn}" adında bir kayıt zaten var.`, { okText: 'Üzerine yaz', danger: true }))) return;
    const L2 = lib();
    if (!L2[n]) return;
    L2[nn] = L2[n];
    delete L2[n];
    setLib(L2);
    tabs.forEach((x) => { if (x.savedAs === n) { x.savedAs = nn; x.name = nn; } });
    persistTabs(); renderTabs(); renderLib();
  });
  q('[data-ldl]', (n) => downloadText(fileSafe(n) + '.txt', lib()[n].il.replace(/\n/g, '\r\n')));
  q('[data-lshow]', (n) => showText(n, lib()[n].il));
  q('[data-ldel]', async (n) => {
    if (!(await askConfirm('Kayıt silinsin mi?', `"${n}" kaydı silinecek. Açık sekme kapanmaz.`, { okText: 'Sil', danger: true }))) return;
    const L2 = lib();
    delete L2[n];
    setLib(L2);
    tabs.forEach((x) => { if (x.savedAs === n) x.savedAs = null; });
    persistTabs(); renderTabs(); renderLib();
  });
}
function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast('Yedek okunamadı: geçerli bir .json yedeği değil', true); return; }
  const src = (data && data.library) || data || {};
  const L = lib();
  let n = 0;
  for (const k in src) {
    if (!src[k] || typeof src[k].il !== 'string') continue;
    let name = k, j = 2;
    while (L[name] && L[name].il !== src[k].il) name = `${k} (${j++})`;
    L[name] = { il: src[k].il, savedAt: src[k].savedAt || Date.now() };
    n++;
  }
  setLib(L);
  renderLib();
  toast(`${n} kayıt içe aktarıldı`);
}
let toastTimer = null;
function toast(msg, bad) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 2200);
}
function restoreTabs() {
  try {
    const s = JSON.parse(store.get(TABS_KEY));
    if (s && Array.isArray(s.tabs) && s.tabs.length) {
      tabs = s.tabs;
      activeTab = Math.min(s.active || 0, tabs.length - 1);
      tabSeq = s.seq || tabs.length + 1;
      loadTabProgram();
      return;
    }
  } catch (e) { /* bozuk kayıt: sıfırdan başla */ }
  // eski sürümden kalan tek devre varsa onu ilk sekme yap
  const old = store.get(STORE);
  if (old) {
    openInNewTab('Devre 1', old);
    store.remove(STORE);
  } else openInNewTab(PLC_EXAMPLES[0].name, PLC_EXAMPLES[0].il);
}

// ------------------------------------------------------------------ olaylar
function init() {
  buildIO();
  const sel = $('#examples');
  PLC_EXAMPLES.forEach((e, i) => sel.insertAdjacentHTML('beforeend', `<option value="${i}">${esc(e.name)}</option>`));
  sel.onchange = () => {
    if (sel.value === '') return;
    const ex = PLC_EXAMPLES[+sel.value];
    openInNewTab(ex.name, ex.il);
    sel.value = '';
  };
  $('#bRun').onclick = () => { if (mode === 'stop') startFromStop(); last = performance.now(); mode = 'run'; updateView(); };
  $('#bPause').onclick = () => {
    if (mode === 'run') { simTick(); mode = 'pause'; }
    else if (mode === 'pause') { last = performance.now(); mode = 'run'; }
    updateView();
  };
  $('#bStep').onclick = () => {
    if (mode === 'stop') startFromStop();
    mode = 'pause';
    scanOnce(100);
    updateView();
  };
  $('#bStop').onclick = stop;
  $('#speed').onchange = (e) => (speed = parseFloat(e.target.value));
  $('#bNew').onclick = () => newBlankTab();
  $('#bSave').onclick = () => saveCurrent(false);
  $('#bLib').onclick = () => { renderLib(); $('#lib').classList.add('show'); };
  $('#libSaveAs').onclick = () => saveCurrent(true);
  $('#libSave').onclick = () => saveCurrent(false);
  $('#libTxt').onclick = () => downloadText(fileSafe(tabs[activeTab].name) + '.txt', toIL(prog).replace(/\n/g, '\r\n'));
  const backupJson = () => JSON.stringify({ app: 'delta-plc-sim', library: lib() }, null, 2);
  $('#libExport').onclick = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadText(`plc-kayitlar-${stamp}.json`, backupJson(), 'application/json');
  };
  // İndirmenin engellendiği tarayıcılar için: metni göster / yapıştırarak yükle
  $('#libShow').onclick = () => showText(tabs[activeTab].name, toIL(prog));
  $('#libExportText').onclick = () => showText('Yedek (tüm kayıtlar)', backupJson(), 'Bu metni bir .json dosyasına yapıştırıp saklayabilir, sonra "Metin yapıştırarak yükle" ile geri alabilirsin.');
  $('#libPaste').onclick = async () => {
    const t = await openDialog({ title: 'Metin yapıştırarak yükle', msg: 'IL komut listesi (LD X0 …) yeni sekmede açılır; .json yedek metni kayıtlara eklenir.', text: '', placeholder: 'LD X0\nOUT Y0\nEND', okText: 'Yükle' });
    if (!t || !t.trim()) return;
    if (t.trim()[0] === '{') importBackup(t);
    else {
      openInNewTab('Yapıştırılan devre', t);
      $('#lib').classList.remove('show');
    }
  };
  $('#libImport').onclick = () => $('#fileJson').click();
  $('#fileJson').onchange = async (e) => {
    const f = e.target.files[0];
    if (f) importBackup(await f.text());
    e.target.value = '';
  };
  const openFile = async (f) => {
    const text = await f.text();
    if (/\.json$/i.test(f.name)) { importBackup(text); renderLib(); $('#lib').classList.add('show'); return; }
    openInNewTab(f.name.replace(/\.[^.]+$/, ''), text);
  };
  $('#bOpen').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => {
    const f = e.target.files[0];
    if (f) openFile(f);
    e.target.value = '';
  };
  $('#bHelp').onclick = () => $('#help').classList.add('show');
  // pencereler: arka plana ya da "Kapat"a tıklayınca kapan
  // (#dlg kendi kapanışını yönetir; burada kapatılırsa bekleyen soru yanıtsız kalır)
  document.querySelectorAll('.modal:not(#dlg)').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('show'); });
  });
  $('#storeWarnClose').onclick = () => $('#storeWarn').classList.remove('show');
  $('#ilApply').onclick = () => loadIL($('#il').value);

  // tema
  const setThemeIcon = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#bTheme use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    $('#bTheme').title = dark ? 'Açık temaya geç' : 'Koyu temaya geç';
  };
  setThemeIcon();
  $('#bTheme').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    store.set('deltaPlcSim.theme', t);
    setThemeIcon();
  };

  // yakınlaştırma
  const setZoom = (z, keepPt) => {
    const w = $('#ladderWrap');
    const old = zoom;
    zoom = Math.round(Math.min(2, Math.max(0.5, z)) * 10) / 10;
    if (zoom === old) return;
    store.set('deltaPlcSim.zoom', zoom);
    // imlecin altındaki nokta yerinde kalsın
    const r = w.getBoundingClientRect();
    const ax = keepPt ? keepPt.x - r.left : r.width / 2, ay = keepPt ? keepPt.y - r.top : r.height / 2;
    const sx = (w.scrollLeft + ax) / old, sy = (w.scrollTop + ay) / old;
    render();
    w.scrollLeft = sx * zoom - ax;
    w.scrollTop = sy * zoom - ay;
  };
  $('#zIn').onclick = () => setZoom(zoom + 0.1);
  $('#zOut').onclick = () => setZoom(zoom - 0.1);
  $('#zVal').onclick = () => setZoom(1);
  $('#ladderWrap').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1), { x: e.clientX, y: e.clientY });
  }, { passive: false });

  // geri al / yinele
  $('#bUndo').onclick = undo;
  $('#bRedo').onclick = redo;

  // sürükleme sonrası oluşan "hayalet" tıklamayı yut
  document.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);

  // ladder'daki parçayı sürükleyerek taşı
  $('#ladder').addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || eraser) return;
    const h = e.target.closest('.hit');
    if (!h) return;
    beginPointer(e, { src: 'ladder', id: h.dataset.sel });
  });

  $('#ladder').addEventListener('click', (e) => {
    if (e.target.closest('#addRung')) {
      const r = newRung();
      prog.rungs.push(r);
      selId = r.input[0].id;
      commit();
      return;
    }
    const t = e.target.closest('[data-sel]');
    if (eraser) {
      // Silgi: kontak/bobine tıkla -> sil; satır numarasına tıkla -> satırı sil
      if (!t || t.classList.contains('rungbg')) return;
      selId = t.dataset.sel;
      const info = locate(selId);
      if (info) doAction({ contact: 'del', output: 'delOut', rung: 'rDel' }[info.kind]);
      return;
    }
    select(t ? t.dataset.sel : null);
  });
  $('#ladder').addEventListener('dblclick', (e) => {
    // çift tık: adres kutusuna odaklan
    if (e.target.closest('.hit')) focusOp();
  });
  buildPalette();

  // klavye
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' && drag) { cancelDrag(); toast('Sürükleme iptal edildi'); return; }
    if (drag && drag.started && e.key === 'Control') { drag.copy = true; updateDragTarget(); }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveCurrent(e.shiftKey); return; }
    if (e.altKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); switchTab(+e.key - 1); return; }
    if (e.key === 'F1') { e.preventDefault(); $('#help').classList.add('show'); return; }
    if (e.key === 'F5') { e.preventDefault(); $('#bRun').click(); return; }
    if (typing()) return;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); if (selId) doAction('dup'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-7]$/.test(e.key)) { if (!e.repeat) setInput('X' + e.key, !inputs['X' + e.key] || document.querySelector('input[name=xmode]:checked').value === 'push'); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
      e.preventDefault();
      const info = locate(selId);
      if (info) doAction({ contact: 'del', output: 'delOut', rung: 'rDel' }[info.kind]);
    } else if (e.key === ' ') { e.preventDefault(); if (mode === 'stop') $('#bRun').click(); else $('#bPause').click(); }
    else if (k === 'n') $('#bStep').click();
    else if (e.key === 'Escape') { toggleEraser(false); select(null); document.querySelectorAll('.modal').forEach((m) => m.classList.remove('show')); }
  });
  document.addEventListener('keyup', (e) => {
    if (drag && drag.started && e.key === 'Control') { drag.copy = false; updateDragTarget(); }
    if (typing()) return;
    const x = 'X' + e.key;
    if (/^[0-7]$/.test(e.key) && document.querySelector('input[name=xmode]:checked').value === 'push' && !locked[x]) setInput(x, false);
  });

  // sürükle-bırak
  let dragN = 0;
  const isFile = (e) => [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragenter', (e) => { if (!isFile(e)) return; e.preventDefault(); dragN++; $('#dropHint').style.display = 'flex'; });
  document.addEventListener('dragleave', (e) => { if (!isFile(e)) return; if (--dragN <= 0) { dragN = 0; $('#dropHint').style.display = 'none'; } });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragN = 0;
    $('#dropHint').style.display = 'none';
    for (const f of e.dataTransfer.files) await openFile(f);
  });

  restoreTabs();
  if (!store.ok) {
    storageFailed();
    $('#libNote').textContent = 'Bu tarayıcı kayıtları kalıcı saklamıyor: kayıtlar yalnızca bu sayfa açıkken durur. Saklamak için "Yedeği metin olarak göster" ile kopyala ya da normal bir tarayıcı penceresinde aç.';
  }
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ bağlantıyla devre açma
// <site>#il=<base64url IL>&ad=<sekme adı>&run=1   ya da   #ornek=4
// (CLI: "npm run plc -- link dosya.txt" bu bağlantıyı üretir; kodlama src/core/share.ts ile aynı)
function decodeShare(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function openFromHash() {
  const h = location.hash.replace(/^#/, '');
  if (!/(^|&)(il|ornek)=/.test(h)) return;
  const p = new URLSearchParams(h);
  let il = null;
  let name = p.get('ad') || 'Bağlantıdan açılan';
  try {
    if (p.get('il')) il = decodeShare(p.get('il'));
    else {
      const ex = PLC_EXAMPLES[parseInt(p.get('ornek'), 10) - 1];
      if (ex) { il = ex.il; name = p.get('ad') || ex.name; }
    }
  } catch (e) {
    toast('Bağlantıdaki devre okunamadı', true);
  }
  // yenileyince aynı devre tekrar açılmasın
  history.replaceState(null, '', location.pathname + location.search);
  if (il == null) return;
  const norm = toIL(parseIL(il).prog);
  const same = tabs.findIndex((t) => t.il === norm);
  if (same >= 0) switchTab(same);
  else openInNewTab(name, il);
  if (p.get('run') === '1') $('#bRun').click();
  toast('Bağlantıdaki devre açıldı: ' + name);
}

// ------------------------------------------------------------------ dış API: PLC.app
// Arayüzü dışarıdan (tarayıcı konsolu, Playwright, ajanlar, testler) sürmek için tek giriş noktası.
// Sonuçlar ekrandaki metinden ayıklanmak yerine state() ile düz bir nesne olarak alınır.
//   PLC.app.load(il, ad)    yeni sekmede aç → { ok, errors | warnings, rungs }
//   PLC.app.press('X0', ms) belirlenimli bas-bırak (ms boyunca basılı, sonra bırakıp 1 tarama)
//   PLC.app.set('X1', 1)    girişi aç/kapat
//   PLC.app.advance(ms)     gerçek zamandan bağımsız ms kadar tara (duraklatılmış kipe geçer)
//   PLC.app.run() / pause() / stop()
//   PLC.app.state()         { mode, scan, t, X0: 1, Y0: 1, M0: 0, T0: '25/100', C0: '3/5', ... }
//   PLC.app.getIL()         açık devrenin komut listesi
PLC.app = {
  load(il, name) {
    const r = parseIL(String(il));
    const hard = r.errors.filter((e) => !e.warn);
    if (hard.length) return { ok: false, errors: hard };
    openInNewTab(name || 'Dışarıdan yüklenen', String(il));
    return { ok: true, warnings: r.errors.filter((e) => e.warn), rungs: prog.rungs.length };
  },
  getIL() {
    return toIL(prog);
  },
  run() {
    $('#bRun').click();
    return this.state();
  },
  pause() {
    if (mode === 'run') $('#bPause').click();
    return this.state();
  },
  stop() {
    stop();
    return this.state();
  },
  set(x, v) {
    x = String(x).toUpperCase();
    if (!XS.includes(x)) throw new Error(`Geçersiz giriş: ${x} (X0–X7, X10–X17)`);
    setInput(x, !!v);
    return this.state();
  },
  advance(ms) {
    if (mode === 'stop') startFromStop();
    else if (mode === 'run') simTick();
    mode = 'pause';
    let left = Math.max(0, Number(ms) || 0);
    if (!left) scanOnce(10);
    while (left > 0) {
      const dt = Math.min(10, left);
      scanOnce(dt);
      left -= dt;
    }
    updateView();
    return this.state();
  },
  press(x, ms) {
    this.set(x, 1);
    this.advance(ms == null ? 100 : ms);
    this.set(x, 0);
    return this.advance(10);
  },
  state() {
    const live = mode !== 'stop';
    const o = { mode, scan: sim.scan, t: Math.round(sim.timeMs) / 1000 };
    const u = usedDevices();
    const xs = new Set([...u.X, ...XS.filter((x) => inputs[x])]);
    const ys = new Set([...u.Y, ...YS.filter((y) => live && sim.bits[y])]);
    xs.forEach((x) => (o[x] = inputs[x] ? 1 : 0));
    ys.forEach((y) => (o[y] = live && sim.bits[y] ? 1 : 0));
    [...u.M, ...u.S].forEach((m) => (o[m] = live && sim.get(m) ? 1 : 0));
    u.T.forEach((t) => {
      const v = sim.T[t];
      o[t] = `${v ? v.cv : 0}/${v && v.sv != null ? v.sv : svOf(t)}`;
    });
    u.C.forEach((c) => {
      const v = sim.C[c];
      o[c] = `${v ? v.cv : 0}/${v && v.sv != null ? v.sv : svOf(c)}`;
    });
    return o;
  },
};

init();
window.PLC_APP_OK = true;
