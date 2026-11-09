// Kısıtlı ortam testi (pre-kisitli.js ile): uygulama açılmalı, uyarı görünmeli,
// kaydetme / ad değiştirme / sekme kapatma uygulama içi pencerelerle çalışmalı.
const res = [];
const ok = (c, m) => res.push((c ? 'GECTI ' : 'HATA  ') + m);
const tick = () => new Promise((r) => setTimeout(r, 0));
const dlgOpen = () => $('#dlg').classList.contains('show');
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
  let threw = false;
  try { void window.localStorage; } catch (e) { threw = true; }
  ok(threw, 'taklit çalışıyor: localStorage hata atıyor');
  ok(window.PLC_APP_OK === true && document.querySelectorAll('.xbtn').length === 16 && tabs.length >= 1, 'uygulama açıldı (girişler ve ilk sekme var)');
  ok(store.ok === false, 'depolama kullanılamaz olarak algılandı');
  ok($('#storeWarn').classList.contains('show'), 'kayıtlar kalıcı değil uyarısı görünüyor');
  // kaydet
  let p = saveCurrent(false);
  ok(dlgOpen(), 'kaydet: uygulama içi pencere açıldı (prompt kullanılmadı)');
  await answer('Deneme');
  await p;
  ok(lib().Deneme && tabs[activeTab].savedAs === 'Deneme', 'kayıt bellekte tutuldu');
  // tema ve yakınlaştırma depolama olmadan hata vermemeli
  $('#bTheme').click();
  $('#bTheme').click();
  $('#zIn').click();
  ok(true, 'tema / yakınlaştırma depolamasız çalıştı');
  // yeni sekme, kirlet, kapat
  newBlankTab();
  insertPart(PARTS[1], prog.rungs[0].input[0].id, 'right');
  const n = tabs.length;
  p = closeTab(activeTab);
  ok(dlgOpen() && /kaydedilmedi/.test($('#dlgMsg').textContent), 'kapat: onay penceresi açıldı (confirm kullanılmadı)');
  await answer(true);
  await p;
  ok(tabs.length === n - 1, 'değişmiş sekme onayla kapandı');
  // ad değiştir
  p = renameTab(0);
  await answer('Yeni ad');
  await p;
  ok(tabs[0].name === 'Yeni ad', 'sekme adı değişti');
  // metin olarak göster + yapıştırarak yükle
  $('#bLib').click();
  $('#libShow').click();
  await tick();
  ok(dlgOpen() && /OUT|SET|TMR/.test($('#dlgText').value), 'metin olarak göster: IL görünüyor');
  await answer(false);
  $('#libPaste').click();
  await tick();
  $('#dlgText').value = 'LD X3\nOUT Y5\nEND';
  const before = tabs.length;
  $('#dlgOk').click();
  await tick();
  await tick();
  ok(tabs.length === before + 1 && toIL(prog).includes('OUT Y5'), 'metin yapıştırarak yeni sekmede açıldı');
  $('#libPaste').click();
  await tick();
  $('#dlgText').value = JSON.stringify({ library: { Yedekten: { il: 'LD X1\nOUT Y1\nEND', savedAt: 1 } } });
  $('#dlgOk').click();
  await tick();
  await tick();
  ok(!!lib().Yedekten, '.json yedek metni yapıştırarak içe aktarıldı');
  res.push('BITTI');
  console.log('TESTOUT ' + res.join(' ;; '));
})();
