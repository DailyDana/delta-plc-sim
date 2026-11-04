// Sürükle-bırak testi: gerçek pointer olaylarıyla (dispatchEvent) panodan ve ladder'dan sürükle.
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('t') || (location.pathname.includes('dark') ? 'dark' : 'light');
const res = [];
const ok = (c, m) => res.push((c ? 'GECTI ' : 'HATA  ') + m);
localStorage.clear();
tabs = []; activeTab = 0;
openInNewTab('drag', PLC_EXAMPLES[1].il); // mühürleme: (X0 | Y0) & !X1 -> Y0
const pe = (type, el, x, y, extra) => (el || document.elementFromPoint(x, y)).dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }, extra || {})));
const scr = (s) => { const r = $('#ladder').getBoundingClientRect(); return { x: r.left + s.x * zoom, y: r.top + s.y * zoom }; };
function dragTo(fromEl, fx, fy, slot, extra) {
  pe('pointerdown', fromEl, fx, fy);
  pe('pointermove', window, fx + 10, fy + 10, extra);
  const p = scr(slot);
  pe('pointermove', window, p.x + 2, p.y + 2, extra);
  const hot = drag && drag.hot;
  pe('pointerup', window, p.x + 2, p.y + 2, extra);
  return hot;
}
const partBtn = (k) => document.querySelector(`#palette [data-part="${PARTS.findIndex((p) => p.k === k)}"]`);
const btnPt = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

// 1) panodan kapalı kontağı satır başına sürükle
let r0 = prog.rungs[0];
let s = slots.find((x) => x.t === 'c' && x.series === r0.input && x.index === 0);
let [bx, by] = btnPt(partBtn('NC'));
let hot = dragTo(partBtn('NC'), bx, by, s);
ok(hot && hot.t === 'c', 'panodan sürüklerken nokta yakalandı');
ok(prog.rungs[0].input[0].t === 'c' && prog.rungs[0].input[0].kind === 'NC', 'kapalı kontak satır başına eklendi');
ok(tabs[0].undo.length === 1, 'geri al geçmişine yazıldı');

// 2) panodan TMR'yi Y0 altına
s = slots.find((x) => x.t === 'o');
[bx, by] = btnPt(partBtn('TMR'));
dragTo(partBtn('TMR'), bx, by, s);
ok(prog.rungs[0].outputs.length === 2 && prog.rungs[0].outputs[1].coil.type === 'TMR', 'TMR alta çıkış olarak eklendi');

// 3) panodan açık kontağı yeni satıra (en alt)
s = slots.find((x) => x.t === 'r' && x.index === prog.rungs.length);
[bx, by] = btnPt(partBtn('NO'));
dragTo(partBtn('NO'), bx, by, s);
ok(prog.rungs.length === 2, 'en alta yeni satır açıldı');

// 4) ladder'daki X1 kontağını ikinci satırın sonuna TAŞI
const x1 = (function find(sr) { for (const b of sr) { if (b.t === 'c' && b.op === 'X1') return b; if (b.t === 'p') for (const br of b.branches) { const f = find(br); if (f) return f; } } })(prog.rungs[0].input);
let hit = document.querySelector(`#ladder .hit[data-sel="${x1.id}"]`);
let [hx, hy] = btnPt(hit);
s = slots.find((x) => x.t === 'c' && x.series === prog.rungs[1].input && x.index === prog.rungs[1].input.length);
dragTo(hit, hx, hy, s);
const has = (sr, op) => JSON.stringify(sr).includes(`"op":"${op}"`);
ok(!has(prog.rungs[0].input, 'X1') && has(prog.rungs[1].input, 'X1'), 'X1 ikinci satıra taşındı');

// 5) Ctrl ile kopyala: ikinci satırdaki X1'i birinci satırın sonuna
const x1b = prog.rungs[1].input.find((b) => b.op === 'X1');
hit = document.querySelector(`#ladder .hit[data-sel="${x1b.id}"]`);
[hx, hy] = btnPt(hit);
s = slots.find((x) => x.t === 'c' && x.series === prog.rungs[0].input && x.index === prog.rungs[0].input.length);
dragTo(hit, hx, hy, s, { ctrlKey: true });
ok(has(prog.rungs[0].input, 'X1') && has(prog.rungs[1].input, 'X1'), 'Ctrl ile kopyalandı (iki yerde de var)');

// 6) panoya bırakınca sil
const before = JSON.stringify(prog.rungs[1].input).match(/"op"/g).length;
const x1c = prog.rungs[1].input.find((b) => b.op === 'X1');
hit = document.querySelector(`#ladder .hit[data-sel="${x1c.id}"]`);
[hx, hy] = btnPt(hit);
const pal = $('#palette').getBoundingClientRect();
pe('pointerdown', hit, hx, hy); pe('pointermove', window, hx + 20, hy); pe('pointermove', window, pal.left + 40, pal.top + 200);
ok(drag && drag.overTrash && $('#palette').classList.contains('trash'), 'panoya gelince silme bölgesi görünüyor');
pe('pointerup', window, pal.left + 40, pal.top + 200);
ok(JSON.stringify(prog.rungs[1].input).match(/"op"/g).length === before - 1, 'panoya bırakınca silindi');

// 7) tek çıkış taşınamaz uyarısı
const sole = prog.rungs[1].outputs[0];
hit = document.querySelector(`#ladder .hit[data-sel="${sole.id}"]`);
[hx, hy] = btnPt(hit);
s = slots.find((x) => x.t === 'o' && x.rung === prog.rungs[0]);
dragTo(hit, hx, hy, s);
ok(prog.rungs[1].outputs.length === 1, 'satırın tek çıkışı taşınmadı');

// 8) geri al / yinele
const ilNow = tabs[0].il;
undo(); ok(tabs[0].il !== ilNow, 'geri al çalıştı');
redo(); ok(tabs[0].il === ilNow, 'yinele çalıştı');

// 9) sürükleme sonrası tıklama yutuldu mu, Esc iptal
pe('pointerdown', partBtn('OUT'), bx, by); pe('pointermove', window, bx + 30, by + 30);
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
ok(drag === null && !document.body.classList.contains('dragging'), 'Esc sürüklemeyi iptal etti');

// 10) paralel: birinci satırın ilk kontağının altına açık kontak
const firstC = prog.rungs[0].input[0];
s = slots.find((x) => x.t === 'p' && x.id === firstC.id);
[bx, by] = btnPt(partBtn('NO'));
dragTo(partBtn('NO'), bx, by, s);
ok(prog.rungs[0].input[0].t === 'p', 'altına paralel dal açıldı');

// görsel için: sürükleme ortasında bırak (ekran görüntüsünde noktalar görünsün)
const sel = prog.rungs[0].outputs[0];
const h2 = document.querySelector(`#ladder .hit[data-sel="${sel.id}"]`);
[bx, by] = btnPt(partBtn('NC'));
pe('pointerdown', partBtn('NC'), bx, by); pe('pointermove', window, bx + 30, by);
const tgt = slots.find((x) => x.t === 'c' && x.series === prog.rungs[0].input && x.index === 1);
const tp = scr(tgt); pe('pointermove', window, tp.x + 6, tp.y + 8);
console.log('TESTOUT ' + res.join(' ;; '));
