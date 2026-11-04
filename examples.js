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
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = EXAMPLES;
  else G.PLC_EXAMPLES = EXAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
