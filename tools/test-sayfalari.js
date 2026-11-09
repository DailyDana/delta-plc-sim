// test/*.html sayfalarını index.html'den üretir (betik yolları ../, geçiş animasyonları kapalı).
// Sayfalar headless Edge ile açılır; sonuçlar console.log("TESTOUT ...") olarak yazılır.
// Kullanım: node tools/test-sayfalari.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// değer: sürücü dosyası ya da { driver, pre } — pre, uygulamadan önce <head> başında yüklenir
// (ör. kısıtlı tarayıcı taklidi: localStorage hata atsın, prompt çalışmasın)
const pages = {
  'drag.html': 'drive-drag.js', 'drag-dark.html': 'drive-drag.js', 'tabs.html': 'drive-tabs.js',
  'pano.html': 'drive-pano.js', 'shot0.html': 'drive.js', 'shot1.html': 'drive.js', 'shot3.html': 'drive.js', 'shot6.html': 'drive.js',
  'kisitli.html': { driver: 'drive-kisitli.js', pre: 'pre-kisitli.js' },
  'dlg.html': { driver: 'drive-dlg.js', pre: 'pre-kisitli.js' },
};
for (const [page, spec] of Object.entries(pages)) {
  const driver = typeof spec === 'string' ? spec : spec.driver;
  const pre = typeof spec === 'string' ? '' : `\n<script src="${spec.pre}"></script>`;
  const out = html
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">' + pre)
    .replace('<script src="plc-core.js">', '<script src="../plc-core.js">')
    .replace('<script src="examples.js">', '<script src="../examples.js">')
    .replace('<script src="app.js"></script>', `<script src="../app.js"></script><script src="${driver}"></script>`)
    .replace('</style>', '  * { transition: none !important; }\n</style>');
  fs.writeFileSync(path.join(root, 'test', page), out);
}
console.log(Object.keys(pages).length + ' test sayfası yazıldı');
