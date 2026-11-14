import { describe, it, expect } from 'vitest';
import { isAuthorized, newToken } from './auth';

describe('제어 토큰', () => {
  const token = newToken();

  it('토큰은 추측하기 어려운 길이(32바이트, base64url)이고 매번 다르다', () => {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
  });

  it.each([
    ['맞는 Bearer 토큰', `Bearer ${token}`, true],
    ['헤더 없음', undefined, false],
    ['빈 문자열', '', false],
    ['틀린 토큰', `Bearer ${newToken()}`, false],
    ['길이가 다른 토큰', `Bearer ${token}x`, false],
    ['Bearer 없이 토큰만', token, false],
    ['다른 방식', `Basic ${token}`, false],
  ])('%s → %s', (_name, header, expected) => {
    expect(isAuthorized(header, token)).toBe(expected);
  });
});
