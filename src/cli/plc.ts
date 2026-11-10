// Komut satırı aracı: tarayıcı açmadan devre denetleme, simülasyon, çizim ve paylaşım bağlantısı.
// Kullanım: npm run plc -- <komut> [dosya] [seçenekler]   (ya da: npx tsx src/cli/plc.ts ...)

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  EXAMPLES,
  PROFILES,
  checkIl,
  drawLadderText,
  getProfile,
  ilToLadder,
  ladderToIl,
  parseEvents,
  shareLink,
  simulate,
  writeIl,
  type Change,
  type Diagnostic,
} from '../core/index';

const HELP = `Delta PLC Simülatör — komut satırı

  plc kontrol <dosya>            tanılama, özet; --il ile normalleştirilmiş IL
  plc sim <dosya> --olay "0:X0=1 100:X0=0" --sure 6s [--izle Y0,T0] [--adim 10] [--dalga] [--json]
  plc ciz <dosya>                ladder'ı metin olarak çiz
  plc link <dosya> [--ad ad] [--run] [--yerel]   devreyi açan bağlantı
  plc ornek [n]                  örnekleri listele / n. örneğin IL'ini yaz

  <dosya> yerine:  -e "LD X0\\nOUT Y0"  (satır içi IL)  ya da  -  (stdin)  ya da  ornek:3
  Ortak: --model <${Object.keys(PROFILES).join('|')}>
  Olay biçimi: <zaman>:<giriş>=<0|1>, zaman ms ya da "1.5s"; ör. "0:X0=1 200:X0=0 6s:X1=1"
`;

interface Args {
  cmd: string;
  pos: string[];
  opt: Record<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const opt: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-e') opt.e = argv[++i] ?? '';
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && !['run', 'yerel', 'dalga', 'json', 'il'].includes(k)) {
        opt[k] = next;
        i++;
      } else opt[k] = true;
    } else pos.push(a);
  }
  return { cmd: pos.shift() ?? 'yardim', pos, opt };
}

function readSource(a: Args): { text: string; name: string } {
  if (typeof a.opt.e === 'string') return { text: a.opt.e.replace(/\\n/g, '\n'), name: 'satır içi' };
  const f = a.pos[0];
  if (!f) throw new Error('Dosya verilmedi (ya da -e "LD X0\\nOUT Y0")');
  if (f === '-') return { text: readFileSync(0, 'utf8'), name: 'stdin' };
  const m = /^ornek:(\d+)$/.exec(f);
  if (m) {
    const ex = EXAMPLES[parseInt(m[1]!, 10) - 1];
    if (!ex) throw new Error(`Örnek yok: ${f} (1–${EXAMPLES.length})`);
    return { text: ex.il, name: ex.name };
  }
  return { text: readFileSync(f, 'utf8'), name: f };
}

const fmtDiag = (d: Diagnostic): string => `  ${d.severity === 'error' ? 'HATA ' : 'uyarı'} satır ${d.line ?? '?'}  ${d.code}  ${d.message}`;

function parseDuration(s: string | true | undefined, def: number): number {
  if (typeof s !== 'string') return def;
  const m = /^(\d+(?:\.\d+)?)(ms|s|dk)?$/.exec(s.trim());
  if (!m) throw new Error(`Süre anlaşılamadı: ${s} (ör. 6s, 1500, 2dk)`);
  const v = parseFloat(m[1]!);
  return m[2] === 's' ? v * 1000 : m[2] === 'dk' ? v * 60000 : v;
}

function cmdKontrol(a: Args, profileId: string | undefined): number {
  const { text, name } = readSource(a);
  const profile = getProfile(profileId);
  const r = checkIl(text, profile);
  const conv = ilToLadder(r.program);
  const errs = r.diagnostics.filter((d) => d.severity === 'error');
  const warns = r.diagnostics.filter((d) => d.severity === 'warning');
  console.log(`${name}: ${r.rungs.length} satır, ${r.program.instrs.length} komut  (model: ${profile.id})`);
  if (!r.diagnostics.length) console.log('  ✓ hata yok');
  r.diagnostics.forEach((d) => console.log(fmtDiag(d)));
  conv.diagnostics.filter((d) => d.code.startsWith('L_')).forEach((d) => console.log(fmtDiag(d)));
  if (!conv.ladder) console.log('  (ladder\'a çevrilemiyor; program IL olarak çalışır)');
  if (a.opt.il) {
    console.log('\n' + (conv.ladder ? ladderToIl(conv.ladder) : writeIl(r.program)));
  }
  console.log(`\nÖzet: ${errs.length} hata, ${warns.length} uyarı`);
  return errs.length ? 1 : 0;
}

function waveform(changes: Change[], devs: string[], duration: number, width = 64): string {
  const lines: string[] = [];
  const pad = Math.max(...devs.map((d) => d.length));
  for (const d of devs) {
    const cs = changes.filter((c) => c.dev === d);
    let row = '';
    for (let i = 0; i < width; i++) {
      const t = ((i + 0.5) / width) * duration;
      let v = 0;
      for (const c of cs) if (c.t <= t) v = c.v;
      row += v ? '█' : '▁';
    }
    lines.push(`${d.padEnd(pad)} ${row}`);
  }
  const scale = `${' '.repeat(pad)} 0${' '.repeat(width - 2 - String(duration / 1000).length - 1)}${duration / 1000}s`;
  return [...lines, scale].join('\n');
}

function cmdSim(a: Args, profileId: string | undefined): number {
  const { text, name } = readSource(a);
  const duration = parseDuration(a.opt.sure, 10000);
  const dt = parseDuration(a.opt.adim, 10);
  const events = typeof a.opt.olay === 'string' ? parseEvents(a.opt.olay) : [];
  const opts: Parameters<typeof simulate>[1] = { events, duration, dt };
  if (profileId) opts.profile = profileId;
  if (typeof a.opt.izle === 'string') opts.watch = a.opt.izle.split(/[\s,]+/).filter(Boolean).map((s) => s.toUpperCase());
  const r = simulate(text, opts);
  if (a.opt.json) {
    console.log(JSON.stringify(r, null, 2));
    return r.ok ? 0 : 1;
  }
  if (!r.final) {
    console.log(`${name}: çalıştırılamadı`);
    r.diagnostics.forEach((d) => console.log(fmtDiag(d)));
    return 1;
  }
  r.diagnostics.forEach((d) => console.log(fmtDiag(d)));
  console.log(`${name}: ${(duration / 1000).toFixed(2)} s, ${r.scans} tarama (${dt} ms)\n`);
  if (!r.changes.length) console.log('  (hiçbir izlenen cihaz değişmedi)');
  let lastT = -1;
  for (const c of r.changes) {
    const tt = c.t === lastT ? ''.padStart(9) : `${(c.t / 1000).toFixed(3)} s`.padStart(9);
    console.log(`${tt}  ${c.dev} ${c.dev[0] === 'D' ? '= ' + c.v : c.v ? '↑ 1' : '↓ 0'}`);
    lastT = c.t;
  }
  if (a.opt.dalga) {
    const devs = [...new Set(r.changes.map((c) => c.dev))];
    if (devs.length) console.log('\n' + waveform(r.changes, devs, duration));
  }
  console.log('\nSon durum: ' + Object.entries(r.final).map(([k, v]) => `${k}=${v}`).join('  '));
  return r.ok ? 0 : 1;
}

function cmdCiz(a: Args, profileId: string | undefined): number {
  const { text } = readSource(a);
  const r = checkIl(text, getProfile(profileId));
  const conv = ilToLadder(r.program);
  r.diagnostics.forEach((d) => console.log(fmtDiag(d)));
  if (!conv.ladder) {
    conv.diagnostics.forEach((d) => console.log(fmtDiag(d)));
    return 1;
  }
  console.log(drawLadderText(conv.ladder));
  return r.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}

function cmdLink(a: Args): number {
  const { text, name } = readSource(a);
  const opts: Parameters<typeof shareLink>[1] = { name: typeof a.opt.ad === 'string' ? a.opt.ad : name.replace(/\.[^.]+$/, '').replace(/^.*[\\/]/, '') };
  if (a.opt.run) opts.run = true;
  if (a.opt.yerel) opts.base = pathToFileURL(resolve(process.cwd(), 'index.html')).href;
  console.log(shareLink(text, opts));
  return 0;
}

function cmdOrnek(a: Args): number {
  const n = a.pos[0] ? parseInt(a.pos[0], 10) : NaN;
  if (Number.isNaN(n)) {
    EXAMPLES.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}  ${e.name}`));
    return 0;
  }
  const ex = EXAMPLES[n - 1];
  if (!ex) throw new Error(`Örnek yok: ${n}`);
  console.log(ex.il);
  return 0;
}

export function main(argv: string[]): number {
  const a = parseArgs(argv);
  const profileId = typeof a.opt.model === 'string' ? a.opt.model : undefined;
  switch (a.cmd) {
    case 'kontrol': return cmdKontrol(a, profileId);
    case 'sim': return cmdSim(a, profileId);
    case 'ciz': return cmdCiz(a, profileId);
    case 'link': return cmdLink(a);
    case 'ornek': return cmdOrnek(a);
    default:
      console.log(HELP);
      return a.cmd === 'yardim' || a.cmd === 'help' ? 0 : 1;
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).replace(/\.ts$/, '') === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).replace(/\.ts$/, '');
if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error('Hata: ' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 2;
  }
}
