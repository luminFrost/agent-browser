import { describe, it, expect } from 'vitest';
import { normalizeAddress } from './url';

describe('normalizeAddress', () => {
  it.each([
    ['https://example.com/x', 'https://example.com/x'],
    ['http://127.0.0.1:8080/a', 'http://127.0.0.1:8080/a'],
    ['about:blank', 'about:blank'],
    ['data:text/html,hi', 'data:text/html,hi'],
    ['example.com', 'https://example.com'],
    ['  example.com/path?q=1  ', 'https://example.com/path?q=1'],
    ['localhost:3000/x', 'http://localhost:3000/x'],
    ['127.0.0.1:61478/a', 'http://127.0.0.1:61478/a'],
    ['[::1]:8080', 'http://[::1]:8080'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
  });

  it('빈 입력은 null', () => {
    expect(normalizeAddress('   ')).toBeNull();
  });

  it('javascript: 주소는 주소창에서 실행하지 않는다', () => {
    expect(normalizeAddress('javascript:alert(1)')).toBeNull();
  });
});
