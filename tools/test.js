// Tüm testleri tek komutla çalıştırır: node tools/test.js
//  1) çekirdek testleri (node test/test-core.js)
//  2) test/*.html sayfalarını yeniden üretir (tools/test-sayfalari.js)
//  3) tarayıcı testlerini headless Edge'de açar, sonuçları Edge günlüğündeki "TESTOUT" satırlarından okur
// Edge, PowerShell Start-Process ile başlatılır (Git Bash / doğrudan başlatmada sessizce çıktı vermiyor).
// Her sayfa yeni bir profil klasörüyle açılır; aynı profil kilitli kalırsa Edge hiçbir şey yazmıyor.
// Çıkış kodu: hata varsa 1.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// sayfa → beklenen: ok satırı en az kaç olmalı (eksik çalışmayı yakalamak için)
const PAGES = { 'drag.html': 14, 'tabs.html': 19, 'kisitli.html': 13, 'api.html': 22 };

let failed = false;
const say = (s) => process.stdout.write(s + '\n');

say('== çekirdek testleri');
const core = spawnSync(process.execPath, [path.join(root, 'test', 'test-core.js')], { encoding: 'utf8' });
const coreOut = (core.stdout || '') + (core.stderr || '');
say(coreOut.trim().split('\n').filter((l) => /HATA|geçti|BAŞARISIZ/.test(l)).join('\n'));
if (core.status !== 0) failed = true;

spawnSync(process.execPath, [path.join(root, 'tools', 'test-sayfalari.js')], { encoding: 'utf8' });

function runPage(page) {
  const ud = path.join(os.tmpdir(), `plc-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const url = 'file:///' + path.join(root, 'test', page).replace(/\\/g, '/');
  const args = ['--headless', `--user-data-dir=${ud}`, '--enable-logging', '--v=0', '--window-size=1600,900', '--virtual-time-budget=8000', url]
    .map((a) => `'${a.replace(/'/g, "''")}'`)
    .join(',');
  spawnSync('pwsh', ['-NoProfile', '-Command', `Start-Process -FilePath '${EDGE}' -ArgumentList @(${args}) -Wait`], { encoding: 'utf8', timeout: 90000 });
  const log = path.join(ud, 'chrome_debug.log');
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { /* Edge dosyayı hâlâ tutuyorsa sonra temizlenir */ }
  const lines = text.split('\n').filter((l) => !l.includes('chrome-extension'));
  const outs = lines.filter((l) => l.includes('TESTOUT')).map((l) => {
    const m = /"TESTOUT (.*)", source:/.exec(l);
    return m ? m[1] : '';
  });
  const errs = lines.filter((l) => /Uncaught/.test(l)).map((l) => l.replace(/^.*CONSOLE[^\]]*\] /, ''));
  return { outs, errs };
}

for (const [page, min] of Object.entries(PAGES)) {
  let r = runPage(page);
  if (!r.outs.length) r = runPage(page); // Edge ilk açılışta bazen günlük yazmıyor: bir kez daha dene
  const items = r.outs.join(' ;; ').split(' ;; ').map((s) => s.trim()).filter(Boolean);
  const pass = items.filter((s) => s.startsWith('GECTI'));
  const fail = items.filter((s) => s.startsWith('HATA'));
  const okPage = !fail.length && !r.errs.length && pass.length >= min;
  say(`== ${page}: ${pass.length} geçti, ${fail.length} hata${r.errs.length ? `, ${r.errs.length} yakalanmamış istisna` : ''}${pass.length < min ? ` (beklenen en az ${min})` : ''} ${okPage ? '✓' : '✗'}`);
  fail.forEach((s) => say('   ' + s));
  r.errs.slice(0, 5).forEach((s) => say('   ' + s.slice(0, 300)));
  if (!okPage) failed = true;
}

say(failed ? '\nSONUÇ: BAŞARISIZ' : '\nSONUÇ: tüm testler geçti');
process.exit(failed ? 1 : 0);
