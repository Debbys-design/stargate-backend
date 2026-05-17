import { randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;
const keylen = 64;
const params = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, keylen, params)) as Buffer;
  return `scrypt$32768$8$1$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, n, r, p, salt, digest] = stored.split('$');
  const derived = (await scrypt(password, salt, keylen, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return timingSafeEqual(Buffer.from(digest, 'hex'), derived);
}
