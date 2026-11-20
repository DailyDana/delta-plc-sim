// Zaman diyagramı kaydı: motorun her taramasında cihaz değişimlerini PLC zamanıyla kaydeder.
//
// Kayıt kuralları (öğrenciye yardım metninde de anlatılır):
// - STOP→RUN (RUN, tek adım, advance, press): yeni kayıt başlar; PLC zamanı 0'dan sayar.
// - Duraklatınca ve STOP/güç kesmede kayıt silinmez, donar: durdurduktan sonra da incelenebilir.
//   Sonraki RUN yeni kayıt başlatır.
// - Çalışırken düzenleme: kayıt sürer (zaman devam eder); yeni cihazlar eklendikleri andan itibaren çizilir.
// - Başka devre (sekme/model değişimi, yeni yükleme): kayıt silinir.
// - "Temizle": kayıt silinir; motor çalışıyorsa o andan yeni kayıt başlar.
//
// Sıra simulate() ile aynıdır: X girişleri taramadan önce (taramanın başladığı anda), diğer cihazlar
// taramadan sonra (taramanın bittiği anda) örneklenir.

import { TraceRecorder, machineReader, recordableKeys, type Machine } from '../../core';
import { engine } from './engine';

export const recorder = new TraceRecorder();

let extra: string[] = [];
let compiledFor: Machine | null = null;
let readX: [string, () => number][] = [];
let readO: [string, () => number][] = [];

function compile(m: Machine): void {
  compiledFor = m;
  const keys = [...new Set([...recordableKeys(m), ...extra])];
  readX = [];
  readO = [];
  for (const k of keys) {
    const f = machineReader(m, k);
    if (!f) continue;
    (k[0] === 'X' ? readX : readO).push([k, f]);
    if (recorder.active && !recorder.has(k)) recorder.ensure(k, f());
  }
}

/** Seçimde olup programda geçmeyen cihazlar da kaydedilsin (ör. M1013) */
export function setExtraKeys(keys: string[]): void {
  const same = keys.length === extra.length && keys.every((k, i) => k === extra[i]);
  if (same) return;
  extra = [...keys];
  compiledFor = null;
  if (engine.machine && recorder.active) compile(engine.machine);
}

/** "Temizle": motor çalışıyorsa şimdiden yeni kayıt, değilse boş */
export function clearRecording(): void {
  const m = engine.machine;
  if (m && engine.live) beginAt(m, m.timeMs);
  else recorder.clear();
  engine.invalidate();
}

function beginAt(m: Machine, t: number): void {
  compile(m);
  const init: Record<string, number> = {};
  for (const [k, f] of readX) init[k] = f();
  for (const [k, f] of readO) init[k] = f();
  recorder.begin(t, init);
}

engine.addHooks({
  started(m) {
    compile(m);
    const init: Record<string, number> = {};
    // RUN başında girişler henüz okunmadı (X görüntüsü 0); basılı giriş ilk taramada yükselen kenar olur
    for (const [k] of readX) init[k] = 0;
    for (const [k, f] of readO) init[k] = f();
    recorder.begin(m.timeMs, init);
  },
  beforeScan(m) {
    if (!recorder.active) return;
    if (m !== compiledFor) compile(m);
    const t = m.timeMs;
    for (let i = 0; i < readX.length; i++) recorder.set(readX[i]![0], t, readX[i]![1]());
  },
  afterScan(m) {
    if (!recorder.active) return;
    if (m !== compiledFor) compile(m);
    const t = m.timeMs;
    for (let i = 0; i < readO.length; i++) recorder.set(readO[i]![0], t, readO[i]![1]());
    recorder.advance(t);
  },
  fresh() {
    recorder.clear();
    compiledFor = null;
  },
  loaded(m) {
    // çevrimiçi düzenleme: yeni makine, aynı zaman; okuyucular yeniden kurulur
    compiledFor = null;
    if (m && recorder.active) compile(m);
  },
});
