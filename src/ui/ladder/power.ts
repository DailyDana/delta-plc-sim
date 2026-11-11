// Canlı akım: kontakların kapalı/açık durumundan her telin enerjili olup olmadığını hesaplar.
// Kontak durumu sanal makinenin komut izinden (closed[]) gelir; böylece taramanın ortasında değişen
// cihazlar ve kenar kontakları (LDP/LDF) da gerçek PLC'deki gibi gösterilir.
//
// Değerlendirme IL'in yürütülüşüyle aynıdır: paralel dallar ve satır girişi kendi bloğunu (LD) başlatır,
// INV yalnızca kendi bloğunun o ana kadarki sonucunu ters çevirir. Çıkış dalının ön serisi ise
// dallanma noktasındaki sonuçla devam eder (MPS/AND), orada INV gelen akımı da ters çevirir.
//
// Ana kontrol (MC/MCR): MC ile kapatılmış bölgedeki satırların barası enerjisizdir. Hangi satırın kapalı
// bölgede yürütüldüğü yine VM izinden (mcClosed[]) gelir; satır barası anahtarı `<satır id>:rail`.

import type { Ladder, OutBranch, Rung, Series } from '../../core';

export type PowerMap = Map<string, boolean>;

/** railOf: satırın barası enerjili mi (verilmezse hep enerjili; MC'siz programlarda zaten öyle) */
export function computePower(l: Ladder, closedOf: (contactId: string) => boolean, railOf?: (r: Rung) => boolean): PowerMap {
  const pm: PowerMap = new Map();
  pm.set('1', true);
  /** Geçerli satırın barası: enerjisizse satırdaki hiçbir tel enerjilenmez (INV de akım üretemez; VM'de çıkış 0) */
  let live = true;
  /** local: seri kendi bloğunu başlatır (LD); değilse gelen sonuçla devam eder (AND) */
  const ser = (s: Series, pin: boolean, local: boolean): { p: boolean; v: boolean } => {
    let acc = local ? true : pin;
    const pw = (): boolean => live && (local ? pin && acc : acc);
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
  for (const r of l.rungs) {
    const rail = railOf ? railOf(r) : true;
    live = rail;
    pm.set(r.id + ':rail', rail);
    outs(r.outputs, r.input.length ? ser(r.input, rail, true).p : rail);
  }
  return pm;
}

/** Satırın ilk bobininin komut sırası (satırın komutları aynı MC bölgesinde yürütülür) */
function firstCoilInstr(r: Rung, instrOf: Map<string, number>): number | undefined {
  const walk = (list: OutBranch[]): number | undefined => {
    for (const o of list) {
      if (o.coil) {
        const i = instrOf.get(o.id);
        if (i !== undefined) return i;
      }
      if (o.children) {
        const i = walk(o.children);
        if (i !== undefined) return i;
      }
    }
    return undefined;
  };
  return walk(r.outputs);
}

/**
 * VM izinden satır barası: satırın komutları MC ile kapatılmış bölgede yürütüldüyse enerjisiz.
 * MC satırda tek çıkış olduğundan (E_MC_ALONE) bölge yalnızca satır sınırında değişir; bir komuta bakmak yeter.
 */
export function mcRailOf(instrOf: Map<string, number>, mcClosed: ArrayLike<number>): (r: Rung) => boolean {
  return (r) => {
    const i = firstCoilInstr(r, instrOf);
    return i === undefined || i >= mcClosed.length || mcClosed[i] !== 1;
  };
}
