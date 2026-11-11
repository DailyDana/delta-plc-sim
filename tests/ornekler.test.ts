// Örnek listeleri (examples.js, src/core/examples.ts) devreler/*.txt dosyalarından üretilir.
// Elle düzenlenmiş ya da yeniden üretilmemişse bu test kırılır: `npm run ornekler` çalıştır.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EXAMPLES, checkIl } from '../src/core/index';

describe('örnek devreler', () => {
  it('üretilen listeler devreler/ ile aynı', () => {
    const out = execFileSync(process.execPath, ['tools/ornekler.cjs', '--denetle'], { encoding: 'utf8' });
    expect(out).toContain('güncel');
  });

  it('her örnek tanılamasız ve "Dene:" yönergeli', () => {
    for (const ex of EXAMPLES) {
      expect(checkIl(ex.il).diagnostics, ex.name).toEqual([]);
      expect(ex.il, ex.name).toMatch(/^; Dene: /m);
    }
  });
});
