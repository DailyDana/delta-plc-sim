// Giriş zamanlaması ve PLC.app API testi.
// Sonuç console.log("TESTOUT ...") ile yazılır (headless Edge --enable-logging).
const res = [];
const ok = (c, m) => res.push((c ? 'GECTI ' : 'HATA  ') + m);
const S = () => PLC.app.state();
const ex = (start) => PLC_EXAMPLES.find((e) => e.name.startsWith(start)).il;

localStorage.clear();
ok(PLC.app && typeof PLC.app.state === 'function' && typeof PLC.app.advance === 'function', 'PLC.app API var');

// 1) Kısa basış: iki tarama ARASINDA basılıp bırakılan buton yine de görülmeli (mühürleme)
let r = PLC.app.load(ex('Mühürleme'), 'muh');
ok(r.ok && r.rungs === 1, 'load: devre yeni sekmede açıldı');
PLC.app.run();
setInput('X0', true);
setInput('X0', false); // bu arada hiç tarama olmadı
scanOnce(10);
ok(S().Y0 === 1, 'taramalar arasındaki kısa basış mühürlemeyi tetikledi');
scanOnce(10);
ok(S().Y0 === 1 && S().X0 === 0, 'basış bir taramadan sonra bırakıldı, Y0 mühürlü kaldı');

// 2) Duraklatılmışken tıkla + Adım
PLC.app.stop();
$('#bStep').click(); // duraklatılmış kipe geç
setInput('X0', true);
setInput('X0', false);
ok(S().Y0 === 0, 'duraklatılmışken basış tarama olmadan etki etmedi');
$('#bStep').click();
ok(S().Y0 === 1, 'duraklatılmışken basılan buton sonraki Adım\'da görüldü');

// 3) STOP'tayken basış RUN'a geçince sayılmamalı
PLC.app.stop();
setInput('X0', true);
setInput('X0', false);
$('#bRun').click();
scanOnce(10);
ok(S().Y0 === 0, 'STOP\'tayken yapılan basış RUN\'da sayılmadı');

// 4) Hızlı ardışık basışlar: sayıcı her birini saymalı
PLC.app.load(ex('Sayıcı'), 'say');
PLC.app.stop();
PLC.app.advance(10); // önce duraklatılmış kipe geç (STOP'taki basışlar kural gereği sayılmaz)
for (let i = 0; i < 5; i++) {
  setInput('X0', true);
  setInput('X0', false);
  PLC.app.advance(20); // 1. tarama basılı, 2. tarama bırakılmış → her basış bir yükselen kenar
}
ok(S().C0 === '5/5' && S().Y0 === 1, 'beş hızlı basış = sayıcı 5, Y0 yandı (' + S().C0 + ')');
PLC.app.press('X1', 50);
ok(S().C0 === '0/5' && S().Y0 === 0, 'press(X1) sayıcıyı sıfırladı');
for (let i = 0; i < 3; i++) PLC.app.press('X0', 30);
ok(S().C0 === '3/5', 'press(X0) ×3 = 3 (' + S().C0 + ')');

// 5) Kareler seyrekleşince (arka plan / gömülü pencere) zaman geride kalmamalı
PLC.app.load(ex('Tahtadaki'), 'tahta'); // T0 K150 RUN'da hemen saymaya başlar
PLC.app.stop();
PLC.app.run();
last = performance.now() - 3000; // son tick'ten bu yana 3 s geçmiş gibi
simTick();
const cv = parseInt(S().T0, 10);
ok(cv >= 29 && cv <= 31, '3 s\'lik boşluk tek tick\'te yetişti: T0 = ' + S().T0);
const t0 = sim.timeMs;
last = performance.now() - 600000; // 10 dk askı
simTick();
ok(Math.abs(sim.timeMs - t0 - 60000) < 50, 'uzun askıdan dönüşte en çok 60 s yetişildi (' + Math.round(sim.timeMs - t0) + ' ms)');

// 6) Belirlenimli ilerletme ve state() biçimi
PLC.app.load(ex('Yıldız'), 'yu');
PLC.app.stop();
PLC.app.press('X0', 50);
let s = S();
ok(s.mode === 'pause' && s.Y0 === 1 && s.Y1 === 1 && s.Y2 === 0, 'press sonrası yıldız (Y0, Y1)');
s = PLC.app.advance(5000);
ok(s.Y1 === 0 && s.Y2 === 1 && s.T0 === '50/50', 'advance(5000) sonrası üçgen, T0 = 50/50');
ok(typeof s.t === 'number' && typeof s.scan === 'number' && /^\d+\/\d+$/.test(s.T0) && s.M0 === 1, 'state() düz nesne: { mode, scan, t, Y0: 1, T0: "50/50", M0: 1 }');
ok(/LD X0/.test(PLC.app.getIL()), 'getIL() komut listesini döndürdü');
r = PLC.app.load('LD X0\nFOO Y0', 'bozuk');
ok(r.ok === false && r.errors.length > 0, 'bozuk IL yüklenmedi, hata döndü');
let threw = false;
try { PLC.app.set('X8', 1); } catch (e) { threw = true; }
ok(threw, 'geçersiz giriş adresi (X8) hata attı');

res.push('BITTI');
console.log('TESTOUT ' + res.join(' ;; '));
