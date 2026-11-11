// Örnek devrelerin tek kaynağı devreler/*.txt dosyalarıdır. Bu betik onlardan iki listeyi üretir:
//   examples.js           (v1 arayüzü; yalnızca ilk V1_COUNT örnek)
//   src/core/examples.ts  (v2; hepsi)
// Kullanım:  node tools/ornekler.cjs          dosyaları yeniden yazar
//            node tools/ornekler.cjs --denetle  yazmadan karşılaştırır; fark varsa 1 ile çıkar
// Yeni örnek: devreler/NN-ad.txt yaz, aşağıdaki listeye SONA ekle (sıra değişirse #ornek=N bağlantıları kayar).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

/** v1 arayüzüyle ortak örnek sayısı: v1 motoru sonraki örneklerin komutlarını çalıştıramaz ya da listesi dondurulmuştur */
const V1_COUNT = 19;

const LIST = [
  ['01-tahtadaki-devre-fotograf', 'Tahtadaki devre (fotoğraf)'],
  ['02-muhurleme-start-stop', 'Mühürleme (start-stop)'],
  ['03-set-rst-ile-motor', 'SET / RST ile motor'],
  ['04-yildiz-ucgen-yol-verme', 'Yıldız-üçgen yol verme'],
  ['05-trafik-lambasi-dongu', 'Trafik lambası (döngü)'],
  ['06-sayici-5-parca', 'Sayıcı (5 parça)'],
  ['07-tek-butonla-ac-kapa-pls', 'Tek butonla aç/kapa (PLS)'],
  ['08-flasor-m1013-1-s-saat', 'Flaşör (M1013 1 s saat)'],
  ['09-uc-motor-sirali-kalkis', 'Üç motor sıralı kalkış'],
  ['10-konveyor-hatti-ters-sirali-durus', 'Konveyör hattı: sıralı kalkış, ters duruş'],
  ['11-ileri-geri-kilitleme', 'İleri-geri kilitleme (motor yönü)'],
  ['12-pompa-nobetlese', 'Pompa nöbetleşe (2 pompa)'],
  ['13-termik-ariza-durdurma', 'Termik arıza ile durdurma'],
  ['14-koli-sayma-paketleme', 'Koli sayma ve paketleme'],
  ['15-set-rst-oncelik', 'SET/RST önceliği (son yazan kazanır)'],
  ['16-alarm-hafizasi', 'Alarm hafızası (SET ile kalıcı)'],
  ['17-cagri-butonlari-ortak-sifirlama', 'Çağrı butonları, ortak sıfırlama'],
  ['18-set-rst-zamanli-durus', 'SET ile çalış, süre dolunca RST'],
  ['19-out-ile-set-rst-karsilastirma', 'OUT mühürleme ile SET/RST karşılaştırma'],
  ['20-depo-seviyesi-inc-dec-karsilastirma', 'Depo seviyesi: INCP/DECP ve karşılaştırma'],
  ['21-sayici-degeri-lambalarda-ikili', 'Sayıcı değeri lambalarda (MOV C0 K1Y0)'],
  ['22-cmp-ile-sicaklik-kontrolu', 'CMP ile sıcaklık kontrolü'],
  ['23-gecikmeli-kapanma', 'Gecikmeli kapanma (bırakınca 5 s)'],
  ['24-iki-zamanlayicili-flasor', 'İki zamanlayıcılı flaşör'],
  ['25-kenar-algilama-ldp-ldf', 'Kenar algılama (LDP / LDF)'],
  ['26-tank-iki-seviye-sensoru', 'Tank: iki seviye sensörüyle pompa'],
  ['27-ana-salter-mc-mcr', 'Ana şalter (MC / MCR)'],
];

const items = LIST.map(([file, name]) => ({
  name,
  il: fs.readFileSync(path.join(root, 'devreler', file + '.txt'), 'utf8').replace(/\r/g, '').trim(),
}));

function v1Text() {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const body = items
    .slice(0, V1_COUNT)
    .map((e) => `    {\n      name: '${e.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',\n      il: \`${esc(e.il)}\`,\n    },\n`)
    .join('');
  return (
    '// Hazır örnek devreler (IL / komut listesi biçiminde). "#X0 ad" satırları cihaz etiketidir.\n' +
    '(function (G) {\n  const EXAMPLES = [\n' +
    body +
    "  ];\n  if (typeof module !== 'undefined' && module.exports) module.exports = EXAMPLES;\n  else G.PLC_EXAMPLES = EXAMPLES;\n" +
    "})(typeof window !== 'undefined' ? window : globalThis);\n"
  );
}

function v2Text() {
  const body = items.map((e) => `  {\n    name: ${JSON.stringify(e.name)},\n    il: ${JSON.stringify(e.il)},\n  },\n`).join('');
  return (
    '// Hazır örnek devreler (IL). Bu dosya tools/ornekler.cjs ile devreler/*.txt dosyalarından ÜRETİLİR; elle düzenleme.\n' +
    '// İlk V1_COUNT örnek v1 examples.js ile birebir aynıdır (eşdeğerlik testi); sonrakiler yalnızca yeni arayüzde görünür.\n\n' +
    'export interface Example {\n  name: string;\n  il: string;\n}\n\n' +
    'export const EXAMPLES: readonly Example[] = [\n' +
    body +
    '];\n\n/** v1 arayüzüyle ortak örnek sayısı */\n' +
    `export const V1_COUNT = ${V1_COUNT};\n`
  );
}

const targets = [
  ['examples.js', v1Text()],
  ['src/core/examples.ts', v2Text()],
];
const check = process.argv.includes('--denetle');
let diff = 0;
for (const [rel, text] of targets) {
  const p = path.join(root, rel);
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r/g, '') : '';
  if (cur === text) continue;
  diff++;
  if (check) console.log('FARKLI: ' + rel + ' (node tools/ornekler.cjs ile yeniden üret)');
  else {
    fs.writeFileSync(p, text);
    console.log('yazıldı: ' + rel);
  }
}
if (!diff) console.log('örnek listeleri güncel (' + items.length + ' örnek)');
process.exit(check && diff ? 1 : 0);
