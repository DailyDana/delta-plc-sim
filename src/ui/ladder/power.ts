// Canlı akım: kontakların kapalı/açık durumundan her telin enerjili olup olmadığını hesaplar.
// Kontak durumu sanal makinenin komut izinden (closed[]) gelir; böylece taramanın ortasında değişen
// cihazlar ve kenar kontakları (LDP/LDF) da gerçek PLC'deki gibi gösterilir.
//
// Değerlendirme IL'in yürütülüşüyle aynıdır: paralel dallar ve satır girişi kendi bloğunu (LD) başlatır,
// INV yalnızca kendi bloğunun o ana kadarki sonucunu ters çevirir. Çıkış dalının ön serisi ise
// dallanma noktasındaki sonuçla devam eder (MPS/AND), orada INV gelen akımı da ters çevirir.

import type { Ladder, OutBranch, Series } from '../../core';

export type PowerMap = Map<string, boolean>;

export function computePower(l: Ladder, closedOf: (contactId: string) => boolean): PowerMap {
  const pm: PowerMap = new Map();
  pm.set('1', true);
  /** local: seri kendi bloğunu başlatır (LD); değilse gelen sonuçla devam eder (AND) */
  const ser = (s: Series, pin: boolean, local: boolean): { p: boolean; v: boolean } => {
    let acc = local ? true : pin;
    const pw = (): boolean => (local ? pin && acc : acc);
    for (const b of s) {
      pm.set(b.id + ':in', pw());
      if (b.t === 'c' && b.kind === 'INV') {
        acc = !acc;
        pm.set(b.id + ':closed', acc);
      } else if (b.t === 'c') {
        const c = closedOf(b.id);
        pm.set(b.id + ':closed', c);
        acc = acc && c;
      } else {
        const into = pw();
        let any = false;
        for (const br of b.branches) if (ser(br, into, true).v) any = true;
        acc = acc && any;
      }
      pm.set(b.id + ':out', pw());
    }
    return { p: pw(), v: acc };
  };
  const outs = (list: OutBranch[], pin: boolean): void => {
    for (const o of list) {
      const p = ser(o.pre, pin, false).p;
      pm.set(o.id + ':q', p);
      if (o.children) outs(o.children, p);
    }
  };
  for (const r of l.rungs) outs(r.outputs, r.input.length ? ser(r.input, true, true).p : true);
  return pm;
}
