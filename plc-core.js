/*
 * Delta DVP PLC simülatörü — çekirdek
 * Program modeli, IL (komut listesi) <-> model dönüşümü ve tarama (scan) motoru.
 * Tarayıcıda window.PLC, Node'da module.exports olarak kullanılır.
 *
 * Model:
 *   program = { rungs: [Rung], labels: { X0: 'start', ... } }
 *   Rung    = { id, input: Series, outputs: [Output], comment }
 *   Series  = [Block]                       (seri bağlı bloklar)
 *   Block   = Kontak { t:'c', id, kind:'NO'|'NC'|'P'|'F', op:'X0' }
 *           | Paralel { t:'p', id, branches:[Series] }
 *   Output  = { id, pre: Series, coil: { type, op, k } }   (pre: çıkış dalındaki ek kontaklar)
 */
(function (G) {
  'use strict';

  // Kontak türü -> [LD biçimi, AND biçimi, OR biçimi]
  const CONTACT_IL = {
    NO: ['LD', 'AND', 'OR'],
    NC: ['LDI', 'ANI', 'ORI'],
    P: ['LDP', 'ANDP', 'ORP'],
    F: ['LDF', 'ANDF', 'ORF'],
  };
  const IL_CONTACT = {};
  for (const k in CONTACT_IL) CONTACT_IL[k].forEach((m, i) => (IL_CONTACT[m] = { kind: k, pos: i }));

  const COIL_TYPES = ['OUT', 'SET', 'RST', 'TMR', 'CNT', 'PLS', 'PLF'];

  let uid = 1;
  const nid = () => 'n' + uid++;
  const contact = (kind, op) => ({ t: 'c', id: nid(), kind, op });
  const par = (branches) => ({ t: 'p', id: nid(), branches });
  const coil = (type, op, k) => ({ type, op, k: k || '' });
  const output = (pre, c) => ({ id: nid(), pre: pre || [], coil: c });
  const rung = (input, outputs, comment) => ({ id: nid(), input: input || [], outputs: outputs || [], comment: comment || '' });

  // Derin kopya, yeni kimliklerle
  function cloneSeries(s) {
    return s.map((b) => (b.t === 'c' ? contact(b.kind, b.op) : par(b.branches.map(cloneSeries))));
  }

  // ---------------------------------------------------------------- adres denetimi
  const SPECIAL_M = {
    M1000: 'RUN sırasında hep 1 (normalde açık izleme)',
    M1001: 'RUN sırasında hep 0',
    M1002: 'RUN başında tek tarama 1 (ilk darbe)',
    M1003: 'RUN başında tek tarama 0',
    M1011: '10 ms saat darbesi',
    M1012: '100 ms saat darbesi',
    M1013: '1 s saat darbesi',
    M1014: '1 dk saat darbesi',
  };

  function timerBase(op) {
    const n = parseInt(op.slice(1), 10);
    if (n < 200) return 100; // T0–T199: 100 ms
    if (n < 240) return 10; // T200–T239: 10 ms
    return 1; // T240–T255: 1 ms
  }

  function parseK(k) {
    const m = /^K?(\d+)$/i.exec(String(k || '').trim());
    return m ? parseInt(m[1], 10) : NaN;
  }

  // Adres geçerli mi? Hata metni ya da '' döner. where: 'contact' veya bobin türü
  function checkOperand(op, where, k) {
    if (!op) return 'adres eksik';
    const m = /^([XYMSTC])(\d+)$/.exec(op);
    if (!m) return `"${op}" geçerli bir adres değil (X, Y, M, S, T, C + numara)`;
    const d = m[1], num = m[2], n = parseInt(num, 10);
    if (d === 'X' || d === 'Y') {
      if (/[89]/.test(num)) return `${op}: X/Y adresleri SEKİZLİK sayılır (X0–X7, X10–X17...). 8 ve 9 rakamı yoktur`;
      if (parseInt(num, 8) > 255) return `${op}: aralık dışı (en çok ${d}377)`;
    }
    if (d === 'M' && n > 4095) return `${op}: M0–M4095 arası olmalı`;
    if (d === 'S' && n > 1023) return `${op}: S0–S1023 arası olmalı`;
    if ((d === 'T' || d === 'C') && n > 255) return `${op}: ${d}0–${d}255 arası olmalı`;
    if (where === 'contact') return '';
    switch (where) {
      case 'OUT':
        if (d === 'X') return 'X girişi bobin olamaz (girişler dışarıdan gelir)';
        if (d === 'T' || d === 'C') return `${d} için OUT değil ${d === 'T' ? 'TMR' : 'CNT'} kullanılır`;
        if (SPECIAL_M[op]) return `${op} özel röledir, sadece okunur`;
        break;
      case 'SET':
      case 'PLS':
      case 'PLF':
        if (d === 'X') return 'X girişine yazılamaz';
        if (d === 'T' || d === 'C') return `${where} ${d} ile kullanılmaz`;
        break;
      case 'RST':
        if (d === 'X') return 'X girişine yazılamaz';
        break;
      case 'TMR':
        if (d !== 'T') return 'TMR yalnızca T zamanlayıcı ile kullanılır (ör. TMR T0 K50)';
        if (!(parseK(k) >= 1 && parseK(k) <= 32767)) return 'TMR için K değeri 1–32767 olmalı';
        break;
      case 'CNT':
        if (d !== 'C') return 'CNT yalnızca C sayıcı ile kullanılır (ör. CNT C0 K5)';
        if (n >= 200) return 'C200–C255 32 bit sayıcılardır (DCNT); burada C0–C199 kullan';
        if (!(parseK(k) >= 1 && parseK(k) <= 32767)) return 'CNT için K değeri 1–32767 olmalı';
        break;
    }
    return '';
  }

  // Programdaki tüm adres hatalarını listele
  function validate(prog) {
    const out = [];
    const coilTargets = {};
    prog.rungs.forEach((r, ri) => {
      const walk = (s) =>
        s.forEach((b) => {
          if (b.t === 'c') {
            const e = checkOperand(b.op, 'contact');
            if (e) out.push({ rung: ri, id: b.id, msg: e });
          } else b.branches.forEach(walk);
        });
      walk(r.input);
      if (r.outputs.length === 0) out.push({ rung: ri, id: r.id, msg: 'Satırda çıkış (bobin) yok' });
      r.outputs.forEach((o) => {
        walk(o.pre);
        const e = checkOperand(o.coil.op, o.coil.type, o.coil.k);
        if (e) out.push({ rung: ri, id: o.id, msg: e });
        if (o.coil.type === 'OUT' || o.coil.type === 'TMR' || o.coil.type === 'CNT') {
          (coilTargets[o.coil.op] = coilTargets[o.coil.op] || []).push(ri);
        }
      });
    });
    for (const op in coilTargets) {
      if (coilTargets[op].length > 1)
        out.push({
          rung: coilTargets[op][1],
          id: null,
          warn: true,
          msg: `${op} birden çok satırda bobin olarak kullanılmış (çift bobin): son yazan satır kazanır`,
        });
    }
    return out;
  }

  // ---------------------------------------------------------------- model -> IL
  function contactLine(c, pos) {
    return CONTACT_IL[c.kind][pos] + ' ' + c.op;
  }

  function genSeries(series, out, mode) {
    series.forEach((b, j) => {
      const first = j === 0 && mode === 'load';
      if (b.t === 'c') out.push(contactLine(b, first ? 0 : 1));
      else {
        genPar(b, out);
        if (!first) out.push('ANB');
      }
    });
  }

  function genPar(p, out) {
    p.branches.forEach((br, k) => {
      if (k > 0 && br.length === 1 && br[0].t === 'c') out.push(contactLine(br[0], 2));
      else {
        genSeries(br, out, 'load');
        if (k > 0) out.push('ORB');
      }
    });
  }

  function coilLine(c) {
    if (c.type === 'TMR' || c.type === 'CNT') {
      const k = parseK(c.k);
      return `${c.type} ${c.op} K${isNaN(k) ? '?' : k}`;
    }
    return `${c.type} ${c.op}`;
  }

  function toIL(prog) {
    const lines = [];
    const labels = prog.labels || {};
    Object.keys(labels)
      .filter((k) => labels[k])
      .forEach((k) => lines.push(`#${k} ${labels[k]}`));
    if (lines.length) lines.push('');
    prog.rungs.forEach((r, i) => {
      if (r.comment) r.comment.split('\n').forEach((c) => lines.push('; ' + c));
      else lines.push(`; --- satır ${i + 1}`);
      if (r.input.length === 0) lines.push('LD M1000');
      else genSeries(r.input, lines, 'load');
      const anyPre = r.outputs.some((o) => o.pre.length);
      if (!anyPre || r.outputs.length === 1) {
        r.outputs.forEach((o) => {
          genSeries(o.pre, lines, 'and');
          lines.push(coilLine(o.coil));
        });
      } else {
        const last = r.outputs.length - 1;
        r.outputs.forEach((o, i2) => {
          lines.push(i2 === 0 ? 'MPS' : i2 === last ? 'MPP' : 'MRD');
          genSeries(o.pre, lines, 'and');
          lines.push(coilLine(o.coil));
        });
      }
    });
    lines.push('END');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- IL -> model
  function orCombine(a, b) {
    const bBranches = b.length === 1 && b[0].t === 'p' ? b[0].branches : [b];
    if (a.length === 1 && a[0].t === 'p') {
      a[0].branches.push(...bBranches);
      return a;
    }
    return [par([a, ...bBranches])];
  }

  function parseIL(text) {
    const rungs = [], labels = {}, errors = [];
    let stack = [], outputs = [], input = null, phase = 'A';
    let mps = false, mppSeen = false, base = null, lastWasOutput = false;
    let pendingComment = [], rungComment = '';

    function resetRung() {
      stack = []; outputs = []; input = null; phase = 'A';
      mps = false; mppSeen = false; base = null; lastWasOutput = false; rungComment = '';
    }
    function finalize(lineNo) {
      if (phase === 'A' && stack.length === 0) return;
      if (outputs.length === 0) errors.push({ line: lineNo, msg: 'Çıkışı (bobini) olmayan satır atlandı' });
      else {
        if (mps && !mppSeen) errors.push({ line: lineNo, msg: 'MPS açıldı ama MPP ile kapatılmadı', warn: true });
        rungs.push(rung(input, outputs, rungComment));
      }
      resetRung();
    }
    function toPhaseB(lineNo) {
      if (phase === 'B') return true;
      if (stack.length !== 1) {
        errors.push({ line: lineNo, msg: stack.length === 0 ? 'Önce LD ile başlamalı' : 'Açık blok kaldı: ORB/ANB eksik' });
        return false;
      }
      input = stack[0];
      stack = [[]];
      phase = 'B';
      return true;
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      let raw = lines[i].trim();
      if (!raw) continue;
      if (raw[0] === '#') {
        const m = /^#\s*([XYMSTC]\d+)\s*[=:]?\s*(.*)$/i.exec(raw);
        if (m) labels[m[1].toUpperCase()] = m[2].trim();
        continue;
      }
      if (raw[0] === ';' || raw.startsWith('//')) {
        const c = raw.replace(/^(;|\/\/)\s*/, '');
        if (!/^---/.test(c)) pendingComment.push(c);
        continue;
      }
      raw = raw.replace(/(;|\/\/).*$/, '').trim();
      if (!raw) continue;
      const tok = raw.split(/[\s,]+/);
      const m = tok[0].toUpperCase();
      const arg = (tok[1] || '').toUpperCase();
      const k = tok[2] || '';
      if (m === 'END') break;
      if (m === 'NOP') continue;

      if (IL_CONTACT[m]) {
        const { kind, pos } = IL_CONTACT[m];
        const e = checkOperand(arg, 'contact');
        if (e) errors.push({ line: lineNo, msg: e, warn: true });
        const c = contact(kind, arg);
        if (pos === 0) {
          if (lastWasOutput) finalize(lineNo);
          if (phase === 'A' && stack.length === 0) {
            rungComment = pendingComment.join('\n');
            pendingComment = [];
          }
          stack.push([c]);
        } else if (stack.length === 0) {
          errors.push({ line: lineNo, msg: `${m}: önce LD ile başlamalı` });
        } else if (pos === 1) {
          stack[stack.length - 1].push(c);
        } else {
          if (phase === 'B' && stack.length === 1) {
            errors.push({ line: lineNo, msg: `${m}: çıkıştan sonra OR bu simülatörde desteklenmiyor; paralel kısmı LD...ORB bloğu yap` });
          } else {
            stack[stack.length - 1] = orCombine(stack[stack.length - 1], [c]);
          }
        }
        lastWasOutput = false;
        continue;
      }

      if (m === 'ANB' || m === 'ORB') {
        const minDepth = phase === 'B' ? 2 : 2;
        if (stack.length < minDepth) {
          errors.push({ line: lineNo, msg: `${m}: birleştirilecek iki blok yok (her blok LD ile başlar)` });
          continue;
        }
        const b = stack.pop(), a = stack.pop();
        if (m === 'ANB') stack.push(a.concat(b));
        else {
          if (phase === 'B' && stack.length === 0) {
            errors.push({ line: lineNo, msg: 'ORB: çıkış dalında ana bloğa OR desteklenmiyor' });
            stack.push(a);
            continue;
          }
          stack.push(a.length === 0 ? b : orCombine(a, b));
        }
        lastWasOutput = false;
        continue;
      }

      if (m === 'MPS' || m === 'MRD' || m === 'MPP') {
        if (m === 'MPS') {
          if (!toPhaseB(lineNo)) continue;
          if (mps) {
            errors.push({ line: lineNo, msg: 'İç içe MPS bu simülatörde desteklenmiyor' });
            continue;
          }
          if (stack.length !== 1) {
            errors.push({ line: lineNo, msg: 'MPS öncesi açık blok var (ANB/ORB eksik)' });
            continue;
          }
          mps = true;
          base = stack[0];
          stack = [cloneSeries(base)];
        } else {
          if (!mps || mppSeen) {
            errors.push({ line: lineNo, msg: `${m}: önce MPS gerekir` });
            continue;
          }
          stack = [cloneSeries(base)];
          if (m === 'MPP') mppSeen = true;
        }
        lastWasOutput = false;
        continue;
      }

      if (COIL_TYPES.includes(m)) {
        const e = checkOperand(arg, m, k);
        if (e) errors.push({ line: lineNo, msg: e, warn: true });
        if (!toPhaseB(lineNo)) continue;
        if (stack.length !== 1) {
          errors.push({ line: lineNo, msg: `${m} öncesi açık blok var (ANB/ORB eksik)` });
          continue;
        }
        const kk = m === 'TMR' || m === 'CNT' ? String(parseK(k)) : '';
        outputs.push(output(cloneSeries(stack[0]), coil(m, arg, kk)));
        lastWasOutput = true;
        continue;
      }

      errors.push({ line: lineNo, msg: `Bilinmeyen komut: ${tok[0]}` });
    }
    finalize(lines.length);
    return { prog: { rungs, labels }, errors };
  }

  // ---------------------------------------------------------------- tarama motoru
  class Sim {
    constructor() {
      this.reset();
    }
    reset() {
      this.bits = {}; // X, Y, M, S
      this.T = {}; // zamanlayıcılar
      this.C = {}; // sayıcılar
      this.edge = {}; // kenar algılama belleği (komut başına)
      this.vis = {}; // çizim için son tarama durumları
      this.scan = 0;
      this.timeMs = 0;
    }
    get(op) {
      switch (op) {
        case 'M1000': return true;
        case 'M1001': return false;
        case 'M1002': return this.scan === 0;
        case 'M1003': return this.scan !== 0;
        case 'M1011': return Math.floor(this.timeMs / 5) % 2 === 1;
        case 'M1012': return Math.floor(this.timeMs / 50) % 2 === 1;
        case 'M1013': return Math.floor(this.timeMs / 500) % 2 === 1;
        case 'M1014': return Math.floor(this.timeMs / 30000) % 2 === 1;
      }
      const d = op[0];
      if (d === 'T') return !!(this.T[op] && this.T[op].done);
      if (d === 'C') return !!(this.C[op] && this.C[op].done);
      return !!this.bits[op];
    }
    evalContact(c) {
      const v = this.get(c.op);
      const prev = this.edge[c.id];
      this.edge[c.id] = v;
      switch (c.kind) {
        case 'NO': return v;
        case 'NC': return !v;
        case 'P': return v && prev === false;
        case 'F': return !v && prev === true;
      }
      return false;
    }
    evalSeries(series, pin) {
      let p = pin;
      for (const b of series) p = this.evalBlock(b, p);
      return p;
    }
    evalBlock(b, pin) {
      if (b.t === 'c') {
        const closed = this.evalContact(b);
        const out = pin && closed;
        this.vis[b.id] = { pin, closed, out };
        return out;
      }
      let out = false;
      for (const br of b.branches) if (this.evalSeries(br, pin)) out = true;
      this.vis[b.id] = { pin, out };
      return out;
    }
    execCoil(o, q, dt) {
      const c = o.coil, op = c.op;
      switch (c.type) {
        case 'OUT':
          this.bits[op] = q;
          break;
        case 'SET':
          if (q) this.bits[op] = true;
          break;
        case 'RST':
          if (q) {
            if (op[0] === 'T') this.T[op] = Object.assign(this.T[op] || {}, { acc: 0, cv: 0, done: false });
            else if (op[0] === 'C') this.C[op] = Object.assign(this.C[op] || {}, { cv: 0, done: false });
            else this.bits[op] = false;
          }
          break;
        case 'TMR': {
          const t = this.T[op] || (this.T[op] = { acc: 0, cv: 0, done: false });
          const k = parseK(c.k);
          t.sv = k;
          t.base = timerBase(op);
          if (q) {
            t.acc = Math.min(t.acc + dt, k * t.base);
            t.cv = Math.floor(t.acc / t.base + 1e-9);
            t.done = t.cv >= k;
          } else {
            t.acc = 0; t.cv = 0; t.done = false;
          }
          break;
        }
        case 'CNT': {
          const t = this.C[op] || (this.C[op] = { cv: 0, done: false });
          const k = parseK(c.k);
          t.sv = k;
          const prev = this.edge[o.id];
          this.edge[o.id] = q;
          if (q && !prev && t.cv < k) t.cv++;
          t.done = t.cv >= k;
          break;
        }
        case 'PLS': {
          const prev = this.edge[o.id];
          this.edge[o.id] = q;
          this.bits[op] = q && !prev;
          break;
        }
        case 'PLF': {
          const prev = this.edge[o.id];
          this.edge[o.id] = q;
          this.bits[op] = !q && prev === true;
          break;
        }
      }
    }
    // Tek tarama: dt = bu taramanın simüle edilen süresi (ms)
    runScan(prog, dt) {
      this.vis = {};
      for (const r of prog.rungs) {
        const p = this.evalSeries(r.input, true);
        this.vis[r.id] = { out: p };
        for (const o of r.outputs) {
          const q = this.evalSeries(o.pre, p);
          this.vis[o.id] = { pin: q };
          this.execCoil(o, q, dt);
        }
      }
      this.scan++;
      this.timeMs += dt;
    }
  }

  const API = {
    CONTACT_IL, IL_CONTACT, COIL_TYPES, SPECIAL_M,
    contact, par, coil, output, rung, cloneSeries,
    checkOperand, validate, timerBase, parseK,
    toIL, parseIL, Sim,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else G.PLC = API;
})(typeof window !== 'undefined' ? window : globalThis);
