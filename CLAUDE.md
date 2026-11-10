# Delta PLC Simülatör — ajan rehberi

Tarayıcıda çalışan Delta DVP ladder simülatörü. Yayın: https://delta-plc-sim.delidana-lab.workers.dev (Cloudflare Workers, statik).
Yol haritası: `C:\Users\bilge\.claude\plans\program-senin-ok-rahat-sleepy-eich.md` (Aşama 0–1 bitti; Aşama 2 v2 IDE önizlemede, geçiş kullanıcı onayı bekliyor).

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
- Uygulama komutları (Aşama 3a; P soneki darbe, D öneki 32 bit): MOV, CMP, ZCP, ADD, SUB, MUL, DIV, INC, DEC,
  WAND/WOR/WXOR (32 bit: DAND/DOR/DXOR), ZRST, ALT. Karşılaştırma kontakları: LD= LD> LD< LD<> LD<= LD>= ve AND…/OR…/D…
  Kelime işlenenleri: K10, H1F, D0, T0/C0 (değer), K1Y0 (Y0–Y3 bit grubu). Davranış ve sayfa numaraları: `docs/kilavuz-notlari.md`.
  Yeni komut eklerken: `instructions.ts` tablosu → `il.ts` işlenen denetimi → `vm.ts` `api()` → `tests/api.test.ts` (kılavuz örneğiyle).
- MC/MCR, CJ/P, STL/RET, SFTL/SFTR, DCNT henüz yok (Aşama 3b).
- Ladder'a çevrilemeyen ama çalışan kalıp: çıkıştan sonra OR (`L_OR_AFTER_OUTPUT`).
- Örnekler (`src/core/examples.ts`): ilk `V1_COUNT` (19) örnek v1 `examples.js` ile birebir aynı (eşdeğerlik testi); sonrakiler v2'ye özel.
  Yeni örnek: `devreler/NN-ad.txt` yaz → `kontrol` (ES2 ve v1) → `sim` ile yorumlardaki davranışı doğrula → listeye ekle (sırayı bozma, `#ornek=N` bağlantıları sıraya bağlı).

## Tarayıcıda sürmek: `window.plc` (v2) / `PLC.app` (v1)

`load(il, ad)`, `set('X0', 1)`, `press('X0', ms)`, `advance(ms)` (belirlenimli), `run()/pause()/stop()/step()/powerCycle()`, `state()` → `{ mode, scan, t, Y0: 1, T0: '25/100' }`, `getIL()`.
v2'de ayrıca `getLadder()` (metin çizim), `diagnostics()`, `model('EH3')`. Testler için `window.__engine` (`rewindClock`, `tick`) ve `window.__store`.

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
