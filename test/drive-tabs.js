// Sekme + kayıt testi: uygulama içi pencereler gerçek DOM üzerinden yanıtlanır.
// Sonuç console.log("TESTOUT ...") ile yazılır (headless Edge --enable-logging).
const res = [];
const ok = (c, m) => res.push((c ? 'GECTI ' : 'HATA  ') + m);
const tick = () => new Promise((r) => setTimeout(r, 0));
const dlgOpen = () => $('#dlg').classList.contains('show');
// Açık pencereye yanıt ver: metin (alanı doldur + Tamam), true (Tamam), false (Vazgeç)
async function answer(v) {
  await tick();
  if (!dlgOpen()) return false;
  if (v === false) $('#dlgCancel').click();
  else {
    if (typeof v === 'string') $('#dlgInput').value = v;
    $('#dlgOk').click();
  }
  await tick();
  return true;
}
(async () => {
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
    let p = saveCurrent(false);
    ok(dlgOpen() && $('#dlgInput').value === 'A', 'kaydet penceresi açıldı, ad önerildi');
    await answer('A'); await p;
    ok(lib().A && tabs[0].savedAs === 'A' && !isDirty(tabs[0]), 'kaydedildi, artık temiz');
    switchTab(1);
    p = saveCurrent(true); await answer('B kopya'); await p;
    ok(lib()['B kopya'] && tabs[1].name === 'B kopya', 'farklı kaydet çalıştı');
    // aynı adla kaydetmeye çalış (3. sekmede): üzerine yazma sorusu gelmeli, vazgeçince kayıt değişmemeli
    switchTab(2);
    const before = lib()['B kopya'].il;
    p = saveCurrent(false); await answer('B kopya');
    ok(dlgOpen() && /zaten var/.test($('#dlgMsg').textContent), 'aynı ad için üzerine yazma sorusu geldi');
    await answer(false); await p;
    ok(lib()['B kopya'].il === before && !tabs[2].savedAs, 'vazgeçince kayıt değişmedi');
    p = closeTab(2); await answer(true); await p;
    ok(tabs.length === 2 && activeTab === 1, 'sekme kapandı');
    p = closeTab(0); await p;
    ok(tabs.length === 1 && tabs[0].name === 'B kopya' && activeTab === 0 && prog.rungs.length === 2, 'kayıtlı sekme sorusuz kapandı, aktif doğru');
    // ad değiştir: önce Esc ile vazgeç, sonra gerçekten değiştir
    p = renameTab(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await p;
    ok(!dlgOpen() && tabs[0].name === 'B kopya', 'Esc ad değiştirmeyi iptal etti');
    p = renameTab(0); await answer('Yıldız'); await p;
    ok(tabs[0].name === 'Yıldız', 'sekme yeniden adlandırıldı');
    // kayıttan aç
    renderLib(); document.querySelector('[data-lopen="A"]').click();
    ok(tabs.length === 2 && tabs[1].savedAs === 'A' && prog.rungs[0].input.length === 3, 'kayıtlar penceresinden açıldı');
    sessionStorage.setItem('phase', '2');
    res.push('RELOAD');
    console.log('TESTOUT ' + res.join(' ;; '));
    setTimeout(() => location.reload(), 50);
    return;
  }
  ok(tabs.length === 2 && activeTab === 1 && tabs[1].name === 'A', 'yenileme sonrası sekmeler geri geldi');
  ok(prog.rungs[0].input.length === 3, 'yenileme sonrası aktif devre doğru');
  ok(Object.keys(lib()).length === 2, 'kayıtlar kalıcı');
  ok(!$('#storeWarn').classList.contains('show'), 'normal tarayıcıda depolama uyarısı yok');
  sessionStorage.removeItem('phase');
  newBlankTab(); insertPart(PARTS[4], selId);
  $('#bLib').click();
  res.push('BITTI');
  console.log('TESTOUT ' + res.join(' ;; '));
})();
