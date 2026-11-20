// Alıştırmalar 5–9: zamanlayıcılar, flaşör, sayıcı, darbe (kenar) ile aç/kapa.

import { define, delay, io, never, off, on, scenario } from './define';

const TMR_NOT = 'Hatırlatma: T0–T199 100 ms tabanlıdır (K10 = 1 s).';

export const gecikmeliCalisma = define({
  id: 'gecikmeli-calisma',
  title: 'Gecikmeli çalışma',
  level: 1,
  task: [
    'Anahtar (X0) açıldıktan 3 s sonra lamba (Y0) yansın. Anahtar kapanınca lamba hemen sönsün.',
    'Anahtar 3 s dolmadan kapatılırsa lamba hiç yanmasın; yeniden açılınca 3 s baştan sayılsın.',
    'Anahtar kalıcı konumludur: açıkken X0 = 1, kapalıyken X0 = 0. ' + TMR_NOT,
  ].join('\n'),
  summary: 'Anahtar (X0) açıldıktan 3 s sonra lamba (Y0) yanar, anahtar kapanınca hemen söner.',
  inputs: [io('X0', 'anahtar', 'anahtar')],
  outputs: [io('Y0', 'lamba', 'lamba')],
  solutionIl: `LD X0
TMR T0 K30
LD T0
OUT Y0
END`,
  hints: [
    'Gecikmeli çalışma, girişi süre boyunca 1 kalan bir zamanlayıcıyla (TMR) yapılır; zamanlayıcının kontağı süre dolunca kapanır.',
    'Zamanlayıcının ayar değeri, zaman tabanına bölünmüş süredir: 100 ms tabanında 3 s için K30.',
  ],
  scenarios: [
    scenario('anahtarı aç, 5 s sonra kapat', '0.5s:X0=1 5.5s:X0=0', 6.5, [
      off(2.0, 'Y0', 'Lamba hemen değil, 3 s sonra yanmalı.'),
      on(4.5, 'Y0'),
      off(6.0, 'Y0', 'Anahtar kapanınca lamba hemen sönmeli.'),
    ], { timing: [delay('X0', 'rise', 3, 'Y0', 'rise')] }),
    scenario('3 s dolmadan kapat (iki kez)', '0.5s:X0=1 2.5s:X0=0 3s:X0=1 5s:X0=0', 7, [], {
      invariants: [never('Y0', 'Anahtar 3 s dolmadan kapatıldı; süre baştan başlamalı ve lamba yanmamalı.')],
    }),
    scenario('kapatıp yeniden aç', '0.5s:X0=1 4.5s:X0=0 5s:X0=1 9s:X0=0', 9.5, [
      on(4.0, 'Y0'),
      off(4.8, 'Y0', 'Anahtar kapanınca lamba hemen sönmeli.'),
      off(7.0, 'Y0', 'Anahtar yeniden açılınca 3 s yeniden beklenmeli.'),
      on(8.5, 'Y0'),
    ], { timing: [delay('X0', 'rise', 3, 'Y0', 'rise', { n: 2 })] }),
  ],
});

export const gecikmeliKapanma = define({
  id: 'gecikmeli-kapanma',
  title: 'Gecikmeli kapanma',
  level: 2,
  task: [
    'Anahtar (X0) açılınca lamba (Y0) hemen yansın. Anahtar kapandıktan 5 s sonra lamba sönsün.',
    'Lamba henüz yanıkken anahtar yeniden açılırsa lamba yanık kalsın; 5 s, anahtarın son kapandığı andan sayılsın.',
    'Anahtar kalıcı konumludur: açıkken X0 = 1. ' + TMR_NOT,
  ].join('\n'),
  summary: 'Anahtar (X0) açılınca lamba (Y0) hemen yanar; anahtar kapandıktan 5 s sonra söner.',
  inputs: [io('X0', 'anahtar', 'anahtar')],
  outputs: [io('Y0', 'lamba', 'lamba')],
  solutionIl: `LDI X0
AND Y0
TMR T0 K50
LD X0
OR Y0
ANI T0
OUT Y0
END`,
  hints: [
    'Lamba anahtar kapandıktan sonra da yanık kalmalı: lambanın kendi kontağıyla tutulması gerekir.',
    'Zamanlayıcı yalnızca anahtar kapalıyken saymalı; süre dolunca lambanın tutmasını bozmalı.',
  ],
  scenarios: [
    scenario('aç, 1 s sonra kapat', '0.5s:X0=1 1.5s:X0=0', 8, [
      on(0.7, 'Y0', 'Anahtar açılınca lamba hemen yanmalı.'),
      on(4.0, 'Y0', 'Anahtar kapandıktan sonra lamba 5 s daha yanık kalmalı.'),
      off(7.5, 'Y0'),
    ], { timing: [delay('X0', 'fall', 5, 'Y0', 'fall')] }),
    scenario('5 s dolmadan yeniden aç, sonra kapat', '0.5s:X0=1 1s:X0=0 3s:X0=1 4s:X0=0', 10, [
      on(2.0, 'Y0'),
      on(3.5, 'Y0'),
      on(8.0, 'Y0', 'Anahtar yeniden açılınca süre baştan başlamalı; lamba son kapatmadan 5 s sonra sönmeli.'),
      off(9.5, 'Y0'),
    ], { timing: [delay('X0', 'fall', 5, 'Y0', 'fall', { n: 2 })] }),
    scenario('anahtar hiç açılmıyor', '', 7, [], {
      invariants: [never('Y0', 'Anahtar açılmadan lamba yanmamalı.')],
    }),
  ],
});

export const flasor = define({
  id: 'flasor',
  title: 'Flaşör',
  level: 2,
  task: [
    'Anahtar (X0) açıkken lamba (Y0) 1 s yanık, 1 s sönük olarak yanıp sönsün.',
    'Anahtar açıldığı anda lamba yanar (yanık fazla başlar). Anahtar kapanınca lamba hemen söner; yeniden açılınca yine yanık fazla başlar.',
    'Anahtar kalıcı konumludur: açıkken X0 = 1. ' + TMR_NOT,
  ].join('\n'),
  summary: 'Anahtar (X0) açıkken lamba (Y0) 1 s yanık / 1 s sönük; açılınca yanık fazla başlar.',
  inputs: [io('X0', 'anahtar', 'anahtar')],
  outputs: [io('Y0', 'lamba', 'lamba')],
  solutionIl: `LD X0
ANI T1
TMR T0 K10
LD T0
TMR T1 K10
LD X0
ANI T0
OUT Y0
END`,
  hints: [
    'İki zamanlayıcı birbirini sırayla çalıştırabilir: biri yanık fazı, öbürü sönük fazı ölçer.',
    'İkinci zamanlayıcının süresi dolunca birinciyi sıfırlarsa döngü kendini tekrarlar.',
    'Hangi fazın önce geldiğine çıkış satırındaki kontağın türü (açık/kapalı) karar verir.',
  ],
  scenarios: [
    scenario('anahtarı yaklaşık 5 s açık tut', '1.3s:X0=1 6s:X0=0', 7.5, [
      on(1.8, 'Y0', 'Anahtar açılır açılmaz lamba yanmalı (yanık fazla başlar).'),
      off(2.8, 'Y0'),
      on(3.8, 'Y0'),
      off(4.8, 'Y0'),
      on(5.6, 'Y0'),
      off(6.5, 'Y0', 'Anahtar kapanınca lamba hemen sönmeli.'),
      off(7.3, 'Y0', 'Anahtar kapalıyken lamba sönük kalmalı.'),
    ], {
      timing: [
        delay('X0', 'rise', 1, 'Y0', 'fall', { note: 'Yanık faz 1 s sürmeli.' }),
        delay('Y0', 'fall', 1, 'Y0', 'rise', { note: 'Sönük faz 1 s sürmeli.' }),
      ],
    }),
    scenario('sönük fazdayken kapat, hemen yeniden aç', '0.5s:X0=1 2s:X0=0 2.3s:X0=1 4s:X0=0', 4.5, [
      on(1.0, 'Y0'),
      off(1.8, 'Y0'),
      off(2.15, 'Y0'),
      on(2.8, 'Y0', 'Anahtar yeniden açılınca lamba yine yanık fazla başlamalı.'),
      off(3.7, 'Y0'),
      off(4.3, 'Y0'),
    ]),
  ],
});

export const sayici = define({
  id: 'sayici',
  title: 'Sayıcı: üç ürün',
  level: 2,
  task: [
    'Bandın üzerindeki sensör (X0) her ürün geçişinde bir kez 1 olur. Üçüncü ürün geçince lamba (Y0) yansın ve reset butonuna (X1) basılana kadar yanık kalsın.',
    'Reset sayımı sıfırlar ve lambayı söndürür. Sensörün uzun süre 1 kalması (ürün durdu) tek ürün sayılır.',
    'Reset butonu normalde açıktır (NO).',
  ].join('\n'),
  summary: 'Sensör (X0) 3 ürün sayınca lamba (Y0) yanar; reset (X1) sıfırlar. Uzun algılama tek sayılır.',
  inputs: [io('X0', 'sensör', 'sensor'), io('X1', 'reset', 'buton')],
  outputs: [io('Y0', 'lamba', 'lamba')],
  solutionIl: `LD X1
RST C0
LD X0
CNT C0 K3
LD C0
OUT Y0
END`,
  hints: [
    'Sayıcı (CNT) girişinin her 0→1 geçişinde bir sayar; ayar değerine ulaşınca kontağı kapanır.',
    'Sayıcıyı sıfırlamak için ayrı bir satırda RST kullanılır.',
  ],
  scenarios: [
    scenario('üç ürün geçer', '0.5s:X0=1 0.7s:X0=0 1.2s:X0=1 1.4s:X0=0 1.9s:X0=1 2.1s:X0=0', 3, [
      off(1.6, 'Y0', 'İki ürün geçti; lamba henüz yanmamalı.'),
      on(2.5, 'Y0', 'Üçüncü ürün geçti; lamba yanmalı.'),
    ]),
    scenario('sensör uzun süre görüyor', '0.5s:X0=1 2s:X0=0 2.5s:X0=1 2.7s:X0=0', 3.5, [
      off(1.5, 'Y0', 'Sensör sürekli görse de bu tek ürün sayılır; sayım her 0→1 geçişinde bir kez olmalı.'),
      off(3.2, 'Y0', 'Henüz iki ürün geçti.'),
    ]),
    scenario('reset sayımı sıfırlar', '0.3s:X0=1 0.5s:X0=0 0.8s:X0=1 1s:X0=0 1.3s:X0=1 1.5s:X0=0 3s:X1=1 3.2s:X1=0 4s:X0=1 4.2s:X0=0 4.7s:X0=1 4.9s:X0=0 6s:X0=1 6.2s:X0=0', 7, [
      on(2.5, 'Y0'),
      off(3.5, 'Y0', 'Reset\'e basılınca lamba sönmeli ve sayım sıfırlanmalı.'),
      off(5.5, 'Y0', 'Reset\'ten sonra yalnızca iki ürün geçti; sayım sıfırdan başlamalı.'),
      on(6.6, 'Y0'),
    ]),
    scenario('dördüncü ürün de geçer', '0.3s:X0=1 0.5s:X0=0 0.8s:X0=1 1s:X0=0 1.3s:X0=1 1.5s:X0=0 2s:X0=1 2.2s:X0=0', 3.5, [
      on(1.8, 'Y0'),
      on(3.0, 'Y0', 'Reset\'e basılana kadar lamba yanık kalmalı.'),
    ]),
  ],
});

export const tekButon = define({
  id: 'tek-buton',
  title: 'Tek butonla aç/kapa',
  level: 2,
  task: [
    'Tek bir butonla (X0) lamba (Y0) kumanda edilsin: her basışta lambanın durumu değişsin (sönükse yanar, yanıksa söner).',
    'Butonu basılı tutmak durumu bir kez değiştirir; bırakıp yeniden basana kadar başka değişiklik olmaz.',
    'Buton normalde açıktır (NO).',
  ].join('\n'),
  summary: 'Her basışta (X0) lamba (Y0) durum değiştirir; basılı tutmak yalnızca bir kez değiştirir.',
  inputs: [io('X0', 'buton', 'buton')],
  outputs: [io('Y0', 'lamba', 'lamba')],
  solutionIl: `LD X0
PLS M0
LD M0
ANI Y0
LD Y0
ANI M0
ORB
OUT Y0
END`,
  hints: [
    'Basışın yalnızca ilk anını kullanmak gerekir: PLS ya da LDP bir tarama süren darbe üretir.',
    'Darbe geldiğinde lamba sönükse yakmalı, yanıksa söndürmeli; darbe yokken lamba kendi durumunu korumalı.',
    'Aynı darbeyle SET ve RST\'yi art arda çalıştırırsan ikincisi birincisini hemen geri alabilir.',
  ],
  scenarios: [
    scenario('bas-bırak, üç kez', '0.5s:X0=1 0.7s:X0=0 1.5s:X0=1 1.7s:X0=0 2.5s:X0=1 2.7s:X0=0', 3.2, [
      off(0.3, 'Y0'),
      on(1.1, 'Y0', 'Bir basışta lamba yanmalı ve buton bırakılınca da yanık kalmalı.'),
      off(2.1, 'Y0', 'İkinci basışta lamba sönmeli.'),
      on(3.0, 'Y0', 'Üçüncü basışta lamba yeniden yanmalı.'),
    ]),
    scenario('uzun bas', '0.5s:X0=1 2.5s:X0=0 3s:X0=1 3.2s:X0=0', 3.7, [
      on(0.8, 'Y0', 'Basınca lamba yanmalı.'),
      on(1.3, 'Y0', 'Basılı tutmak durumu değiştirmemeli; basışın yalnızca ilk anını (kenarını) kullan.'),
      on(1.71, 'Y0', 'Basılı tutmak durumu değiştirmemeli; basışın yalnızca ilk anını (kenarını) kullan.'),
      on(2.23, 'Y0', 'Basılı tutmak durumu değiştirmemeli; basışın yalnızca ilk anını (kenarını) kullan.'),
      on(2.8, 'Y0'),
      off(3.5, 'Y0', 'Yeni basışta lamba sönmeli.'),
    ]),
  ],
});
