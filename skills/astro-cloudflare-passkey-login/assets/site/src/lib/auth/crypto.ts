// Random tokens, SHA-256 and HMAC on Web Crypto. Deliberately avoids workerd-only
// crypto.subtle.timingSafeEqual: HMAC checks use crypto.subtle.verify (constant-time), and
// token lookups go by hash, so nothing compares secrets directly.
import { b64url, hex, utf8 } from './encoding.ts';

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url.encode(buf);
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', utf8(text)));
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** HMAC-SHA256 of `data`, base64url. */
export async function hmacSign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    utf8(data),
  );
  return b64url.encode(new Uint8Array(sig));
}

export async function hmacVerify(
  secret: string,
  data: string,
  signature: string,
): Promise<boolean> {
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = b64url.decode(signature);
  } catch {
    return false;
  }
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig, utf8(data));
}
