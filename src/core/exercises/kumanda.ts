// Alıştırmalar 1–4: start/stop kumandası, mühürleme, SET/RST, kilitleme.

import { define, io, never, notBoth, off, on, scenario } from './define';

const NO = 'Bütün butonlar normalde açıktır (NO): basılınca giriş 1, bırakınca 0 olur.';

export const muhurleme = define({
  id: 'muhurleme',
  title: 'Mühürleme: start/stop ile motor',
  level: 1,
  task: [
    "Start butonuna (X0) kısa bir basışla motor (Y0) çalışmaya başlasın ve buton bırakılınca da çalışmaya devam etsin.",
    'Stop butonuna (X1) basılınca motor dursun. Stop önceliklidir: start basılıyken stop\'a basılırsa, ya da ikisine birlikte basılırsa motor çalışmaz.',
    NO,
  ].join('\n'),
  summary: 'Start (X0) motoru (Y0) çalıştırır ve kendini tutar; stop (X1) durdurur, stop önceliklidir.',
  inputs: [io('X0', 'start', 'buton'), io('X1', 'stop', 'buton')],
  outputs: [io('Y0', 'motor', 'motor')],
  solutionIl: `LD X0
OR Y0
ANI X1
OUT Y0
END`,
  hints: [
    'Buton bırakılınca motoru çalışır tutan şey motorun kendi kontağıdır: Y0 kontağını start\'a paralel bağla.',
    'Stop normalde açık bir butondur; basılınca devreyi açması için kapalı kontak (ANI/LDI) olarak, paralel kolun dışına seri bağlanmalı.',
  ],
  scenarios: [
    scenario("start'a kısa bas, sonra stop", '0.5s:X0=1 0.8s:X0=0 2s:X1=1 2.2s:X1=0', 3, [
      off(0.3, 'Y0', 'Start\'a basılmadan motor çalışmamalı.'),
      on(0.65, 'Y0', 'Start\'a basılıyken motor çalışmalı; stop kontağının türüne (açık/kapalı) bak.'),
      on(1.2, 'Y0', 'Start bırakıldıktan sonra da motor çalışmaya devam etmeli; mühürleme kontağını düşün.'),
      on(1.9, 'Y0'),
      off(2.5, 'Y0', 'Stop\'a basıldı; motor durmalı.'),
    ]),
    scenario("durdurduktan sonra yeniden start", '0.2s:X0=1 0.4s:X0=0 1s:X1=1 1.2s:X1=0 2s:X0=1 2.2s:X0=0', 3, [
      on(0.7, 'Y0'),
      off(1.5, 'Y0', 'Stop\'a basıldı; motor durmalı.'),
      on(2.6, 'Y0', 'Stop bırakıldıktan sonra motor yeniden çalıştırılabilmeli.'),
    ]),
    scenario("start basılıyken stop'a bas", '0.2s:X0=1 1s:X1=1 1.5s:X1=0 2s:X0=0', 2.5, [
      on(0.6, 'Y0'),
      off(1.3, 'Y0', 'Start basılı olsa bile stop önceliklidir.'),
    ]),
    scenario('ikisine birlikte bas', '0.5s:X0=1 0.5s:X1=1 0.8s:X0=0 0.8s:X1=0', 1.5, [], {
      invariants: [never('Y0', 'İkisine birlikte basılınca stop öncelikli olmalı.')],
    }),
  ],
});

export const ikiYerden = define({
  id: 'iki-yerden',
  title: 'İki yerden kumanda',
  level: 1,
  task: [
    'Bir motor (Y0) iki ayrı yerden kumanda ediliyor. Start 1 (X0) ya da start 2 (X1) butonlarından herhangi birine basılınca motor çalışsın ve kendini tutsun.',
    'Stop 1 (X2) ya da stop 2 (X3) butonlarından herhangi birine basılınca motor dursun. Stop önceliklidir.',
    NO,
  ].join('\n'),
  summary: 'Start 1 (X0) ya da start 2 (X1) motoru (Y0) çalıştırır; stop 1 (X2) ya da stop 2 (X3) durdurur.',
  inputs: [io('X0', 'start 1', 'buton'), io('X1', 'start 2', 'buton'), io('X2', 'stop 1', 'buton'), io('X3', 'stop 2', 'buton')],
  outputs: [io('Y0', 'motor', 'motor')],
  solutionIl: `LD X0
OR X1
OR Y0
ANI X2
ANI X3
OUT Y0
END`,
  hints: [
    'Herhangi biri yetiyorsa paralel, hepsi gerekiyorsa seri bağlanır.',
    'Start\'lar ve mühürleme kontağı birbirine paralel; iki stop bu paralel grubun ardına seri gelir.',
  ],
  scenarios: [
    scenario('1. yerden başlat, 2. yerden durdur', '0.2s:X0=1 0.4s:X0=0 1.5s:X3=1 1.7s:X3=0', 2.5, [
      on(0.3, 'Y0', 'Start 1 tek başına motoru çalıştırmalı.'),
      on(1.0, 'Y0', 'Start bırakıldıktan sonra da motor çalışmaya devam etmeli.'),
      off(2.0, 'Y0', 'Stop 2 tek başına motoru durdurmalı.'),
    ]),
    scenario('2. yerden başlat, 1. yerden durdur', '0.2s:X1=1 0.4s:X1=0 1.5s:X2=1 1.7s:X2=0', 2.5, [
      on(0.3, 'Y0', 'Start 2 tek başına motoru çalıştırmalı.'),
      on(1.0, 'Y0', 'Start bırakıldıktan sonra da motor çalışmaya devam etmeli.'),
      off(2.0, 'Y0', 'Stop 1 tek başına motoru durdurmalı.'),
    ]),
    scenario('start basılıyken öteki yerden stop', '0.2s:X0=1 1s:X3=1 1.4s:X3=0 2s:X0=0 2.5s:X1=1 3s:X2=1 3.4s:X2=0 3.8s:X1=0', 4.2, [
      on(0.6, 'Y0'),
      off(1.2, 'Y0', 'Start basılı olsa bile her iki stop da önceliklidir.'),
      on(2.8, 'Y0'),
      off(3.2, 'Y0', 'Start basılı olsa bile her iki stop da önceliklidir.'),
    ]),
  ],
});

export const setRst = define({
  id: 'set-rst',
  title: 'SET/RST ile motor, stop öncelikli',
  level: 1,
  task: [
    'Motoru (Y0) SET ve RST komutlarıyla kumanda et: start (X0) motoru çalıştırır, stop (X1) durdurur.',
    'Stop önceliklidir: ikisine birlikte basılınca motor çalışmamalı.',
    NO,
  ].join('\n'),
  summary: 'Start (X0) Y0\'ı SET eder, stop (X1) RST eder; ikisine birlikte basılınca motor durur.',
  inputs: [io('X0', 'start', 'buton'), io('X1', 'stop', 'buton')],
  outputs: [io('Y0', 'motor', 'motor')],
  solutionIl: `LD X0
SET Y0
LD X1
RST Y0
END`,
  hints: [
    'SET ile kurulan çıkış, RST gelene kadar kendini tutar; mühürleme kontağı gerekmez.',
    'Aynı taramada hem SET hem RST çalışırsa programda sonra gelen satır kazanır.',
  ],
  scenarios: [
    scenario("start'a kısa bas, sonra stop", '0.5s:X0=1 0.8s:X0=0 2s:X1=1 2.2s:X1=0', 3, [
      on(0.65, 'Y0', 'Start\'a basılınca motor çalışmalı; stop\'un hangi durumda RST yaptığına bak.'),
      on(1.5, 'Y0', 'Start bırakıldıktan sonra da motor çalışmaya devam etmeli; OUT yerine SET kullan.'),
      off(2.5, 'Y0', 'Stop\'a basıldı; motor durmalı.'),
    ]),
    scenario('ikisine birlikte bas (duruyorken ve çalışırken)', '0.5s:X0=1 0.5s:X1=1 1s:X0=0 1s:X1=0 1.5s:X0=1 1.7s:X0=0 2.5s:X0=1 2.5s:X1=1 3s:X0=0 3s:X1=0', 3.5, [
      off(0.8, 'Y0', 'İkisine birlikte basılınca stop kazanmalı; aynı taramada SET ve RST çalışırsa sonraki satır geçerli olur.'),
      on(2.2, 'Y0'),
      off(2.8, 'Y0', 'İkisine birlikte basılınca stop kazanmalı; aynı taramada SET ve RST çalışırsa sonraki satır geçerli olur.'),
    ]),
    scenario("çalışırken start'ı basılı tut, stop'a bas", '0.2s:X0=1 0.4s:X0=0 1s:X0=1 1.2s:X1=1 1.6s:X1=0 2s:X0=0', 2.5, [
      on(0.8, 'Y0'),
      off(1.4, 'Y0', 'Start basılıyken de stop önceliklidir.'),
    ]),
  ],
});

export const ileriGeri = define({
  id: 'ileri-geri',
  title: 'İleri-geri kilitleme',
  level: 2,
  task: [
    'Bir motor iki yönde dönüyor: ileri butonu (X0) ileri kontaktörünü (Y0), geri butonu (X1) geri kontaktörünü (Y1) çalıştırır ve kendini tutar. Stop (X2) ikisini de durdurur.',
    'İki yön hiçbir an birlikte çekmemeli. Bir yön çalışırken öbür yönün butonu işe yaramaz: yön değiştirmek için önce stop\'a basılır.',
    NO,
  ].join('\n'),
  summary: 'İleri (X0) → Y0, geri (X1) → Y1, stop (X2) ikisini durdurur; Y0 ile Y1 asla birlikte çekmez, yön değiştirmek için önce stop.',
  inputs: [io('X0', 'ileri', 'buton'), io('X1', 'geri', 'buton'), io('X2', 'stop', 'buton')],
  outputs: [io('Y0', 'ileri yön', 'motor'), io('Y1', 'geri yön', 'motor')],
  solutionIl: `LD X0
OR Y0
ANI X2
ANI Y1
OUT Y0
LD X1
OR Y1
ANI X2
ANI Y0
OUT Y1
END`,
  hints: [
    'Her yön, ilk alıştırmadaki gibi kendi mühürlemesiyle kurulur.',
    'Kilitleme: bir yönün satırına öbür yönün çıkışını kapalı kontak olarak seri ekle.',
    'Butonlarla yapılan kilitleme (öbür yönün butonunu kapalı kontak koymak) stop\'suz yön değiştirmeye izin verir; burada istenen o değil.',
  ],
  scenarios: [
    scenario('ileri çalıştır, durdur, geri çalıştır', '0.2s:X0=1 0.4s:X0=0 1.5s:X2=1 1.7s:X2=0 2.2s:X1=1 2.4s:X1=0 3.5s:X2=1 3.7s:X2=0', 4.2, [
      on(1.0, 'Y0', 'İleri butonu ileri yönü çalıştırmalı ve buton bırakılınca da tutmalı.'),
      off(1.0, 'Y1'),
      off(2.0, 'Y0', 'Stop\'a basıldı; motor durmalı.'),
      on(3.0, 'Y1', 'Stop\'tan sonra geri yön çalıştırılabilmeli.'),
      off(3.0, 'Y0'),
      off(4.0, 'Y1', 'Stop\'a basıldı; motor durmalı.'),
    ], { invariants: [notBoth('Y0', 'Y1', 'İki yön arasında kilitleme eksik.')] }),
    scenario("ileri çalışırken geri'ye bas", '0.2s:X0=1 0.4s:X0=0 1s:X1=1 1.3s:X1=0', 2, [
      on(1.6, 'Y0', 'Yön değiştirmek için önce stop\'a basılmalı; ileri yön çalışmaya devam etmeli.'),
    ], { invariants: [never('Y1', 'Bir yön çalışırken öbür yönün butonu işe yaramamalı (kilitleme).'), notBoth('Y0', 'Y1', 'İki yön arasında kilitleme eksik.')] }),
    scenario("geri çalışırken ileri'ye bas", '0.2s:X1=1 0.4s:X1=0 1s:X0=1 1.3s:X0=0', 2, [
      on(1.6, 'Y1', 'Yön değiştirmek için önce stop\'a basılmalı; geri yön çalışmaya devam etmeli.'),
    ], { invariants: [never('Y0', 'Bir yön çalışırken öbür yönün butonu işe yaramamalı (kilitleme).'), notBoth('Y0', 'Y1', 'İki yön arasında kilitleme eksik.')] }),
    scenario('iki yöne birlikte bas', '0.5s:X0=1 0.5s:X1=1 0.8s:X0=0 0.8s:X1=0 1.5s:X2=1 1.7s:X2=0', 2, [
      off(1.9, 'Y0'),
      off(1.9, 'Y1'),
    ], { invariants: [notBoth('Y0', 'Y1', 'İki butona birlikte basılsa da iki yön birlikte çekmemeli.')] }),
  ],
});
