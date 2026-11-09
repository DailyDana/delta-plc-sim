// React bileşenlerinin canlı simülasyon verisine abone olması için kancalar.
import { useEffect, useSyncExternalStore } from 'react';
import { engine } from './engine';

/** Motorun durum sürümü: değiştikçe bileşen yeniden çizilir (kare başına en çok bir kez) */
export function useLive(): number {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.version,
    () => 0,
  );
}

/** Yeniden çizim olmadan her karede doğrudan DOM güncellemesi için (ladder gibi büyük görünümler) */
export function useFrame(fn: () => void, deps: unknown[]): void {
  useEffect(() => {
    fn();
    return engine.subscribe(fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
