// Alıştırmalar 10–12: sıralı kalkış, yıldız-üçgen, ana şalter (MC/MCR).

import { define, delay, io, never, notBoth, off, on, scenario } from './define';

const NO = 'Bütün butonlar normalde açıktır (NO): basılınca giriş 1 olur.';

export const siraliKalkis = define({
  id: 'sirali-kalkis',
  title: 'Sıralı kalkış: üç motor',
  level: 3,
  task: [
    'Start (X0) butonuna kısa bir basışla motor 1 (Y0) hemen çalışsın; motor 1 kalktıktan 2 s sonra motor 2 (Y1), motor 2 kalktıktan 2 s sonra motor 3 (Y2) çalışsın.',
    'Stop (X1) bütün motorları hemen durdursun. Stop\'tan sonra yeniden start\'a basılırsa sıra baştan başlasın.',
    NO + ' T0–T199 100 ms tabanlıdır.',
  ].join('\n'),
  summary: 'Start (X0): Y0 hemen, 2 s sonra Y1, ondan 2 s sonra Y2; stop (X1) hepsini durdurur.',
  inputs: [io('X0', 'start', 'buton'), io('X1', 'stop', 'buton')],
  outputs: [io('Y0', 'motor 1', 'motor'), io('Y1', 'motor 2', 'motor'), io('Y2', 'motor 3', 'motor')],
  solutionIl: `LD X0
OR Y0
ANI X1
OUT Y0
LD Y0
TMR T0 K20
LD Y0
AND T0
OUT Y1
LD Y1
TMR T1 K20
LD Y1
AND T1
OUT Y2
END`,
  hints: [
    'Start butonuna yalnızca kısa basılıyor: zamanlayıcıları butonla değil, mühürlenmiş motor 1 ile başlat.',
    'Her motor bir öncekinin kalkışından itibaren sayan kendi zamanlayıcısıyla çalışabilir.',
    'Stop yalnızca motor 1\'i bıraksa bile, öbürleri motor 1\'e bağlıysa onlar da düşer.',
  ],
  scenarios: [
    scenario("start'a kısa bas, bekle", '0.5s:X0=1 0.7s:X0=0', 6, [
      on(1.0, 'Y0', 'Start\'a basılınca motor 1 hemen çalışmalı ve kendini tutmalı.'),
      off(1.0, 'Y1', 'Motor 2 hemen değil, 2 s sonra kalkmalı.'),
      off(1.0, 'Y2', 'Motor 3 hemen değil, 4 s sonra kalkmalı.'),
      on(3.0, 'Y1'),
      off(3.0, 'Y2', 'Motor 3, motor 2\'den 2 s sonra kalkmalı.'),
      on(5.0, 'Y0'),
      on(5.0, 'Y1'),
      on(5.0, 'Y2'),
    ], {
      timing: [
        delay('X0', 'rise', 2, 'Y1', 'rise'),
        delay('Y1', 'rise', 2, 'Y2', 'rise'),
      ],
    }),
    scenario('hepsi çalışırken stop', '0.5s:X0=1 0.7s:X0=0 5.5s:X1=1 5.7s:X1=0', 6.5, [
      on(5.2, 'Y2'),
      off(6.0, 'Y0', 'Stop bütün motorları durdurmalı.'),
      off(6.0, 'Y1', 'Stop bütün motorları durdurmalı.'),
      off(6.0, 'Y2', 'Stop bütün motorları durdurmalı.'),
    ]),
    scenario('motor 3 kalkmadan stop, sonra yeniden start', '0.5s:X0=1 0.7s:X0=0 3.5s:X1=1 3.7s:X1=0 6s:X0=1 6.2s:X0=0', 11, [
      off(4.0, 'Y0', 'Stop bütün motorları durdurmalı.'),
      off(4.0, 'Y1', 'Stop bütün motorları durdurmalı.'),
      off(5.5, 'Y2', 'Stop\'tan sonra motor 3 kendiliğinden kalkmamalı.'),
      on(6.5, 'Y0'),
      off(7.5, 'Y1', 'Yeniden start\'ta süre baştan sayılmalı.'),
      on(8.5, 'Y1'),
      on(10.5, 'Y2'),
    ], { timing: [delay('X0', 'rise', 2, 'Y1', 'rise', { n: 2 })] }),
  ],
});

export const yildizUcgen = define({
  id: 'yildiz-ucgen',
  title: 'Yıldız-üçgen yol verme',
  level: 3,
  task: [
    'Start (X0) butonuna kısa bir basışla ana kontaktör (Y0) ve yıldız kontaktörü (Y1) birlikte çeksin.',
    '5 s sonra yıldız bıraksın, üçgen kontaktörü (Y2) çeksin. Yıldız ile üçgen hiçbir an birlikte çekmemeli; yıldız bıraktıktan sonra üçgen en geç 1 s içinde çekmeli (aradaki boşluğu sen seç, 0 da olabilir).',
    'Stop (X1) bütün kontaktörleri bıraksın; yeniden start\'ta kalkış yine yıldızla başlasın.',
    NO + ' T0–T199 100 ms tabanlıdır.',
  ].join('\n'),
  summary: 'Start (X0): Y0 + Y1 (yıldız); 5 s sonra Y1 bırakır, Y2 (üçgen) çeker; Y1 ve Y2 asla birlikte değil; stop (X1) hepsini bırakır.',
  inputs: [io('X0', 'start', 'buton'), io('X1', 'stop', 'buton')],
  outputs: [io('Y0', 'ana', 'kontaktor'), io('Y1', 'yıldız', 'kontaktor'), io('Y2', 'üçgen', 'kontaktor')],
  solutionIl: `LD X0
OR Y0
ANI X1
OUT Y0
LD Y0
TMR T0 K50
LD Y0
ANI T0
ANI Y2
OUT Y1
LD Y0
AND T0
ANI Y1
OUT Y2
END`,
  hints: [
    'Ana kontaktör mühürlenir; yıldız ve üçgen ana kontaktöre bağlı çalışır.',
    'Bir zamanlayıcı ana kontaktörle başlar; kontağı yıldızı keser, üçgeni açar.',
    'Yıldız ile üçgen arasında karşılıklı kilitleme (birinin kapalı kontağı öbürünün satırında) gerekir.',
  ],
  scenarios: [
    scenario("start'a kısa bas, 8 s bekle", '0.5s:X0=1 0.7s:X0=0', 8, [
      on(1.0, 'Y0', 'Start\'a basılınca ana kontaktör çekmeli ve kendini tutmalı.'),
      on(1.0, 'Y1', 'Kalkış yıldızla başlamalı ve yıldız 5 s çekik kalmalı.'),
      off(1.0, 'Y2', 'Kalkışta üçgen değil, yıldız çekmeli.'),
      on(4.5, 'Y1'),
      off(4.5, 'Y2'),
      off(6.8, 'Y1'),
      on(6.8, 'Y2', 'Üçgen, yıldız bıraktıktan en geç 1 s sonra çekmeli.'),
      on(7.5, 'Y0', 'Üçgende çalışırken ana kontaktör çekik kalmalı.'),
    ], {
      invariants: [notBoth('Y1', 'Y2', 'Yıldız ile üçgen arasında kilitleme eksik ya da geçiş sırası yanlış.')],
      timing: [delay('X0', 'rise', 5, 'Y1', 'fall')],
    }),
    scenario('yıldızdayken stop', '0.5s:X0=1 0.7s:X0=0 3s:X1=1 3.2s:X1=0', 8, [
      off(3.5, 'Y0', 'Stop bütün kontaktörleri bırakmalı.'),
      off(3.5, 'Y1', 'Stop bütün kontaktörleri bırakmalı.'),
    ], { invariants: [never('Y2', 'Yıldız fazında stop\'a basıldı; üçgen hiç çekmemeli.')] }),
    scenario('üçgende çalışırken stop', '0.5s:X0=1 0.7s:X0=0 8s:X1=1 8.2s:X1=0', 9, [
      on(7.5, 'Y2'),
      off(8.5, 'Y0', 'Stop bütün kontaktörleri bırakmalı.'),
      off(8.5, 'Y1'),
      off(8.5, 'Y2', 'Stop bütün kontaktörleri bırakmalı.'),
    ], { invariants: [notBoth('Y1', 'Y2', 'Yıldız ile üçgen arasında kilitleme eksik ya da geçiş sırası yanlış.')] }),
    scenario("stop'tan sonra yeniden start", '0.5s:X0=1 0.7s:X0=0 7s:X1=1 7.2s:X1=0 8s:X0=1 8.2s:X0=0', 15, [
      on(9.0, 'Y1', 'Yeniden kalkışta yine önce yıldız çekmeli; zamanlayıcı stop\'ta sıfırlanmalı.'),
      off(9.0, 'Y2', 'Yeniden kalkışta yine önce yıldız çekmeli; zamanlayıcı stop\'ta sıfırlanmalı.'),
      on(14.4, 'Y2'),
    ], {
      invariants: [notBoth('Y1', 'Y2', 'Yıldız ile üçgen arasında kilitleme eksik ya da geçiş sırası yanlış.')],
      timing: [delay('X0', 'rise', 5, 'Y1', 'fall', { n: 2 })],
    }),
  ],
});

export const anaSalter = define({
  id: 'ana-salter',
  title: 'Ana şalter (MC/MCR)',
  level: 3,
  task: [
    'İki motor var: start 1 (X1) / stop 1 (X2) motor 1\'i (Y0), start 2 (X3) / stop 2 (X4) motor 2\'yi (Y1) mühürlemeyle çalıştırır.',
    'Hepsinin üstünde bir ana şalter (X0) var. Şalter kapalıyken start butonları işe yaramaz. Şalter kapanınca çalışan motorlar durur ve şalter yeniden açılınca kendiliğinden kalkmaz (start\'a yeniden basmak gerekir).',
    'Öneri: MC/MCR ana kontrol bloğuyla çöz (davranışı sağlayan her çözüm geçer). Şalter kalıcı konumludur (açıkken X0 = 1); ' + NO,
  ].join('\n'),
  summary: 'Şalter (X0) açıkken iki motor (Y0, Y1) start/stop ile çalışır; şalter kapanınca durur, açılınca kendiliğinden kalkmaz.',
  inputs: [io('X0', 'şalter', 'anahtar'), io('X1', 'start 1', 'buton'), io('X2', 'stop 1', 'buton'), io('X3', 'start 2', 'buton'), io('X4', 'stop 2', 'buton')],
  outputs: [io('Y0', 'motor 1', 'motor'), io('Y1', 'motor 2', 'motor')],
  solutionIl: `LD X0
MC N0
LD X1
OR Y0
ANI X2
OUT Y0
LD X3
OR Y1
ANI X4
OUT Y1
MCR N0
END`,
  hints: [
    'Her motor, ilk alıştırmadaki gibi kendi mühürlemesiyle kurulur.',
    'MC bloğu kapalıyken içindeki OUT çıkışları 0 yazılır; böylece mühürlemeler de çözülür.',
    'SET ile kurulmuş bir çıkış MC kapanınca kendiliğinden bırakmaz; burada OUT\'lu mühürleme işini görür.',
  ],
  scenarios: [
    scenario('şalter açık, iki motor ayrı ayrı', '0.2s:X0=1 0.5s:X1=1 0.7s:X1=0 1s:X3=1 1.2s:X3=0 2s:X2=1 2.2s:X2=0 2.5s:X4=1 2.7s:X4=0', 3.2, [
      on(1.5, 'Y0', 'Şalter açıkken start 1 motor 1\'i çalıştırmalı ve kendini tutmalı.'),
      on(1.5, 'Y1', 'Şalter açıkken start 2 motor 2\'yi çalıştırmalı ve kendini tutmalı.'),
      off(2.4, 'Y0', 'Stop 1 motor 1\'i durdurmalı.'),
      on(2.4, 'Y1', 'Stop 1 yalnızca motor 1\'i durdurmalı.'),
      off(3.0, 'Y1', 'Stop 2 motor 2\'yi durdurmalı.'),
    ]),
    scenario("şalter kapalıyken start'a bas, sonra şalteri aç", '0.5s:X1=1 0.7s:X1=0 1s:X3=1 1.2s:X3=0 2s:X0=1 3s:X1=1 3.2s:X1=0', 4, [
      off(1.5, 'Y0', 'Şalter kapalıyken start işe yaramamalı.'),
      off(1.5, 'Y1', 'Şalter kapalıyken start işe yaramamalı.'),
      off(2.5, 'Y0', 'Şalter açılınca motor kendiliğinden kalkmamalı; start\'a yeniden basılmalı.'),
      off(2.5, 'Y1', 'Şalter açılınca motor kendiliğinden kalkmamalı; start\'a yeniden basılmalı.'),
      on(3.6, 'Y0', 'Şalter açıkken start 1 motor 1\'i çalıştırmalı.'),
    ]),
    scenario('çalışırken şalteri kapat, yeniden aç', '0.2s:X0=1 0.5s:X1=1 0.7s:X1=0 1s:X3=1 1.2s:X3=0 2s:X0=0 3s:X0=1', 4, [
      on(1.6, 'Y0'),
      on(1.6, 'Y1'),
      off(2.5, 'Y0', 'Şalter kapanınca çalışan motorlar durmalı.'),
      off(2.5, 'Y1', 'Şalter kapanınca çalışan motorlar durmalı.'),
      off(3.6, 'Y0', 'Şalter yeniden açılınca motorlar kendiliğinden kalkmamalı.'),
      off(3.6, 'Y1', 'Şalter yeniden açılınca motorlar kendiliğinden kalkmamalı.'),
    ]),
  ],
});
