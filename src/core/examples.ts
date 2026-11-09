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
];
