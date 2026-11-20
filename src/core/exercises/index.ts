// Alıştırma listesi. Sıra öğrenciye gösterilen sıradır; kimlikler (id) kalıcıdır, sıra değişse de değiştirme.

import type { Exercise } from '../exercise';
import { ileriGeri, ikiYerden, muhurleme, setRst } from './kumanda';
import { anaSalter, siraliKalkis, yildizUcgen } from './uygulama';
import { flasor, gecikmeliCalisma, gecikmeliKapanma, sayici, tekButon } from './zaman';

export const EXERCISES: Exercise[] = [
  muhurleme,
  ikiYerden,
  setRst,
  ileriGeri,
  gecikmeliCalisma,
  gecikmeliKapanma,
  flasor,
  sayici,
  tekButon,
  siraliKalkis,
  yildizUcgen,
  anaSalter,
];
