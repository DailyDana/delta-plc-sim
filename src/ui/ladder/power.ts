// Canlı akım: kontakların kapalı/açık durumundan her telin enerjili olup olmadığını hesaplar.
// Kontak durumu sanal makinenin komut izinden (closed[]) gelir; böylece taramanın ortasında değişen
// cihazlar ve kenar kontakları (LDP/LDF) da gerçek PLC'deki gibi gösterilir.

import type { Ladder, OutBranch, Series } from '../../core';

export type PowerMap = Map<string, boolean>;

export function computePower(l: Ladder, closedOf: (contactId: string) => boolean): PowerMap {
  const pm: PowerMap = new Map();
  pm.set('1', true);
  const ser = (s: Series, pin: boolean): boolean => {
    let cur = pin;
    for (const b of s) {
      pm.set(b.id + ':in', cur);
      if (b.t === 'c') {
        const c = closedOf(b.id);
        pm.set(b.id + ':closed', c);
        cur = cur && c;
      } else {
        let any = false;
        for (const br of b.branches) if (ser(br, cur)) any = true;
        cur = any;
      }
      pm.set(b.id + ':out', cur);
    }
    return cur;
  };
  const outs = (list: OutBranch[], pin: boolean): void => {
    for (const o of list) {
      const p = ser(o.pre, pin);
      pm.set(o.id + ':q', p);
      if (o.children) outs(o.children, p);
    }
  };
  for (const r of l.rungs) outs(r.outputs, r.input.length ? ser(r.input, true) : true);
  return pm;
}
