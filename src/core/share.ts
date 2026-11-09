// Paylaşım bağlantısı: IL metni ↔ base64url (UTF-8). Tarayıcı ve Node'da aynı çalışır.

export function encodeShare(il: string): string {
  const bytes = new TextEncoder().encode(il);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const SITE_URL = 'https://delta-plc-sim.delidana-lab.workers.dev/';

export interface ShareOptions {
  name?: string;
  run?: boolean;
  base?: string;
}

/** Devreyi açan bağlantı: <site>#il=<kod>&ad=<ad>&run=1 */
export function shareLink(il: string, opts: ShareOptions = {}): string {
  const p = new URLSearchParams();
  p.set('il', encodeShare(il));
  if (opts.name) p.set('ad', opts.name);
  if (opts.run) p.set('run', '1');
  return (opts.base ?? SITE_URL) + '#' + p.toString();
}
