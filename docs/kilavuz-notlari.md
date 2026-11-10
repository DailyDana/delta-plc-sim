# Delta DVP-ES2 kılavuz notları (simülatörün doğruluk kaynağı)

Kaynak: *DVP-ES2/EX2/SS2/SA2/SX2/SE&TP Operation Manual – Programming* (Delta). Sayfa numaraları kılavuzun basılı numaralarıdır.
Simülatörde uygulanan davranış ve dayanağı. "Çıkarım" yazanlar kılavuzda açıkça yazmayan, şekil ya da örnekten çıkarılan kararlardır.

## Genel
- D öneki 32 bit, P soneki darbe: yalnızca sürücü akımın yükselen kenarında bir tarama yürütülür (s.3-15, 3-17). P'siz komut her taramada yürütülür.
- Yürütülmeyen komutun hedefi ve bayrakları korunur (s.3-18, 3-61).
- 32 bit çift: D0 düşük, D1 yüksek kelime (s.3-17). T ve 16 bit C değerleri de kelime olarak kullanılır.
- K: −32768…32767 (16 bit), H0000…HFFFF; 32 bitte −2147483648…2147483647 (s.2-9).
- Bayraklar: M1020 sıfır, M1021 borç, M1022 elde (s.3-18). Hata: M1067 işlem hatası, M1068 kilit, D1067 hata kodu, D1068 adres (s.2-58).

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

## Sonraki adım (Aşama 3b) için
- MC N0–N7 / MCR: etkin değilken genel zamanlayıcı sıfırlanır, birikimli zamanlayıcı ve sayıcı korunur, OUT bobinleri OFF, SET/RST olduğu gibi, uygulama komutları çalışmaz; en çok 8 seviye (s.3-10/11).
- CJ P0–P255: hedef etiket IL'de tek başına `P10` satırı; atlanan bölümde Y/M/S korunur, zamanlayıcılar durur (s.3-13, 3-41…44).
- STL S / RET: SET Sn sonraki adıma geçer ve öncekinin çıkışları kapanır (SET ile kurulanlar kalır); OUT Sn sıçrama; S0–S9 başlangıç adımları; M1040 geçişi engeller (s.5-2…5-10).
- SFTR/SFTL S D n1 n2: 1 ≤ n2 ≤ n1 ≤ 1024; genelde P biçimi (s.3-95/96).
- DCNT C200–C231: yön M1200+n (ON = aşağı); sınırda sarar; ayara ulaşınca kontak ON ama saymaya devam eder (s.2-25…27, 3-283).
