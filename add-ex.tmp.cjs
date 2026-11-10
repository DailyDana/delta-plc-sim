// Yeni örnekleri devreler/*.txt dosyalarından iki listeye (v1 examples.js, v2 examples.ts) aynı metinle ekler.
const fs = require('fs');
const items = [
  ['09-uc-motor-sirali-kalkis.txt', 'Üç motor sıralı kalkış'],
  ['10-konveyor-hatti-ters-sirali-durus.txt', 'Konveyör hattı: sıralı kalkış, ters duruş'],
  ['11-ileri-geri-kilitleme.txt', 'İleri-geri kilitleme (motor yönü)'],
  ['12-pompa-nobetlese.txt', 'Pompa nöbetleşe (2 pompa)'],
  ['13-termik-ariza-durdurma.txt', 'Termik arıza ile durdurma'],
  ['14-koli-sayma-paketleme.txt', 'Koli sayma ve paketleme'],
].map(([f, name]) => ({ name, il: fs.readFileSync('devreler/' + f, 'utf8').replace(/\r/g, '').trim() }));
for (const it of items) if (/[`$\]/.test(it.il)) throw new Error('şablon için güvensiz karakter: ' + it.name);

let js = fs.readFileSync('examples.js', 'utf8');
const jsAnchor = '\n  ];\n  if (typeof module';
if (!js.includes(jsAnchor)) throw new Error('examples.js çapası yok');
const jsAdd = items.map((e) => `\n    {\n      name: ${JSON.stringify(e.name).replace(/^"|"$/g, "'")},\n      il: \`${e.il}\`,\n    },`).join('');
js = js.replace(jsAnchor, jsAdd + jsAnchor);
fs.writeFileSync('examples.js', js);

let ts = fs.readFileSync('src/core/examples.ts', 'utf8');
const tsAnchor = '\n];\n';
const at = ts.lastIndexOf(tsAnchor);
const tsAdd = items.map((e) => `\n  {\n    name: ${JSON.stringify(e.name)},\n    il: ${JSON.stringify(e.il)},\n  },`).join('');
ts = ts.slice(0, at) + tsAdd + ts.slice(at);
fs.writeFileSync('src/core/examples.ts', ts);

const v1 = require('./examples.js');
console.log(v1.length, v1.slice(-6).map((e) => e.name));
