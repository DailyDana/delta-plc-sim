// Hazır örnek devreler (IL). v1 examples.js ile aynı içerik; Aşama 2 ile tek kaynak burası olacak.

export interface Example {
  name: string;
  il: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    name: "Tahtadaki devre (fotoğraf)",
    il: "#X0 start\n#X1 stop\n; Start'a basınca M0 kurulur (SET)\nLD X0\nSET M0\n; M0 kapalı kontak (tahtada |/| çizili) -> Y0 ve T0 (15 s)\nLDI M0\nOUT Y0\nTMR T0 K150\n; T0 dolunca M0 sıfırlanır\nLD T0\nRST M0\n; T0 dolunca Y1 yanar\nLD T0\nOUT Y1\n; Stop: T0'ı sıfırla ve T1'i (10 s) çalıştır\nLD X1\nRST T0\nTMR T1 K100\n; T1 dolunca Y2 yanar ve T2 (20 s) başlar\nLD T1\nOUT Y2\nTMR T2 K200\n; T2 dolunca T1 sıfırlanır (fotoğrafın devamı kesik)\nLD T2\nRST T1\nEND",
  },
  {
    name: "Mühürleme (start-stop)",
    il: "#X0 start\n#X1 stop\n#Y0 motor\n; Klasik mühürleme: Y0 kendi kontağıyla kendini tutar, stop (kapalı kontak) bırakır\nLD X0\nOR Y0\nANI X1\nOUT Y0\nEND",
  },
  {
    name: "SET / RST ile motor",
    il: "#X0 start\n#X1 stop\n#Y0 motor\n; Start motoru kurar\nLD X0\nSET Y0\n; Stop motoru sıfırlar (sonra yazılan satır öncelikli)\nLD X1\nRST Y0\nEND",
  },
  {
    name: "Yıldız-üçgen yol verme",
    il: "#X0 start\n#X1 stop\n#Y0 ana kontaktör\n#Y1 yıldız\n#Y2 üçgen\n; Çalışma rölesi M0 (mühürlemeli)\nLD X0\nOR M0\nANI X1\nOUT M0\n; M0 açıkken: Y0 ana, T0 5 s, önce yıldız sonra üçgen\nLD M0\nMPS\nOUT Y0\nMRD\nTMR T0 K50\nMRD\nANI T0\nOUT Y1\nMPP\nAND T0\nOUT Y2\nEND",
  },
  {
    name: "Trafik lambası (döngü)",
    il: "#Y0 kırmızı\n#Y1 sarı\n#Y2 yeşil\n; T0 kırmızı 5 s, T1 sarı 2 s, T2 yeşil 5 s; T2 dolunca hepsi sıfırlanıp döngü başa döner\nLDI T2\nTMR T0 K50\nLD T0\nTMR T1 K20\nLD T1\nTMR T2 K50\nLDI T0\nOUT Y0\nLD T0\nANI T1\nOUT Y1\nLD T1\nOUT Y2\nEND",
  },
  {
    name: "Sayıcı (5 parça)",
    il: "#X0 sensör\n#X1 reset\n#Y0 kutu dolu\n; Her X0 basışında C0 bir artar; 5 olunca Y0 yanar\nLD X0\nCNT C0 K5\nLD C0\nOUT Y0\n; X1 sayıcıyı sıfırlar\nLD X1\nRST C0\nEND",
  },
  {
    name: "Tek butonla aç/kapa (PLS)",
    il: "#X0 buton\n#Y0 lamba\n; X0'ın yükselen kenarında M0 tek tarama 1 olur\nLD X0\nPLS M0\n; Y0 = M0 XOR Y0  -> her basışta durum değişir (LD + ORB örneği)\nLD M0\nANI Y0\nLDI M0\nAND Y0\nORB\nOUT Y0\nEND",
  },
  {
    name: "Flaşör (M1013 1 s saat)",
    il: "#X0 anahtar\n#Y0 flaşör\n; M1013 özel rölesi 0,5 s açık / 0,5 s kapalı çakar\nLD X0\nAND M1013\nOUT Y0\nEND",
  },
  {
    name: "Üç motor sıralı kalkış",
    il: "#X0 start\n#X1 stop\n#Y0 motor 1\n#Y1 motor 2\n#Y2 motor 3\n; Dene: X0'a bas; motorlar 4 s arayla tek tek kalkar, X1 hepsini durdurur\n; Start ile M0 mühürlenir (kendi kontağıyla tutar), stop bırakır\nLD X0\nOR M0\nANI X1\nOUT M0\n; Motor 1 hemen kalkar, T0 4 s saymaya başlar\nLD M0\nOUT Y0\nTMR T0 K40\n; T0 doldu: motor 2 kalkar, T1 4 s sayar\nLD T0\nOUT Y1\nTMR T1 K40\n; T1 doldu: motor 3 kalkar. Stop'ta M0 düşer, zincir sondan geriye çözülür\nLD T1\nOUT Y2\nEND",
  },
  {
    name: "Konveyör hattı: sıralı kalkış, ters duruş",
    il: "#X0 start\n#X1 stop\n#Y0 bant 1 besleme\n#Y1 bant 2\n#Y2 bant 3 çıkış\n; Dene: X0 → bantlar sondan başa kalkar; X1 → baştan sona durur (3 s arayla)\n; Start: çalışma isteği (M0) kurulur, duruş süreci (M1) iptal edilir\nLD X0\nSET M0\nRST M1\n; Stop: çalışma isteği (M0) silinir, duruş süreci (M1) başlar\nLD X1\nRST M0\nSET M1\n; Kalkış çıkıştan başlar: malzeme yığılmasın diye önce bant 3 döner\nLD M0\nSET Y2\nTMR T0 K30\n; 3 s sonra bant 2\nLD T0\nSET Y1\nTMR T1 K30\n; 3 s sonra bant 1 (besleme) en son kalkar\nLD T1\nSET Y0\n; Duruş önce beslemeden: bant 1 hemen durur, üstündeki malzeme boşalsın\nLD M1\nRST Y0\nTMR T2 K30\n; 3 s sonra bant 2 durur\nLD T2\nRST Y1\nTMR T3 K30\n; 3 s sonra bant 3 durur ve duruş süreci biter\nLD T3\nRST Y2\nRST M1\nEND",
  },
  {
    name: "İleri-geri kilitleme (motor yönü)",
    il: "#X0 ileri\n#X1 stop\n#X2 geri\n#Y0 ileri (K1)\n#Y1 geri (K2)\n; Dene: X0 ileri, X2 geri, X1 stop; motor dönerken ters butona da bas\n; İki yön asla aynı anda açılmaz: karşı yönün kapalı kontağı (Y1) seri bağlı\nLD X0\nOR Y0\nANI X1\nANI X2\nANI Y1\nOUT Y0\n; Geri yön: ileri satırının aynısı; X0 buton kilidi, Y0 kontaktör kilidi\nLD X2\nOR Y1\nANI X1\nANI X0\nANI Y0\nOUT Y1\nEND",
  },
  {
    name: "Pompa nöbetleşe (2 pompa)",
    il: "#X0 talep\n#X1 yüksek talep\n#Y0 pompa 1\n#Y1 pompa 2\n; Dene: X0'ı sağ tıkla kilitle, tekrar sağ tıkla bırak; X1 yüksek talep\n; Her talep bitince (X0 düşen kenarı) M1 bir tarama 1 olur, sıra öbür pompaya geçer\nLDF X0\nOUT M1\n; Talep bitince (düşen kenar) sıra değişir: M10 0 ise kur, 1 ise sil\nLD M1\nANI M10\nOUT M2\nLD M1\nAND M10\nOUT M3\nLD M2\nSET M10\nLD M3\nRST M10\n; Sıra M10 = 0: pompa 1; yüksek talepte pompa 1 de yardım eder\nLD X0\nANI M10\nOR X1\nOUT Y0\n; Sıra M10 = 1: pompa 2; yüksek talepte pompa 2 de çalışır\nLD X0\nAND M10\nOR X1\nOUT Y1\nEND",
  },
  {
    name: "Termik arıza ile durdurma",
    il: "#X0 start\n#X1 stop\n#X2 termik attı\n#X3 arıza reset\n#Y0 motor 1\n#Y1 motor 2\n#Y5 arıza lambası\n; Dene: X0 çalıştır, X2 termik atar; lamba yanıp söner, X3 ile onayla\n; Termik atınca arıza belleği M5 kurulur (X2 bırakılsa da kalır)\nLD X2\nSET M5\n; Reset ancak termik düzelmişse (X2 bırakılmışsa) arızayı siler\nLD X3\nANI X2\nRST M5\n; Stop ya da arıza mühürlemeyi bırakır; arıza sürerken start işlemez\nLD X0\nOR M0\nANI X1\nANI M5\nOUT M0\n; Motor 1 hemen, motor 2 3 s sonra kalkar (kalkış akımları çakışmasın)\nLD M0\nOUT Y0\nTMR T0 K30\nLD T0\nOUT Y1\n; Arıza lambası 1 s saatle (M1013) yanıp söner\nLD M5\nAND M1013\nOUT Y5\nEND",
  },
  {
    name: "Koli sayma ve paketleme",
    il: "#X0 start\n#X1 stop\n#X2 şişe sensörü\n#Y0 konveyör\n#Y1 paketleme\n; Dene: X0 hattı çalıştırır; X2'ye 6 kez bas, koli dolunca paketleme 3 s\n; Paketlemede konveyör durur, bitince kendiliğinden yeniden döner\nLD X0\nOR M0\nANI X1\nOUT M0\n; Konveyör, hat çalışırken ve paketleme yokken döner\nLD M0\nANI Y1\nOUT Y0\n; Konveyör dönerken geçen her şişe sayılır (6 şişe = 1 koli)\nLD X2\nAND Y0\nCNT C0 K6\n; Koli doldu: paketleme motoru 3 s çalışır\nLD C0\nOUT Y1\nTMR T0 K30\n; Süre bitti ya da stop: sayıcı sıfırlanır, konveyör yeniden döner\nLD T0\nOR X1\nRST C0\nEND",
  },
];
