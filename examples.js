// Hazır örnek devreler (IL / komut listesi biçiminde). "#X0 ad" satırları cihaz etiketidir.
(function (G) {
  const EXAMPLES = [
    {
      name: 'Tahtadaki devre (fotoğraf)',
      il: `#X0 start
#X1 stop
; Start'a basınca M0 kurulur (SET)
LD X0
SET M0
; M0 kapalı kontak (tahtada |/| çizili) -> Y0 ve T0 (15 s)
LDI M0
OUT Y0
TMR T0 K150
; T0 dolunca M0 sıfırlanır
LD T0
RST M0
; T0 dolunca Y1 yanar
LD T0
OUT Y1
; Stop: T0'ı sıfırla ve T1'i (10 s) çalıştır
LD X1
RST T0
TMR T1 K100
; T1 dolunca Y2 yanar ve T2 (20 s) başlar
LD T1
OUT Y2
TMR T2 K200
; T2 dolunca T1 sıfırlanır (fotoğrafın devamı kesik)
LD T2
RST T1
END`,
    },
    {
      name: 'Mühürleme (start-stop)',
      il: `#X0 start
#X1 stop
#Y0 motor
; Klasik mühürleme: Y0 kendi kontağıyla kendini tutar, stop (kapalı kontak) bırakır
LD X0
OR Y0
ANI X1
OUT Y0
END`,
    },
    {
      name: 'SET / RST ile motor',
      il: `#X0 start
#X1 stop
#Y0 motor
; Start motoru kurar
LD X0
SET Y0
; Stop motoru sıfırlar (sonra yazılan satır öncelikli)
LD X1
RST Y0
END`,
    },
    {
      name: 'Yıldız-üçgen yol verme',
      il: `#X0 start
#X1 stop
#Y0 ana kontaktör
#Y1 yıldız
#Y2 üçgen
; Çalışma rölesi M0 (mühürlemeli)
LD X0
OR M0
ANI X1
OUT M0
; M0 açıkken: Y0 ana, T0 5 s, önce yıldız sonra üçgen
LD M0
MPS
OUT Y0
MRD
TMR T0 K50
MRD
ANI T0
OUT Y1
MPP
AND T0
OUT Y2
END`,
    },
    {
      name: 'Trafik lambası (döngü)',
      il: `#Y0 kırmızı
#Y1 sarı
#Y2 yeşil
; T0 kırmızı 5 s, T1 sarı 2 s, T2 yeşil 5 s; T2 dolunca hepsi sıfırlanıp döngü başa döner
LDI T2
TMR T0 K50
LD T0
TMR T1 K20
LD T1
TMR T2 K50
LDI T0
OUT Y0
LD T0
ANI T1
OUT Y1
LD T1
OUT Y2
END`,
    },
    {
      name: 'Sayıcı (5 parça)',
      il: `#X0 sensör
#X1 reset
#Y0 kutu dolu
; Her X0 basışında C0 bir artar; 5 olunca Y0 yanar
LD X0
CNT C0 K5
LD C0
OUT Y0
; X1 sayıcıyı sıfırlar
LD X1
RST C0
END`,
    },
    {
      name: 'Tek butonla aç/kapa (PLS)',
      il: `#X0 buton
#Y0 lamba
; X0'ın yükselen kenarında M0 tek tarama 1 olur
LD X0
PLS M0
; Y0 = M0 XOR Y0  -> her basışta durum değişir (LD + ORB örneği)
LD M0
ANI Y0
LDI M0
AND Y0
ORB
OUT Y0
END`,
    },
    {
      name: 'Flaşör (M1013 1 s saat)',
      il: `#X0 anahtar
#Y0 flaşör
; M1013 özel rölesi 0,5 s açık / 0,5 s kapalı çakar
LD X0
AND M1013
OUT Y0
END`,
    },
    {
      name: 'Üç motor sıralı kalkış',
      il: `#X0 start
#X1 stop
#Y0 motor 1
#Y1 motor 2
#Y2 motor 3
; Dene: X0'a bas; motorlar 4 s arayla tek tek kalkar, X1 hepsini durdurur
; Start ile M0 mühürlenir (kendi kontağıyla tutar), stop bırakır
LD X0
OR M0
ANI X1
OUT M0
; Motor 1 hemen kalkar, T0 4 s saymaya başlar
LD M0
OUT Y0
TMR T0 K40
; T0 doldu: motor 2 kalkar, T1 4 s sayar
LD T0
OUT Y1
TMR T1 K40
; T1 doldu: motor 3 kalkar. Stop'ta M0 düşer, üç motor aynı anda durur
LD T1
OUT Y2
END`,
    },
    {
      name: 'Konveyör hattı: sıralı kalkış, ters duruş',
      il: `#X0 start
#X1 stop
#Y0 bant 1 besleme
#Y1 bant 2
#Y2 bant 3 çıkış
; Dene: X0 → bantlar sondan başa kalkar; X1 → baştan sona durur (3 s arayla)
; Start: çalışma isteği (M0) kurulur, duruş süreci (M1) iptal edilir
LD X0
SET M0
RST M1
; Stop: çalışma isteği (M0) silinir, duruş süreci (M1) başlar
LD X1
RST M0
SET M1
; Kalkış çıkıştan başlar: malzeme yığılmasın diye önce bant 3 döner
LD M0
SET Y2
TMR T0 K30
; 3 s sonra bant 2
LD T0
SET Y1
TMR T1 K30
; 3 s sonra bant 1 (besleme) en son kalkar
LD T1
SET Y0
; Duruş önce beslemeden: bant 1 hemen durur, üstündeki malzeme boşalsın
LD M1
RST Y0
TMR T2 K30
; 3 s sonra bant 2 durur
LD T2
RST Y1
TMR T3 K30
; 3 s sonra bant 3 durur ve duruş süreci biter
LD T3
RST Y2
RST M1
END`,
    },
    {
      name: 'İleri-geri kilitleme (motor yönü)',
      il: `#X0 ileri
#X1 stop
#X2 geri
#Y0 ileri (K1)
#Y1 geri (K2)
; Dene: X0 ileri, X2 geri, X1 stop; motor dönerken ters butona da bas
; İki yön asla aynı anda açılmaz: karşı yönün kapalı kontağı (Y1) seri bağlı
LD X0
OR Y0
ANI X1
ANI X2
ANI Y1
OUT Y0
; Geri yön: ileri satırının aynısı; X0 buton kilidi, Y0 kontaktör kilidi
LD X2
OR Y1
ANI X1
ANI X0
ANI Y0
OUT Y1
END`,
    },
    {
      name: 'Pompa nöbetleşe (2 pompa)',
      il: `#X0 talep
#X1 yüksek talep
#Y0 pompa 1
#Y1 pompa 2
; Dene: X0'ı sağ tıkla kilitle, tekrar sağ tıkla bırak; X1 yüksek talep
; Her talep bitince (X0 düşen kenarı) M1 bir tarama 1 olur, sıra öbür pompaya geçer
LDF X0
OUT M1
; Talep bitince (düşen kenar) sıra değişir: M10 0 ise kur, 1 ise sil
LD M1
ANI M10
OUT M2
LD M1
AND M10
OUT M3
LD M2
SET M10
LD M3
RST M10
; Sıra M10 = 0: pompa 1; yüksek talepte pompa 1 de yardım eder
LD X0
ANI M10
OR X1
OUT Y0
; Sıra M10 = 1: pompa 2; yüksek talepte pompa 2 de çalışır
LD X0
AND M10
OR X1
OUT Y1
END`,
    },
    {
      name: 'Termik arıza ile durdurma',
      il: `#X0 start
#X1 stop
#X2 termik attı
#X3 arıza reset
#Y0 motor 1
#Y1 motor 2
#Y5 arıza lambası
; Dene: X0 çalıştır, X2 termik atar; lamba yanıp söner, X3 ile onayla
; Termik atınca arıza belleği M5 kurulur (X2 bırakılsa da kalır)
LD X2
SET M5
; Reset ancak termik düzelmişse (X2 bırakılmışsa) arızayı siler
LD X3
ANI X2
RST M5
; Stop ya da arıza mühürlemeyi bırakır; arıza sürerken start işlemez
LD X0
OR M0
ANI X1
ANI M5
OUT M0
; Motor 1 hemen, motor 2 3 s sonra kalkar (kalkış akımları çakışmasın)
LD M0
OUT Y0
TMR T0 K30
LD T0
OUT Y1
; Arıza lambası 1 s saatle (M1013) yanıp söner
LD M5
AND M1013
OUT Y5
END`,
    },
    {
      name: 'Koli sayma ve paketleme',
      il: `#X0 start
#X1 stop
#X2 şişe sensörü
#Y0 konveyör
#Y1 paketleme
; Dene: X0 hattı çalıştırır; X2'ye 6 kez bas, koli dolunca paketleme 3 s
; Paketlemede konveyör durur, bitince kendiliğinden yeniden döner
LD X0
OR M0
ANI X1
OUT M0
; Konveyör, hat çalışırken ve paketleme yokken döner
LD M0
ANI Y1
OUT Y0
; Konveyör dönerken geçen her şişe sayılır (6 şişe = 1 koli)
LD X2
AND Y0
CNT C0 K6
; Koli doldu: paketleme motoru 3 s çalışır
LD C0
OUT Y1
TMR T0 K30
; Süre bitti ya da stop: sayıcı sıfırlanır, konveyör yeniden döner
LD T0
OR X1
RST C0
END`,
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = EXAMPLES;
  else G.PLC_EXAMPLES = EXAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
