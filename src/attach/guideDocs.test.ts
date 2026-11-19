// spec-embedded-sessions E8: 사람용 문서가 "세션 전용 창" 대신 사람 창 안의 세션 화면으로 설명하고, 패널의 멈추기로 끝난다고 적는다.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('세션을 사람 창 안에 둔 뒤의 안내 문서 (E8)', () => {
  for (const path of ['README.md', 'docs/setup.md']) {
    it(`${path}: 세션 전용 창·에이전트 창을 말하지 않고, 사람 창 안·패널의 멈추기를 적는다`, () => {
      const doc = read(path);
      expect(doc).not.toMatch(/세션 전용 창|에이전트 창/);
      expect(doc).toContain('사람 창 안');
      expect(doc).toMatch(/패널에서[^\n]*멈추기/);
    });
  }
});
