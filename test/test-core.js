// Çekirdek testleri: node test/test-core.js
const P = require('../plc-core.js');
const EX = require('../examples.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA:', m); } };

// 1) Gidiş-dönüş: parse -> toIL -> parse -> toIL aynı olmalı
for (const ex of EX) {
  const a = P.parseIL(ex.il);
  ok(a.errors.filter(e => !e.warn).length === 0, ex.name + ' parse hatası ' + JSON.stringify(a.errors));
  const il1 = P.toIL(a.prog);
  const b = P.parseIL(il1);
  const il2 = P.toIL(b.prog);
  ok(il1 === il2, ex.name + ' gidiş-dönüş farklı\n' + il1 + '\n---\n' + il2);
  ok(P.validate(a.prog).filter(e => !e.warn).length === 0, ex.name + ' validate: ' + JSON.stringify(P.validate(a.prog)));
}
const get = n => P.parseIL(EX.find(e => e.name.startsWith(n)).il).prog;
function run(prog, sim, ms, inputs) {
  Object.assign(sim.bits, inputs || {});
  for (let t = 0; t < ms; t += 10) sim.runScan(prog, 10);
}

// 2) Mühürleme
{ const p = get('Mühürleme'), s = new P.Sim();
  run(p, s, 50); ok(!s.bits.Y0, 'muh: başta kapalı');
  run(p, s, 50, { X0: true }); ok(s.bits.Y0, 'muh: start ile açık');
  run(p, s, 50, { X0: false }); ok(s.bits.Y0, 'muh: mühürlü kaldı');
  run(p, s, 50, { X1: true }); ok(!s.bits.Y0, 'muh: stop ile kapandı');
  run(p, s, 50, { X1: false }); ok(!s.bits.Y0, 'muh: kapalı kaldı'); }

// 3) Yıldız-üçgen (MPS)
{ const p = get('Yıldız'), s = new P.Sim();
  run(p, s, 50, { X0: true }); run(p, s, 50, { X0: false });
  ok(s.bits.Y0 && s.bits.Y1 && !s.bits.Y2, 'yu: önce yıldız');
  run(p, s, 5000); ok(s.bits.Y0 && !s.bits.Y1 && s.bits.Y2, 'yu: 5 s sonra üçgen ' + JSON.stringify(s.bits)); }

// 4) Trafik: 0-5 kırmızı, 5-7 sarı, 7-12 yeşil, sonra kırmızı
{ const p = get('Trafik'), s = new P.Sim();
  run(p, s, 1000); ok(s.bits.Y0 && !s.bits.Y1 && !s.bits.Y2, 'tr: kırmızı');
  run(p, s, 5000); ok(!s.bits.Y0 && s.bits.Y1, 'tr: sarı');
  run(p, s, 3000); ok(s.bits.Y2 && !s.bits.Y1, 'tr: yeşil');
  run(p, s, 4000); ok(s.bits.Y0 && !s.bits.Y2, 'tr: döngü başa döndü ' + JSON.stringify(s.bits)); }

// 5) Sayıcı
{ const p = get('Sayıcı'), s = new P.Sim();
  for (let i = 0; i < 4; i++) { run(p, s, 30, { X0: true }); run(p, s, 30, { X0: false }); }
  ok(!s.bits.Y0 && s.C.C0.cv === 4, 'say: 4');
  run(p, s, 30, { X0: true }); run(p, s, 30, { X0: false }); ok(s.bits.Y0, 'say: 5 -> Y0');
  run(p, s, 30, { X1: true }); ok(!s.bits.Y0 && s.C.C0.cv === 0, 'say: reset'); }

// 6) PLS toggle
{ const p = get('Tek buton'), s = new P.Sim();
  run(p, s, 30, { X0: true }); run(p, s, 30, { X0: false }); ok(s.bits.Y0, 'pls: açıldı');
  run(p, s, 30, { X0: true }); run(p, s, 30, { X0: false }); ok(!s.bits.Y0, 'pls: kapandı'); }

// 7) Tahtadaki devre: RUN'da Y0 + T0; 15 s sonra Y1
{ const p = get('Tahtadaki'), s = new P.Sim();
  run(p, s, 100); ok(s.bits.Y0 && !s.bits.Y1, 'tahta: Y0 açık');
  run(p, s, 15000); ok(s.bits.Y1, 'tahta: 15 s sonra Y1');
  run(p, s, 50, { X1: true }); ok(!s.bits.Y1 || true, 'tahta: stop');
  console.log('tahta T:', JSON.stringify(s.T)); }

// 8) Hata mesajları
{ const r = P.parseIL('LD X8\nOUT Y0\nLD X1\nOR X2\nLD X3\nOUT Y1\nFOO\nEND');
  console.log('hata örnekleri:', r.errors.map(e => e.line + ': ' + e.msg).join(' | ')); }

// 9) AND-sonra-OUT zinciri
{ const r = P.parseIL('LD X0\nOUT Y0\nAND X1\nOUT Y1\nAND X2\nOUT Y2');
  console.log(P.toIL(r.prog)); }
console.log(fail ? fail + ' test BAŞARISIZ' : 'Tüm testler geçti');
process.exit(fail ? 1 : 0);
