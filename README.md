# Delta PLC Simülatör

Tarayıcıda çalışan basit bir ladder (merdiven) diyagramı simülatörü. Delta DVP serisinin komut mantığıyla devre kurup çalıştırmak, PLC dersine çalışırken denemeler yapmak için yazıldı.

**Canlı:** https://delta-plc-sim.delidana-lab.workers.dev (yedek: https://dailydana.github.io/delta-plc-sim/)

**Yeni sürüm (önizleme):** https://delta-plc-sim-v2.delidana-lab.workers.dev. IDE düzeni, IL düzenleyici, izleme tablosu, gerçek model zamanlayıcıları, klavyeyle devre kurma. Denendikten sonra ana adrese geçecek; eski kayıtlar otomatik aktarılır.

Kurulum gerekmez. İnternetsiz kullanmak için [Releases](https://github.com/DailyDana/delta-plc-sim/releases) sayfasından tek dosyalık sürümü indirip çift tıklamak yeterli.

## Neler var

- Kontak (açık, kapalı, yükselen/düşen kenar) ve çıkışlar: `OUT`, `SET`, `RST`, `TMR`, `CNT`, `PLS`, `PLF`
- Parçaları panodan sürükleyerek devre kurma; seri, paralel, çıkış dallanması
- RUN / duraklat / tek tarama adımı, ×¼–×10 hız; akımın geçtiği yollar yeşil görünür
- X girişleri butonla ya da klavyeden (0–7), Y çıkışları lamba olarak
- Ladder ile IL (komut listesi) arasında iki yönlü çeviri: `LD`, `AND`, `OR`, `ANB`, `ORB`, `MPS/MRD/MPP` …
- Adres denetimi (ör. X/Y sekizlik: `X8` yoktur), çift bobin uyarısı
- Sekmeler, tarayıcıda kayıt, `.txt` / `.json` dışa aktarma, geri al/yinele, açık/koyu tema
- Hazır örnekler: mühürleme, yıldız-üçgen, trafik lambası, sayıcı, PLS ile aç/kapa …

## Zamanlayıcı ve sayıcılar

Tarayıcı arayüzü şimdilik sadeleştirilmiş tabloyu kullanır: T0–T199 100 ms, T200–T239 10 ms, T240–T255 1 ms (`TMR T0 K50` = 5 s); C0–C199 16 bit yukarı sayıcı. Yeni çekirdekte gerçek model tabloları var (ör. ES2: T127 1 ms, T240–T245 10 ms birikimli, T246–T249 1 ms birikimli, T250–T255 100 ms birikimli); arayüz Aşama 2'de bunlara geçecek. Bu bir öğrenme aracıdır, gerçek PLC'nin yerini tutmaz.

## Geliştirme

Tarayıcı arayüzü (v1) derleme adımı olmadan çalışır: `index.html`, `plc-core.js`, `app.js`, `examples.js`.

Yeni arayüz (v2) React + Vite + Zustand + CodeMirror ile `src/ui/` altında; giriş `web/index.html`.

Yeni çekirdek (v2) TypeScript ile `src/core/` altında: IL ayrıştırıcı ve statik analiz, gerçek PLC gibi komut komut çalışan sanal makine, ladder ↔ IL dönüşümü (iç içe MPS), Delta kılavuzlarından alınmış model profilleri (ES2, SS2, EH3). Arayüz Aşama 2'de bu çekirdeğe geçecek.

```
npm install
npm run dev                   # v2 geliştirme sunucusu
npm test                      # çekirdek ve düzenleme testleri (v1 ile 300 rastgele devrelik eşdeğerlik testi dahil)
npm run e2e                   # v2 uçtan uca testler (Playwright, Edge)
npm run typecheck
node tools/test.js            # tarayıcı testleri (headless Edge)
node tools/tek-dosya.js       # dagitim/Delta-PLC-Simulator.html (tek dosya sürüm)
npx wrangler deploy           # Cloudflare'e yayınla
```

### Komut satırı

```
npm run plc -- kontrol devre.txt
npm run plc -- sim devre.txt --olay "0:X0=1 100:X0=0" --sure 6s --dalga
npm run plc -- ciz devre.txt
npm run plc -- link devre.txt --run
```

### Dışarıdan sürmek (`PLC.app`)

Tarayıcı konsolundan ya da Playwright gibi araçlardan (v2'de `window.plc` da aynı):

```js
PLC.app.load("LD X0\nOR Y0\nANI X1\nOUT Y0", "mühürleme")
PLC.app.press("X0", 100)   // belirlenimli bas-bırak
PLC.app.advance(5000)       // gerçek zamandan bağımsız 5 s tara
PLC.app.state()             // { mode, scan, t, X0: 0, Y0: 1, T0: "25/100", ... }
```

Ayrıca `set(x, v)`, `run()`, `pause()`, `stop()`, `getIL()`.

Delta Electronics ile bir bağlantısı yoktur; "Delta" ve "DVP" adları yalnızca komut setini tarif etmek için geçer.

## Lisans

MIT
