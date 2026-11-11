// Hazır örnek devreler (IL). Bu dosya tools/ornekler.cjs ile devreler/*.txt dosyalarından ÜRETİLİR; elle düzenleme.
// İlk V1_COUNT örnek v1 examples.js ile birebir aynıdır (eşdeğerlik testi); sonrakiler yalnızca yeni arayüzde görünür.

export interface Example {
  name: string;
  il: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    name: "Tahtadaki devre (fotoğraf)",
    il: "#X0 start\n#X1 stop\n; Dene: bir şeye basma; Y0 yanık başlar, 15 s sonra Y1 yanar. X0'a bas: Y0 ve Y1 söner.\n; X1'i 10 s basılı tut: Y2 yanar. (Tahtadan olduğu gibi alındı; fotoğraf kesik olduğu için devre yarım)\n; Start'a basınca M0 kurulur (SET)\nLD X0\nSET M0\n; M0 kapalı kontak (tahtada |/| çizili) -> Y0 ve T0 (15 s)\nLDI M0\nOUT Y0\nTMR T0 K150\n; T0 dolunca M0 sıfırlanır\nLD T0\nRST M0\n; T0 dolunca Y1 yanar\nLD T0\nOUT Y1\n; Stop: T0'ı sıfırla ve T1'i (10 s) çalıştır\nLD X1\nRST T0\nTMR T1 K100\n; T1 dolunca Y2 yanar ve T2 (20 s) başlar\nLD T1\nOUT Y2\nTMR T2 K200\n; T2 dolunca T1 sıfırlanır (fotoğrafın devamı kesik)\nLD T2\nRST T1\nEND",
  },
  {
    name: "Mühürleme (start-stop)",
    il: "#X0 start\n#X1 stop\n#Y0 motor\n; Dene: X0'a kısa bas; motor çalışır ve bırakınca da çalışmaya devam eder. X1 durdurur\n; Klasik mühürleme: Y0 kendi kontağıyla kendini tutar, stop (kapalı kontak) bırakır\nLD X0\nOR Y0\nANI X1\nOUT Y0\nEND",
  },
  {
    name: "SET / RST ile motor",
    il: "#X0 start\n#X1 stop\n#Y0 motor\n; Dene: X0 motoru çalıştırır, X1 durdurur. İkisine birlikte basarsan motor durur (RST sonra yazıldı)\n; Start motoru kurar\nLD X0\nSET Y0\n; Stop motoru sıfırlar (sonra yazılan satır öncelikli)\nLD X1\nRST Y0\nEND",
  },
  {
    name: "Yıldız-üçgen yol verme",
    il: "#X0 start\n#X1 stop\n#Y0 ana kontaktör\n#Y1 yıldız\n#Y2 üçgen\n; Dene: X0'a bas. Ana ve yıldız çeker; 5 s sonra yıldız bırakır, 0,5 s boşluktan sonra üçgen çeker. X1 durdurur\n; Çalışma rölesi M0 (mühürlemeli)\nLD X0\nOR M0\nANI X1\nOUT M0\n; M0 açıkken: Y0 ana; T0 5 s yıldız süresi, T1 5,5 s (0,5 s geçiş boşluğu); Y1 ve Y2 birbirinin kapalı kontağıyla kilitli\nLD M0\nMPS\nOUT Y0\nMRD\nTMR T0 K50\nMRD\nTMR T1 K55\nMRD\nANI T0\nANI Y2\nOUT Y1\nMPP\nAND T1\nANI Y1\nOUT Y2\nEND",
  },
  {
    name: "Trafik lambası (döngü)",
    il: "#Y0 kırmızı\n#Y1 sarı\n#Y2 yeşil\n; Dene: yalnızca RUN'a bas ve izle, giriş gerekmez\n; T0 kırmızı 5 s, T1 sarı 2 s, T2 yeşil 5 s; T2 dolunca hepsi sıfırlanıp döngü başa döner\nLDI T2\nTMR T0 K50\nLD T0\nTMR T1 K20\nLD T1\nTMR T2 K50\nLDI T0\nOUT Y0\nLD T0\nANI T1\nOUT Y1\nLD T1\nOUT Y2\nEND",
  },
  {
    name: "Sayıcı (5 parça)",
    il: "#X0 sensör\n#X1 reset\n#Y0 kutu dolu\n; Dene: X0'a 5 kez bas; beşincide Y0 yanar. X1 sayıcıyı sıfırlar\n; Her X0 basışında C0 bir artar; 5 olunca Y0 yanar\nLD X0\nCNT C0 K5\nLD C0\nOUT Y0\n; X1 sayıcıyı sıfırlar\nLD X1\nRST C0\nEND",
  },
  {
    name: "Tek butonla aç/kapa (PLS)",
    il: "#X0 buton\n#Y0 lamba\n; Dene: X0'a her basışta lamba durum değiştirir; basılı tutmak bir şey değiştirmez\n; X0'ın yükselen kenarında M0 tek tarama 1 olur\nLD X0\nPLS M0\n; Y0 = M0 XOR Y0  -> her basışta durum değişir (LD + ORB örneği)\nLD M0\nANI Y0\nLDI M0\nAND Y0\nORB\nOUT Y0\nEND",
  },
  {
    name: "Flaşör (M1013 1 s saat)",
    il: "#X0 anahtar\n#Y0 flaşör\n; Dene: X0'ı kilitle (sağ tık); lamba saniyede bir yanıp söner\n; M1013 özel rölesi 0,5 s açık / 0,5 s kapalı çakar\nLD X0\nAND M1013\nOUT Y0\nEND",
  },
  {
    name: "Üç motor sıralı kalkış",
    il: "#X0 start\n#X1 stop\n#Y0 motor 1\n#Y1 motor 2\n#Y2 motor 3\n; Dene: X0'a bas; motorlar 4 s arayla tek tek kalkar, X1 hepsini durdurur\n; Start ile M0 mühürlenir (kendi kontağıyla tutar), stop bırakır\nLD X0\nOR M0\nANI X1\nOUT M0\n; Motor 1 hemen kalkar, T0 4 s saymaya başlar\nLD M0\nOUT Y0\nTMR T0 K40\n; T0 doldu: motor 2 kalkar, T1 4 s sayar\nLD T0\nOUT Y1\nTMR T1 K40\n; T1 doldu: motor 3 kalkar. Stop'ta M0 düşer, üç motor aynı anda durur\nLD T1\nOUT Y2\nEND",
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
  {
    name: "SET/RST önceliği (son yazan kazanır)",
    il: "#X0 start\n#X1 stop\n#Y0 stop öncelikli\n#Y1 start öncelikli\n; Dene: X0 iki lambayı yakar, X1 söndürür; sonra ikisine birlikte bas\n; (birlikte basmak için X1'i sağ tıkla kilitle, sonra X0'a bas)\n; Aynı taramada hem SET hem RST çalışırsa programda SONRA yazılan kazanır\nLD X0\nSET Y0\n; Y0'da RST sonra yazıldı: ikisine birden basılınca Y0 SÖNER (stop öncelikli)\nLD X1\nRST Y0\n; Y1'de sıra ters: önce RST, sonra SET\nLD X1\nRST Y1\n; SET sonra yazıldı: ikisine birden basılınca Y1 YANAR (start öncelikli)\nLD X0\nSET Y1\nEND",
  },
  {
    name: "Alarm hafızası (SET ile kalıcı)",
    il: "#X2 kapı sensörü\n#X3 alarm reset\n#Y0 alarm lambası\n#Y1 kapı açık\n; Dene: X2'ye kısa bas; bırakınca da alarm yanık kalır, X3 söndürür\n; Kapı bir an açılsa bile SET alarmı hatırlar\nLD X2\nSET Y0\n; Reset butonu alarmı siler\nLD X3\nRST Y0\n; Karşılaştırma: OUT ile yapılan lamba sensör bırakılınca hemen söner (hafızası yok)\nLD X2\nOUT Y1\nEND",
  },
  {
    name: "Çağrı butonları, ortak sıfırlama",
    il: "#X0 oda 1 çağrı\n#X1 oda 2 çağrı\n#X2 oda 3 çağrı\n#X3 sıfırla\n#Y0 oda 1 lamba\n#Y1 oda 2 lamba\n#Y2 oda 3 lamba\n; Dene: X0, X1, X2'ye bas; lambalar yanık kalır, X3 hepsini söndürür\n; Oda 1 çağrısı: SET lambayı yakar ve tutar\nLD X0\nSET Y0\n; Oda 2 çağrısı\nLD X1\nSET Y1\n; Oda 3 çağrısı\nLD X2\nSET Y2\n; Tek butonla ortak sıfırlama: bir koşul, üç RST\nLD X3\nRST Y0\nRST Y1\nRST Y2\nEND",
  },
  {
    name: "SET ile çalış, süre dolunca RST",
    il: "#X0 start\n#X1 stop\n#Y0 motor\n; Dene: X0'a bir kez bas; motor 5 s çalışıp kendi durur, X1 erken durdurur\nLD X0\nSET Y0\n; Motor çalıştıkça T0 sayar (5 s)\nLD Y0\nTMR T0 K50\n; Süre dolunca ya da stop'a basılınca motor sıfırlanır\nLD T0\nOR X1\nRST Y0\nEND",
  },
  {
    name: "OUT mühürleme ile SET/RST karşılaştırma",
    il: "#X0 start\n#X1 stop\n#Y0 OUT ile\n#Y1 SET/RST ile\n; Dene: X0 ve X1'e bas; iki lamba aynı davranır: aynı iş, iki farklı yol\n; 1. yol: mühürleme. Y0 kendi kontağıyla kendini tutar, stop kapalı kontağı bırakır\nLD X0\nOR Y0\nANI X1\nOUT Y0\n; 2. yol: SET kurar ve tutar, RST siler. Mühürleme kontağına gerek yok\nLD X0\nSET Y1\nLD X1\nRST Y1\nEND",
  },
  {
    name: "Depo seviyesi: INCP/DECP ve karşılaştırma",
    il: "#X0 kutu girdi\n#X1 kutu çıktı\n#X2 sıfırla\n#Y0 depo dolu\n#Y1 depo boş\n#Y2 orta seviye\n; Dene: X0 her basışta D0'ı 1 artırır, X1 azaltır; İzleme'de D0'ı izle\n; INCP: yalnızca basışın yükselen kenarında bir kez +1 (P olmasa her taramada artardı)\nLD X0\nINCP D0\n; X1: bir kutu çıktı, D0 bir azalır\nLD X1\nDECP D0\n; X2: sayımı sıfırla (MOV ile D0'a 0 yaz)\nLD X2\nMOV K0 D0\n; Karşılaştırma kontağı: D0 ≥ 5 ise depo dolu\nLD>= D0 K5\nOUT Y0\n; D0 ≤ 0 ise depo boş\nLD<= D0 K0\nOUT Y1\n; 3 ile 4 arasında: iki karşılaştırma seri bağlı (VE)\nLD>= D0 K3\nAND< D0 K5\nOUT Y2\nEND",
  },
  {
    name: "Sayıcı değeri lambalarda (MOV C0 K1Y0)",
    il: "#X0 sayma\n#X1 sıfırla\n#Y0 bit 0 (1)\n#Y1 bit 1 (2)\n#Y2 bit 2 (4)\n#Y3 bit 3 (8)\n; Dene: X0'a basarak say; Y0–Y3 lambaları sayıyı ikilik gösterir, X1 sıfırlar\n; C0, 0'dan 15'e kadar sayar\nLD X0\nCNT C0 K15\n; Sayıcının değeri K1Y0'a, yani Y0–Y3 dört lambasına yazılır (ör. 5 = 0101: Y0 ve Y2)\nLD M1000\nMOV C0 K1Y0\n; Sıfırlama\nLD X1\nRST C0\nEND",
  },
  {
    name: "CMP ile sıcaklık kontrolü",
    il: "#X0 ısıt\n#X1 soğut\n#Y0 fan (sıcak)\n#Y1 hazır (tam)\n#Y2 ısıtıcı (soğuk)\n; Dene: X0 basılıyken sıcaklık D0 saniyede 1 artar, X1 azaltır; hedef 25\n; Başlangıçta (ilk tarama M1002) sıcaklık 20 olsun\nLD M1002\nMOV K20 D0\n; M1013 1 s saat; ANDP ile saniyede bir kez\nLD X0\nANDP M1013\nINC D0\nLD X1\nANDP M1013\nDEC D0\n; CMP: D0 ile 25'i karşılaştır → M10 büyük, M11 eşit, M12 küçük\nLD M1000\nCMP D0 K25 M10\n; Sonuç bitleri çıkışlara: sıcaksa fan, tamsa hazır, soğuksa ısıtıcı\nLD M10\nOUT Y0\nLD M11\nOUT Y1\nLD M12\nOUT Y2\nEND",
  },
  {
    name: "Gecikmeli kapanma (bırakınca 5 s)",
    il: "#X0 anahtar\n#Y0 lamba\n; Dene: X0'ı basılı tut, lamba hemen yanar. Bırak: lamba 5 s daha yanık kalır, sonra söner\n; Lamba anahtar basılıyken ya da kendi mührüyle yanar; T0 dolunca söner\nLD X0\nOR Y0\nANI T0\nOUT Y0\n; Anahtar bırakılınca (lamba yanık, X0 yok) T0 saymaya başlar (5 s)\nLD Y0\nANI X0\nTMR T0 K50\nEND",
  },
  {
    name: "İki zamanlayıcılı flaşör",
    il: "#X0 anahtar\n#Y0 lamba\n; Dene: X0'ı kilitle (sağ tık). Lamba 1 s sönük, 2 s yanık olarak yanıp söner\n; T0 sönük kalma süresini sayar (1 s). T1 dolunca T0 sıfırlanır ve döngü baştan başlar\nLD X0\nANI T1\nTMR T0 K10\n; T0 dolunca lamba yanar ve T1 yanık kalma süresini sayar (2 s)\nLD T0\nOUT Y0\nTMR T1 K20\nEND",
  },
  {
    name: "Kenar algılama (LDP / LDF)",
    il: "#X0 buton\n#Y1 bırakınca yanan lamba\n; Dene: X0'ı 1 s basılı tut ve bırak. D0 yüz kadar artar, D1 yalnızca 1 artar; bırakınca Y1 3 s yanar\n; Kenarsız: X0 basılı olduğu sürece HER TARAMADA çalışır\nLD X0\nINC D0\n; LDP (yükselen kenar): yalnızca basıldığı tek taramada kapanır\nLDP X0\nINC D1\n; LDF (düşen kenar): buton bırakıldığı tek taramada kapanır ve Y1'i kurar\nLDF X0\nSET Y1\n; Y1 yandıktan 3 s sonra kendini sıfırlar\nLD Y1\nTMR T0 K30\nLD T0\nRST Y1\nEND",
  },
  {
    name: "Tank: iki seviye sensörüyle pompa",
    il: "#X0 alt seviye sensörü\n#X1 üst seviye sensörü\n#Y0 doldurma pompası\n; Dene: sensör 1 ise su o seviyede demektir. Başta ikisi de 0: pompa çalışır\n; X0'ı, sonra X1'i kilitle (tank doldu): pompa durur. X1'i bırak: pompa hâlâ durur\n; X0'ı da bırak (su alt seviyenin altına indi): pompa yeniden çalışır\n; Su alt seviyenin altındaysa pompa kurulur\nLDI X0\nSET Y0\n; Su üst seviyeye ulaşınca pompa sıfırlanır\nLD X1\nRST Y0\nEND",
  },
  {
    name: "Ana şalter (MC / MCR)",
    il: "#X0 ana şalter\n#X1 motor 1 start\n#X2 motor 1 stop\n#X3 motor 2 start\n#X4 motor 2 stop\n#X5 lamba sıfırla\n#Y0 motor 1\n#Y1 motor 2\n#Y2 çalıştı lambası\n#Y3 3 s uyarısı\n; Dene: X0'ı kilitle (ana şalter açık). X1 motor 1'i, X3 motor 2'yi çalıştırır; X2 ve X4 durdurur. Motor 1 kalkınca Y2 yanar, 3 s sonra Y3\n; Motorlar çalışırken X0'ı bırak: Y0, Y1 ve Y3 söner, T0 sıfırlanır, SET ile yanan Y2 kalır (baranın yanındaki N0 çizgisi söner)\n; X0'ı yeniden kilitle: motorlar kendiliğinden kalkmaz, yeniden start iste. X5 Y2'yi söndürür\n; Ana şalter: X0 kapalıyken MC ile MCR arasındaki satırlara akım gitmez\nLD X0\nMC N0\n; Motor 1 mühürleme\nLD X1\nOR Y0\nANI X2\nOUT Y0\n; Motor 2 mühürleme\nLD X3\nOR Y1\nANI X4\nOUT Y1\n; Motor 1 kalkınca lamba kurulur (SET: ana şalter kapanınca da yanık kalır)\nLD Y0\nSET Y2\n; Motor 1 3 s çalışınca uyarı (genel zamanlayıcı: ana şalter kapanınca sıfırlanır)\nLD Y0\nTMR T0 K30\nLD T0\nOUT Y3\n; Blok sonu: buradan sonrası ana şaltere bağlı değil\nMCR N0\n; Lamba sıfırlama\nLD X5\nRST Y2\nEND",
  },
];

/** v1 arayüzüyle ortak örnek sayısı */
export const V1_COUNT = 19;
