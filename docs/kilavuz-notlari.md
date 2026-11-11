# Delta DVP-ES2 kılavuz notları (simülatörün doğruluk kaynağı)

Kaynak: *DVP-ES2/EX2/SS2/SA2/SX2/SE&TP Operation Manual – Programming* (Delta). Sayfa numaraları kılavuzun basılı numaralarıdır.
Simülatörde uygulanan davranış ve dayanağı. "Çıkarım" yazanlar kılavuzda açıkça yazmayan, şekil ya da örnekten çıkarılan kararlardır.

## Genel
- D öneki 32 bit, P soneki darbe: yalnızca sürücü akımın yükselen kenarında bir tarama yürütülür (s.3-15, 3-17). P'siz komut her taramada yürütülür.
- Yürütülmeyen komutun hedefi ve bayrakları korunur (s.3-18, 3-61).
- 32 bit çift: D0 düşük, D1 yüksek kelime (s.3-17). T ve 16 bit C değerleri de kelime olarak kullanılır.
- T ve C0–C199 16 bittir (cihaz tablosu s.2-2, 2-9: "T0~T255, 256 words", "C0~C199, 16-bit counter"; C200–C254 32 bit;
  kelime = 16 bit, s.3-17 madde 5). 32 bit komutun işleneni
  T ya da 16 bit C ise çift kullanılır: Tn/Cn düşük, Tn+1/Cn+1 yüksek kelime — s.3-17 madde 6: "This principle also applies
  to timer T and 16-bit counters C0~C199". Simülatör böyle uygular (`DMOV K100000 C0` → C0 = −31072, C1 = 1). Çiftin üst cihazı
  aralık dışındaysa (T255, D9999) ya da 32 bit bölgeye taşıyorsa (C199 → C200) hata verir. 32 bit sayıcı (C200+) tek başına
  32 bittir ve yalnızca 32 bit komutla kullanılır (s.3-17 madde 7).
- Çıkarım: 16 bit MUL'un 32 bit sonucu ve DIV'in kalanı T/C hedefinde de D'deki gibi bir sonraki cihaza yazılır
  (`MUL K300 K300 T0` → T0 düşük, T1 yüksek kelime). s.3-77/3-79 işlenen tablosu D için T ve C'ye izin veriyor ama D+1'in
  T/C için ne olduğunu açıkça yazmıyor; D kuralına (s.3-77, 3-79) ve s.3-17 madde 6'ya paralel karar. Hiçbir durumda 16 bit
  cihazda 16 bit dışı değer kalmaz.
- K: −32768…32767 (16 bit), H0000…HFFFF; 32 bitte −2147483648…2147483647 (s.2-9).
- Bayraklar: M1020 sıfır, M1021 borç, M1022 elde (s.3-18). Hata: M1067 işlem hatası, M1068 kilit, D1067 hata kodu, D1068 adres (s.2-58).

## Program yapısı ve tanılama
- END: "PLC 0 adresinden END'e kadar tarar ve 0 adresine döner"; END programın sonuna konmalı (s.3-11; tarama sırası s.1-5).
  Bu yüzden END'den sonraki komutlar hiç çalışmaz: simülatör onları atar ve **uyarı** verir (`W_AFTER_END`, ilk atılan
  komutun satırında). END'i olmayan program için de uyarı verir (`W_NO_END`). Çıkarım: END eksikken gerçek PLC/WPLSoft'un
  ne yaptığı (hata kodu mu, otomatik ekleme mi) bu kılavuzda yok; simülatör programı yine de sonuna kadar çalıştırır.
- Simülatör kararı (kılavuz konusu değil): işlenen aralığı/adres hataları (`E_ADDR_RANGE`, `E_CONST_RANGE`, `E_ADDR_OCTAL`,
  `E_ADDR_FORMAT`, `E_OPERAND_KIND`, `E_SPECIAL_READONLY`) programın çalışmasını engeller; geçersiz işlenen sessizce 0
  sayılmaz. v1 profili eski davranışı korur (eşdeğerlik testi).
- Simülatör kararı: çalışırken düzenlemede (çevrimiçi düzenleme) değişmeyen komutlar kenar belleğini devralır (satırdaki
  kendisi ve önceki komutları aynı olan komut "değişmemiş" sayılır); yeni ya da değişmiş komut ilk taramada "önceki =
  şimdiki" kabul eder, böylece düzenleme anında zaten ON olan koşul sahte kenar üretmez. Delta'nın çevrimiçi düzenleme
  davranışı bu kılavuzda yok.

## Saat darbeleri (M1011–M1014)
- M1011 10 ms (5 ms açık / 5 ms kapalı), M1012 100 ms, M1013 1 s, M1014 1 dk (s.2-12 tablo, s.2-47). Saat taramadan bağımsız
  akar, PLC STOP'tayken de çalışır (s.2-47 madde 2).
- Simülatör yaklaşımı (kılavuzda yok): bit, taramanın başındaki simüle zamana göre okunur. Tarama süresi saatin yarım
  periyoduna eşit ya da büyükse (10 ms taramada M1011) bu hep aynı fazı yakalar; bu durumda simülatör biti her taramada bir kez
  değiştirir (gerçek donanımda tarama ile saat senkron olmadığı için bit göze "titreyen" görünür). 10 ms taramada
  M1012/M1013/M1014 bundan etkilenmez.

## Kelime işlenenleri
- Kaynak: K, H, KnX/KnY/KnM/KnS, T, C, D. Hedef: KnY/KnM/KnS, T, C, D (s.3-61). E/F indeks henüz yok.
- Kn: 16 bitte K1–K4, 32 bitte K1–K8; K1 = 4 bit (s.3-18). K1–K3 okuması pozitiftir (üst bitler 0), K4 16 bitte işaretli (s.3-20).
- Kn hedefe yazınca yalnızca n×4 bit değişir. Çıkarım: CML/BCD örnekleri (s.3-65, 3-71); MOV için açık cümle yok.

## Komutlar
| Komut | Davranış | Sayfa |
|---|---|---|
| MOV / DMOV | S → D | 3-61 |
| CMP | D = S1>S2, D+1 = eşit, D+2 = S1<S2; işaretli; kapalıyken bitler korunur | 3-59 |
| ZCP | D = S<S1, D+1 = S1≤S≤S2, D+2 = S>S2; S1>S2 ise S1 tek değer (çıkarım: CMP gibi) | 3-60 |
| ADD / SUB | cebirsel; aralık aşılırsa M1022/M1021; saklanan değer ikiye tümleyen sarma (çıkarım: s.3-75 şekli) | 3-74…76 |
| MUL | 16×16 → 32 bit (D+1:D); 32×32 → 64 bit (D+3…D) | 3-77 |
| DIV | bölüm D, kalan D+1 (32 bitte D+1:D, D+3:D+2); bölen 0 → yürütülmez, M1067/M1068, D1067 = 0E19 | 3-79 |
| INC / DEC | ±1, sınırda sarar, bayrakları etkilemez; genelde P biçimi | 3-81, 3-82 |
| WAND / WOR / WXOR (DAND/DOR/DXOR) | bit bit | 3-83…88 |
| ZRST | D1…D2 aynı tür; D1>D2 ise yalnızca D2; T/C değer + kontak sıfırlanır | 3-102 |
| ALT | her yürütmede bit değişir; ALTP her yükselen kenarda bir kez | 3-175 |
| INV | o ana kadarki sonucu ters çevirir | 3-284 |
| LD= … OR>= (D…) | S1 ? S2 karşılaştırma kontağı, işaretli; IL'de `LD= D0 K10` | 3-499…504 |
| TMR / CNT | ayar K0–K32767 ya da D0–D9999 | 3-281…283 |
| CNT | ayarda durur; MOV ile ayarın üstü yazılırsa sonraki kenarda ayara eşitlenir (v1 profilinde değil) | 2-26 |
| MC / MCR | ana kontrol bloğu; aşağıdaki bölüm | 3-10, 3-11 |

## Ana kontrol: MC Nn / MCR Nn (s.3-10, 3-11)
Kılavuzda doğrulanan:
- Yazım `LD X0` / `MC N0` … `MCR N0`; işlenen N0–N7. MC bir sürme koşulu ister; MCR'nin önünde sürme kontağı gerekmez
  ("no drive contact is required before MCR").
- MC etkin değilken MC–MCR arasındaki komutlar (tablo, s.3-10): genel zamanlayıcı ve altprogram zamanlayıcısı değer = 0,
  bobin OFF; birikimli zamanlayıcı ve sayıcı bobin OFF, değer ve kontak korunur; OUT ile sürülen bobinler OFF; SET/RST ile
  sürülenler olduğu gibi; uygulama komutları çalışmaz (FOR-NEXT yine döner; simülatörde FOR-NEXT yok).
- En çok 8 seviye iç içe; N0'dan N7'ye sırayla kullanılır (s.3-11 not). Kılavuz örneğinde aynı N0 art arda bloklarda yeniden
  kullanılıyor (`tests/mc.test.ts` kılavuz örneği).

Simülatör uygulaması ve çıkarımlar:
- Çıkarım (tablonun genellemesi): kapalı bölgedeki her çıkış sınıfı komut (OUT/SET/RST/TMR/CNT/PLS/PLF/uygulama komutları/iç
  MC) "akım 0 gelmiş" gibi yürütülür; kontak türü fark etmez (LDI, INV, karşılaştırma kontağıyla sürülen OUT da 0). Tablodaki
  her satır bu kuralla örtüşür (genel zamanlayıcı akımsız sıfırlanır, birikimli korur, sayıcı saymaz, SET/RST yazmaz).
- VM: tarama başında bölge açıktır. `MC Nn` bölge açıkken koşulu 0 ise n seviyesinden itibaren kapatır; `MCR Nn`, kapalı
  seviye ≥ n ise bölgeyi yeniden açar (n ve daha derin seviyeler). Sıra bozuksa (`MC N1` içinde `MC N0`) `MCR N0` dıştaki
  bloğu da açar: simülatör bunu uyarıyla (`W_MC_ORDER`) çalıştırır. Çıkarım: kılavuz yalnızca "sırayla kullanın" diyor.
- Çıkarım: kenar belleği kapalı bölgede de güncellenir. Koşulu zaten 1 olan LDP blok açılınca tetiklenmez; ama P'li komut
  (INCP…), PLS ve CNT bobini kapalı bölgede akımı 0 gördüğü için blok açıldığında koşulu 1 ise bir kez tetiklenir. Aynı
  nedenle PLF, blok kapanırken önceki akımı 1 ise bir darbe üretir. Kılavuzda bu ayrıntı yok.
- Simülatör kararı: MC satırda tek çıkış olmalı (`E_MC_ALONE`); MCR tek başına bir satırdır, önünde kontak varsa `E_MCR_COND`.
  Eşleşmeyen MC (`E_MC_NO_MCR`, MC'nin satırında), MC'siz MCR (`E_MCR_NO_MC`) ve N0–N7 dışı (`E_MC_LEVEL`) programı
  engeller. İçteki MC kapanmadan dıştaki MCR gelirse içteki MC eşsiz sayılır.
- Çift bobin farklı MC bloklarında da uyarılır: kapalı bloktaki OUT da her taramada 0 yazdığından son yazan kazanır kuralı
  değişmez (kılavuz tablosundan çıkarım).
- v1 profili MC/MCR desteklemez (`E_UNSUPPORTED`).

## Sonraki adım (Aşama 3b) için
- CJ P0–P255: hedef etiket IL'de tek başına `P10` satırı; atlanan bölümde Y/M/S korunur, zamanlayıcılar durur (s.3-13, 3-41…44).
- STL S / RET: SET Sn sonraki adıma geçer ve öncekinin çıkışları kapanır (SET ile kurulanlar kalır); OUT Sn sıçrama; S0–S9 başlangıç adımları; M1040 geçişi engeller (s.5-2…5-10).
- SFTR/SFTL S D n1 n2: 1 ≤ n2 ≤ n1 ≤ 1024; genelde P biçimi (s.3-95/96).
- DCNT C200–C231: yön M1200+n (ON = aşağı); sınırda sarar; ayara ulaşınca kontak ON ama saymaya devam eder (s.2-25…27, 3-283).
