# Delta PLC Simülatör — ajan rehberi

Tarayıcıda çalışan Delta DVP ladder simülatörü. Yayın: https://delta-plc-sim.delidana-lab.workers.dev (Cloudflare Workers, statik).
Yol haritası: `C:\Users\bilge\.claude\plans\program-senin-ok-rahat-sleepy-eich.md` (Aşama 0–2 ve 3a bitti; v2 önizleme adresinde, ana adrese geçiş kullanıcı onayı bekliyor).
Sıra (11 Kas 2026 incelemesi): doğruluk turu yapıldı → öğrenme düzeltmeleri → yalnızca MC/MCR → zaman diyagramı ve alıştırma modu → STL/CJ/SFT/DCNT (satır modeli ve akım gösterimi baştan ele alınmalı; büyük iş).

## Katmanlar

- **v1 arayüzü (ana adreste yayındaki):** `index.html`, `app.js`, `plc-core.js`, `examples.js`. Derleme yok. Tarayıcı testleri `test/` + `tools/test.js`.
  Geçişe (kullanıcı onayı) kadar ana adreste kalır; geçişte `legacy/` altına taşınacak.
- **v2 çekirdeği (TypeScript):** `src/core/` — IL ayrıştırıcı + statik analiz (`il.ts`), komut komut çalışan sanal makine (`vm.ts`),
  ladder ağacı ↔ IL (`ladder.ts`, iç içe MPS, kaynak eşlemesi `ladderToIlMapped`/`mapProgramToLadder`), model profilleri (`profiles.ts`: ES2, SS2, EH3, v1),
  `simulate.ts`, `textdraw.ts`. CLI: `src/cli/plc.ts`. Testler: `tests/*.test.ts` (vitest).
- **v2 arayüzü (React + Vite + Zustand + CodeMirror):** kök `web/index.html` → `src/ui/main.tsx`. Önizleme: https://delta-plc-sim-v2.delidana-lab.workers.dev
  - `src/ui/state/store.ts`: tek durum. Sekmenin asıl verisi **IL metni**; ladder ondan türetilir (`deriveDoc`). Ladder düzenlemesi `editLadder(fn)` ile
    kopya ağaç üzerinde yapılır (kimlikler korunur, seçim geçerli kalır), IL yeniden yazılır. Geri al yığını IL metinleridir.
  - `src/ui/state/edit.ts`: saf ağaç işlemleri (ekle/sil/taşı/sürükle-bırak/pano, `tidy`). `persist.ts`: localStorage → bellek yedeği, v1 kayıt aktarımı.
  - `src/ui/sim/engine.ts`: gerçek zamanlı tarama döngüsü, kısa basış kilidi, STOP→RUN'da kalıcı bölge korunumu, çalışırken düzenlemede bellek devri (`Machine.adoptState`).
  - `src/ui/ladder/`: `layout.ts` (sahne + bırakma noktaları), `power.ts` (canlı akım; VM izi `closed[]` üzerinden), `LadderView.tsx` (canlı görünüm React'siz, DOM sınıflarıyla), `drag.ts`, `quick.ts` (Enter ile komut yazarak ekleme).
  - `src/ui/api.ts`: `window.plc` (ve v1 uyumu için `window.PLC.app`).

## Bir devreyi doğrulamak / kullanıcıya göstermek

Ekran görüntüsü yerine CLI kullan (tarayıcı açmaz, saniyeler sürer):

```bash
npm run plc -- kontrol devre.txt            # tanılama (kodlu), özet; --il ile normalleştirilmiş IL
npm run plc -- sim devre.txt --olay "0:X0=1 100:X0=0 6s:X1=1" --sure 8s --dalga   # zaman çizelgesi + dalga
npm run plc -- ciz devre.txt                # ladder'ı metin olarak çiz (cevaba yapıştırılabilir)
npm run plc -- link devre.txt --ad "Yıldız-üçgen" [--run]   # kullanıcıya verilecek bağlantı
npm run plc -- ornek [n]                    # hazır örnekler; dosya yerine ornek:4 ya da -e "LD X0\nOUT Y0"
```

Kullanıcıya devre gösterme tarifi: IL'i `devreler/NN-ad.txt` olarak yaz → `kontrol` → `sim` ile beklenen davranışı doğrula → `ciz` çıktısını ve `link` bağlantısını ver.
Model: `--model ES2|SS2|EH3|v1` (varsayılan ES2). v1 profili yalnızca eski davranış ve eşdeğerlik testi içindir.

## IL kuralları (özet)

- X/Y sekizlik (X0–X7, X10…). `#X0 etiket` cihaz etiketi, `;` açıklama (komuttan önceki açıklama satırı = satır açıklaması).
- Satır, bir çıkış komutundan sonra gelen ilk LD/LDI/LDP/LDF ile başlar.
- Komutlar: LD/LDI/LDP/LDF, AND/ANI/ANDP/ANDF, OR/ORI/ORP/ORF, ANB, ORB, MPS/MRD/MPP (en çok 8 iç içe),
  OUT, SET, RST, TMR Tn Kn|Dn, CNT Cn Kn|Dn, PLS, PLF, INV, END, NOP.
- Ana kontrol: `LD X0` / `MC N0` … `MCR N0` (N0–N7, iç içe bloklarda dıştaki N0, içteki N1…). MC satırda tek çıkış; MCR koşulsuz,
  tek komutluk satır (önünde LD yok; ladder'da girişsiz satır, IL'e `LD M1000` yazılmaz). Kapalı bölgedeki çıkışlar akım 0 gibi
  yürütülür; VM izi `mcClosed[]`, ekranda satır barası `<satır id>:rail` (power.ts `mcRailOf`). Testler: `tests/mc.test.ts`.
- Uygulama komutları (Aşama 3a; P soneki darbe, D öneki 32 bit): MOV, CMP, ZCP, ADD, SUB, MUL, DIV, INC, DEC,
  WAND/WOR/WXOR (32 bit: DAND/DOR/DXOR), ZRST, ALT. Karşılaştırma kontakları: LD= LD> LD< LD<> LD<= LD>= ve AND…/OR…/D…
  Kelime işlenenleri: K10, H1F, D0, T0/C0 (değer), K1Y0 (Y0–Y3 bit grubu). Davranış ve sayfa numaraları: `docs/kilavuz-notlari.md`.
  Yeni komut eklerken: `instructions.ts` tablosu → `il.ts` işlenen denetimi → `vm.ts` `api()` → `tests/api.test.ts` (kılavuz örneğiyle).
- CJ/P, STL/RET, SFTL/SFTR, DCNT henüz yok (Aşama 3b). MC/MCR var (v1 profili desteklemez).
- Ladder'a çevrilemeyen ama çalışan kalıp: çıkıştan sonra OR (`L_OR_AFTER_OUTPUT`).
- Örneklerin tek kaynağı `devreler/*.txt`. `examples.js` (v1, ilk `V1_COUNT` = 19) ve `src/core/examples.ts` (v2, hepsi) `node tools/ornekler.cjs` ile ÜRETİLİR; elle düzenleme (`tests/ornekler.test.ts` farkı yakalar).
  Yeni örnek: `devreler/NN-ad.txt` yaz (ilk yorum `; Dene: …`) → `kontrol` → `sim` ile yorumdaki davranışı doğrula → `tools/ornekler.cjs` listesinin SONUNA ekle (sıra değişirse `#ornek=N` bağlantıları kayar) → `npm run ornekler`.
- Kaskad çıkış (`OUT A / AND b / OUT C / OUT D`): `ilToLadder` kontağı bobinlere kopyalamaz, ara düğümün ön serisi yapar (kontak bir kez okunur). Bunu bozan değişiklik `tests/kaskad.test.ts`'te yakalanır.

## Alıştırmalar ("şu davranışı yapan devreyi kur")

- Kod: `src/core/exercise.ts` (türler + `checkExercise(il, ex, { profile })`), içerik `src/core/exercises/` (`define.ts` yardımcıları,
  `kumanda.ts` 1–4, `zaman.ts` 5–9, `uygulama.ts` 10–12, sıra `index.ts`'teki `EXERCISES`). Testler: `tests/exercise.test.ts`.
- Alıştırma: kalıcı `id` (sıra değişse de değişmez), `title`, `level` 1–3, `task` (öğrenci metni; adresler ve NO buton varsayımı açık),
  `inputs/outputs` (`io(dev, etiket, tür)`; tür iletideki fiili seçer: lamba yandı, motor durdu, kontaktör bıraktı), `solutionIl` (gizli),
  `hints` (1–3, sonuncusu da çözümü vermez), `scenarios`. `starterIl` `define()` ile üretilir: yorum + `#X0 etiket` satırları + END.
- Senaryo: `scenario(ad, olaylar /* parseEvents biçimi */, süre_s, örnekler, { invariants, timing })`.
  Örnek noktası `on(s, 'Y0', not?)` / `off(...)`: beklenen kenarlardan en az ~0,2 s uzak seç (doğru çözümlerin 1–2 tarama farkı sonucu değiştirmesin).
  Değişmez `never('Y1')`, `notBoth('Y1','Y2')`: izdeki her değişim anında (= her taramada) denetlenir.
  Zamanlama `delay('X0','rise', 3, 'Y0','rise', { n, tol /* vars. 0,1 s */ })`. `not` kalınca iletiye eklenen kısa yönlendirme cümlesidir.
- Denetim yalnızca görevin çıkışlarına bakar (M/T/C/D ve görev dışı Y serbest). Senaryodaki ilk (en erken; eşitlikte zamanlama > değişmez > örnek)
  başarısızlığın iletisi `message`'dır. Engelleyici hatada `blocked: true`, senaryolara girilmez. Sonuçta öğrencinin ve referansın izi
  (`student`/`reference`, simulate() `changes` biçimi, izlenen = görev girişleri + çıkışları) arayüzde üst üste çizmek içindir.
- Yeni alıştırma: içerik dosyasına `define({...})` ekle → `exercises/index.ts` listesinin SONUNA koy → `tests/exercise.test.ts` `CASES`'e
  kimlikle en az 2 farklı yapıda doğru çözüm (SET/RST, başka zamanlayıcı, yardımcı röle…) ve en az 2 tipik yanlış çözüm (ilk iletinin
  cihaz/zamanını gösteren düzenli ifadeyle) ekle. Referans + doğrular geçmeli, yanlışlar kalmalı; boş başlangıç IL'i kalmalı. Davranıştan
  emin değilsen önce `npm run plc -- sim` ile dene.
- CLI: `npm run plc -- alistirma` (liste) · `alistirma <kimlik> [--ipucu n]` (görev + başlangıç IL'i) · `alistirma <kimlik> <dosya.txt>`
  (ya da `-e`; senaryo senaryo ✓/✗ ve ileti, kalırsa çıkış kodu 1) · `--cozum` referansı yazar (başka hiçbir komut yazmaz).
- Arayüz `src/ui/exercise/`: `progress.ts` saf işlevler (ilerleme `dps2.exercises` = çözülenler/son IL/ipucu sayısı, sekme bağı,
  `#alistirma=<kimlik>` ayrıştırma; `tests/exercise-ui.test.ts`), `store.ts` (ilerleme + sekme başına son denetim; `openExercise`,
  `checkActive`; alıştırma sekmelerinin IL'i `useStore.subscribe` ile ilerlemeye yazılır), `ExerciseList.tsx` (sol panel "Alıştırma"
  sekmesi), `ExercisePanel.tsx` (alıştırma sekmesinde sağ panelin üstü: görev, G/Ç, Kontrol et/İpucu/Baştan başla, senaryo listesi),
  `ComparePanel.tsx` (alt panel "Karşılaştırma": `Waveform` öğrenci düz / referans kesikli, `marker` = ilk sorunun anı),
  `playback.ts` ("Bu senaryoyu oynat": olaylar motorun `afterScan` kancasında bir sonraki taramanın girişine yazılır; STOP→RUN, sekme
  değişimi ya da süre sonu bitirir). Sekme verisinde `exercise` alanı; alıştırma sekmesi "kaydedilmedi" sayılmaz.
- Referans çözümün IL'i arayüzde hiçbir yere konmaz: bileşenler `publicExercise()` (solutionIl'siz) kullanır, yalnızca denetim
  sonucundaki iz çizilir. `window.plc`: `exercises()`, `openExercise(id)`, `checkExercise()` (düz sonuç), `exerciseProgress()`.
  e2e: `e2e/alistirma.spec.ts` (sızıntı denetimi dahil).

## Tarayıcıda sürmek: `window.plc` (v2) / `PLC.app` (v1)

`load(il, ad)`, `set('X0', 1)`, `press('X0', ms)`, `advance(ms)` (belirlenimli), `run()/pause()/stop()/step()/powerCycle()`, `state()` → `{ mode, scan, t, Y0: 1, T0: '25/100' }`, `getIL()`.
v2'de ayrıca `getLadder()` (metin çizim), `diagnostics()`, `model('EH3')`, `trace(['Y0'])` (zaman diyagramı kaydı). Testler için `window.__engine` (`rewindClock`, `tick`) ve `window.__store`.

## Zaman diyagramı

- İz verisi `src/core/trace.ts`: `Trace = { start, end, signals: { [anahtar]: { init, t[], v[], from? } } }` (PLC zamanı, ms). Anahtarlar `X0/Y0/M0/S0`, `T0`/`C0` (kontak), `T0.v`/`C0.v` (değer), `D0`.
  `traceFromSim(simulate(...), süre)` simulate sonucunu çevirir; `diffRanges`/`traceDiff` iki izin ayrıştığı aralıklar; `snapToEdge` imleç yapışması; `TraceRecorder` halka tampon (50 000 değişim / 30 dk).
- Kayıt `src/ui/sim/recording.ts` (motor kancaları `engine.addHooks`): X taramadan önce, diğerleri taramadan sonra örneklenir (simulate ile aynı kenar zamanları; `tests/trace.test.ts`).
  STOP→RUN yeni kayıt; STOP/güç kesmede kayıt donar; sekme/model değişiminde silinir; çalışırken düzenlemede sürer.
- Çizim `src/ui/timing/`: `Waveform.tsx` yeniden kullanılabilir bileşen (`rows`, `trace` ya da canlı `() => Trace` + `subscribe`, isteğe bağlı `expected` kesikli + ayrışma vurgusu), `draw.ts` canvas çizimi, `png.ts` açık temalı PNG, `TimingPanel.tsx` alt panel sekmesi, `selection.ts` sekme başına cihaz seçimi (`dps2.timing`). e2e: `e2e/timing.spec.ts`.

## Test ve yayın

```bash
npm run typecheck && npm test      # TS: çekirdek + düzenleme işlemleri (300 rastgele devrelik v1 eşdeğerlik testi dahil)
npm run e2e                        # v2: vite build + Playwright (Edge headless) uçtan uca
node tools/test.js                 # v1 çekirdek + headless Edge tarayıcı testleri (68 kontrol)
node tools/tek-dosya.js            # dagitim/Delta-PLC-Simulator.html (v1 tek dosya, release için)
npm run dev                        # v2 geliştirme sunucusu (http://localhost:5173)
node D:/Projects/poz-galerisi-web/node_modules/wrangler/bin/wrangler.js deploy                       # v1 → ana adres
npm run build && node D:/Projects/poz-galerisi-web/node_modules/wrangler/bin/wrangler.js deploy -c wrangler.v2.jsonc   # v2 → önizleme
```

- v2 görsel kontrol: Playwright ile headless ekran görüntüsü al (ekranı yakalama). Koyu temada görüntüleyici renkleri parlak gösterebilir; şüphede pikseli PIL ile oku.
- `dist/` e2e testlerinin kullandığı çıktıdır; paralel çalışırken kendi denemeni ayrı klasöre derle (`vite build --outDir <scratch>`).

- Headless Edge'i Git Bash'ten doğrudan başlatma (sessizce çıktı vermez); `tools/test.js` PowerShell `Start-Process` kullanır, her sayfaya yeni profil klasörü verir.
- Test sürücüleri (`test/drive-*.js`) `app.js` ile aynı global alanı paylaşır: app.js'te `tick` gibi genel adlar kullanma.
- `app.js`'te `localStorage`'a doğrudan erişme (`store` sarmalayıcısı var); `prompt/confirm/alert` kullanma (`askText/askConfirm/showText`).
- Commit: DailyDana kimliği, main dalı, Co-Authored-By satırı yok. Kod değişince: test → commit/push → wrangler deploy.

## Doğruluk kaynağı

Profillerdeki değerler Delta programlama kılavuzlarından (sayfa numaraları `profiles.ts` içinde). Kılavuzda doğrulanamayanlar her profilin `notes` alanında; uydurma değer ekleme, bilmiyorsan `notes`'a yaz.
