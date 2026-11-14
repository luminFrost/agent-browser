import { randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

/** 실행할 때마다 새 제어 토큰(32바이트, base64url) */
export const newToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

/** `Authorization: Bearer <token>` 헤더가 맞는지 상수 시간으로 비교한다 */
export function isAuthorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
