# Delta PLC Simülatör

Tarayıcıda çalışan basit bir ladder (merdiven) diyagramı simülatörü. Delta DVP serisinin komut mantığıyla devre kurup çalıştırmak, PLC dersine çalışırken denemeler yapmak için yazıldı.

**Canlı:** https://dailydana.github.io/delta-plc-sim/

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

T0–T199 100 ms, T200–T239 10 ms, T240–T255 1 ms tabanlı (`TMR T0 K50` = 5 s). C0–C199 16 bit yukarı sayıcı. Gerçek DVP modellerinde aralıklar modele göre biraz farklı olabilir; bu bir öğrenme aracıdır, gerçek PLC'nin yerini tutmaz.

## Geliştirme

Derleme adımı yok: `index.html`, `plc-core.js` (IL ayrıştırıcı ve tarama motoru), `app.js` (arayüz), `examples.js`.

```
node test/test-core.js        # çekirdek testleri
node tools/tek-dosya.js       # dagitim/Delta-PLC-Simulator.html (tek dosya sürüm)
node tools/test-sayfalari.js  # test/*.html sayfalarını üretir (headless tarayıcı testleri için)
```

Delta Electronics ile bir bağlantısı yoktur; "Delta" ve "DVP" adları yalnızca komut setini tarif etmek için geçer.

## Lisans

MIT
