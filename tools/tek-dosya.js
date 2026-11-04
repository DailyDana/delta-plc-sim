// Tek dosyalık sürüm üretir: plc-core.js, examples.js ve app.js'i index.html'in içine gömer.
// Çıktı zip'ten açılsa da tek başına gönderilse de çalışır.
// Kullanım (proje klasöründe):  node tools/tek-dosya.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of ['plc-core.js', 'examples.js', 'app.js']) {
  const tag = `<script src="${f}"></script>`;
  if (!html.includes(tag)) throw new Error(tag + ' index.html içinde bulunamadı');
  const js = fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script/gi, '<\/script');
  html = html.replace(tag, () => `<script>/* ${f} */\n${js}\n</script>`);
}
const outDir = path.join(root, 'dagitim');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'Delta-PLC-Simulator.html');
fs.writeFileSync(out, html);
console.log('Yazıldı:', out, Math.round(html.length / 1024) + ' KB');
