// Alıştırma arayüzünün saf mantığı: ilerleme deposu, sekme ↔ alıştırma bağı, bağlantı ayrıştırma.
import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../src/core/index';
import {
  emptyProgress,
  exerciseIdFromHash,
  findExerciseTab,
  groupByLevel,
  markSolved,
  nextExerciseId,
  parseProgress,
  rememberIl,
  revealHint,
  startIl,
} from '../src/ui/exercise/progress';

describe('ilerleme deposu', () => {
  it('bozuk ya da boş kayıt boş ilerleme verir', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('{bozuk')).toEqual(emptyProgress());
    expect(parseProgress('[1,2]')).toEqual(emptyProgress());
    expect(parseProgress('{"solved": 5, "il": "x"}')).toEqual(emptyProgress());
  });

  it('geçerli alanları okur, yanlış türleri ve bilinmeyen kimlikleri atar', () => {
    const raw = JSON.stringify({ v: 1, solved: { muhurleme: 10, yok: 3, flasor: 'x' }, il: { muhurleme: 'LD X0', flasor: 4 }, hints: { muhurleme: 2.7, flasor: -1 } });
    const p = parseProgress(raw, (id) => id !== 'yok');
    expect(p.solved).toEqual({ muhurleme: 10 });
    expect(p.il).toEqual({ muhurleme: 'LD X0' });
    expect(p.hints).toEqual({ muhurleme: 2 });
  });

  it('kaydet → oku gidiş-dönüşü', () => {
    let p = emptyProgress();
    p = markSolved(p, 'muhurleme', 123);
    p = rememberIl(p, 'muhurleme', 'LD X0\nOUT Y0\nEND', 'END');
    p = revealHint(p, 'muhurleme', 2);
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
  });

  it('çözüldü işareti ilk zamanı korur', () => {
    const p = markSolved(emptyProgress(), 'a', 1);
    expect(markSolved(p, 'a', 99)).toBe(p);
    expect(p.solved.a).toBe(1);
  });

  it('IL başlangıçla aynıysa saklanmaz; değişmeyince aynı nesne döner', () => {
    const st = '; x\n#X0 start\n\nEND';
    let p = rememberIl(emptyProgress(), 'a', st + '\n', st);
    expect(p.il).toEqual({});
    p = rememberIl(p, 'a', 'LD X0\nEND', st);
    expect(p.il.a).toBe('LD X0\nEND');
    expect(rememberIl(p, 'a', 'LD X0\nEND', st)).toBe(p);
    expect(rememberIl(p, 'a', st, st).il).toEqual({});
  });

  it('ipucu sayısı toplamı aşmaz', () => {
    let p = emptyProgress();
    for (let i = 0; i < 5; i++) p = revealHint(p, 'a', 2);
    expect(p.hints.a).toBe(2);
  });
});

describe('sekme ↔ alıştırma bağı', () => {
  const ex = EXERCISES[0]!;
  it('açılış IL: önce öğrencinin kaldığı yer, yoksa başlangıç', () => {
    expect(startIl(ex, emptyProgress())).toBe(ex.starterIl);
    const p = rememberIl(emptyProgress(), ex.id, 'LD X0\nOUT Y0\nEND', ex.starterIl);
    expect(startIl(ex, p)).toBe('LD X0\nOUT Y0\nEND');
  });

  it('açık sekme kimlikle bulunur', () => {
    const tabs = [{ exercise: undefined }, { exercise: 'flasor' }, { exercise: 'muhurleme' }];
    expect(findExerciseTab(tabs, 'muhurleme')).toBe(2);
    expect(findExerciseTab(tabs, 'sayici')).toBe(-1);
  });

  it('sıradaki alıştırma çözülmemiş olanı seçer', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(nextExerciseId(list, 'a')).toBe('b');
    expect(nextExerciseId(list, 'a', markSolved(emptyProgress(), 'b', 1))).toBe('c');
    expect(nextExerciseId(list, 'c')).toBeNull();
    expect(nextExerciseId(list, 'yok')).toBe('a');
  });

  it('düzeye göre gruplama sırayı korur', () => {
    const g = groupByLevel(EXERCISES);
    expect(g.map((x) => x.level)).toEqual([1, 2, 3]);
    expect(g.flatMap((x) => x.items).length).toBe(EXERCISES.length);
    expect(g[0]!.items[0]!.id).toBe('muhurleme');
  });
});

describe('bağlantı ayrıştırma', () => {
  it('#alistirma=<kimlik>', () => {
    expect(exerciseIdFromHash('#alistirma=muhurleme')).toBe('muhurleme');
    expect(exerciseIdFromHash('alistirma=yildiz-ucgen&run=1')).toBe('yildiz-ucgen');
    expect(exerciseIdFromHash('#ornek=3')).toBeNull();
    expect(exerciseIdFromHash('#alistirma=')).toBeNull();
    expect(exerciseIdFromHash('')).toBeNull();
  });
});
