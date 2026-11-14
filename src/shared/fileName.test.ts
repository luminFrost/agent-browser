import { describe, it, expect } from 'vitest';
import { safeFileName, uniqueName } from './fileName';

describe('다운로드 파일 이름', () => {
  it('겹치지 않으면 그대로, 겹치면 (1), (2)…를 확장자 앞에 붙인다', () => {
    const taken = new Set(['a.bin', 'a (1).bin', 'noext']);
    const exists = (n: string) => taken.has(n);
    expect(uniqueName('b.bin', exists)).toBe('b.bin');
    expect(uniqueName('a.bin', exists)).toBe('a (2).bin');
    expect(uniqueName('noext', exists)).toBe('noext (1)');
  });

  it('경로 구분자와 숨김·빈 이름을 막는다(폴더 밖으로 나가지 못하게)', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('a/b\\c.txt')).toBe('c.txt');
    expect(safeFileName('..')).toBe('download');
    expect(safeFileName('')).toBe('download');
    expect(safeFileName('.hidden')).toBe('hidden');
  });
});
