// Gömülü / gizli tarayıcıyı taklit eder: localStorage erişimi hata atar, yerel diyaloglar çalışmaz.
// Uygulamadan ÖNCE yüklenir (bkz. tools/test-sayfalari.js).
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get() { throw new DOMException('Depolama erişimi engellendi', 'SecurityError'); },
});
window.prompt = () => null;
window.confirm = () => false;
window.alert = () => {};
