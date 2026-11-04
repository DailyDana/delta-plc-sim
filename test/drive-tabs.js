// Sekme + kayıt testi. Sonuçlar <pre id="testout"> içine yazılır (headless --dump-dom ile okunur).
const res = [];
const ok = (c, m) => res.push((c ? 'GECTI ' : 'HATA  ') + m);
window.prompt = (msg, def) => (window.__promptAns !== undefined ? window.__promptAns : def);
window.confirm = () => true;
const phase = sessionStorage.getItem('phase') || '1';
if (phase === '1') {
  localStorage.clear();
  tabs = []; activeTab = 0;
  openInNewTab('A', PLC_EXAMPLES[1].il);
  openInNewTab('B', PLC_EXAMPLES[3].il);
  newBlankTab();
  ok(tabs.length === 3 && activeTab === 2, 'üç sekme açıldı, aktif son');
  ok(!isDirty(tabs[0]) && !isDirty(tabs[1]), 'yeni açılan sekmeler değişmiş görünmüyor');
  switchTab(0);
  ok(prog.rungs.length === 1 && prog.labels.Y0 === 'motor', 'A sekmesine geçince mühürleme yüklendi');
  insertPart(PARTS[0], prog.rungs[0].input[0].id, 'right');
  ok(isDirty(tabs[0]), 'değişiklik sonrası A kirli');
  switchTab(1); switchTab(0);
  ok(prog.rungs[0].input.length === 3, 'sekme değiştirip dönünce değişiklik duruyor');
  saveCurrent(false);
  ok(lib().A && tabs[0].savedAs === 'A' && !isDirty(tabs[0]), 'kaydedildi, artık temiz');
  window.__promptAns = 'B kopya'; switchTab(1); saveCurrent(true); window.__promptAns = undefined;
  ok(lib()['B kopya'] && tabs[1].name === 'B kopya', 'farklı kaydet çalıştı');
  closeTab(2);
  ok(tabs.length === 2 && activeTab === 1, 'sekme kapandı');
  closeTab(0);
  ok(tabs.length === 1 && tabs[0].name === 'B kopya' && activeTab === 0 && prog.rungs.length === 2, 'aktif olmayan önceki sekme kapanınca aktif doğru');
  // kayıttan aç
  renderLib(); document.querySelector('[data-lopen="A"]').click();
  ok(tabs.length === 2 && tabs[1].savedAs === 'A' && prog.rungs[0].input.length === 3, 'kayıtlar penceresinden açıldı');
  sessionStorage.setItem('phase', '2');
  res.push('RELOAD');
  setTimeout(() => location.reload(), 50);
} else {
  ok(tabs.length === 2 && activeTab === 1 && tabs[1].name === 'A', 'yenileme sonrası sekmeler geri geldi');
  ok(prog.rungs[0].input.length === 3, 'yenileme sonrası aktif devre doğru');
  ok(Object.keys(lib()).length === 2, 'kayıtlar kalıcı');
  sessionStorage.removeItem('phase');
  newBlankTab(); insertPart(PARTS[4], selId);
  $('#bLib').click();
  res.push('BITTI');
}
document.body.insertAdjacentHTML('beforeend', `<pre id="testout">${res.join('\n')}</pre>`);
console.log("TESTOUT " + res.join(" ;; "));
