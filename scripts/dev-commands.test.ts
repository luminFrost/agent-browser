// 개발 진입점과 확인 명령(카드 20261123-qa-followups Q6·Q7, DOC-08-IMP IMP-F1·F2).
// package.json의 main이 없는 파일을 가리키거나, 확인 명령이 한 OS에서 끝까지 돌지 않으면 검증 결과를 믿을 수 없다.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { main: string; scripts: Record<string, string>; build: { extraMetadata?: { main?: string } } };

describe('진입점·확인 명령 (Q6·Q7)', () => {
  it('Q6: main은 빌드 결과에 있는 진입점(그 원본 ts가 있는 파일)이고, 묶은 앱의 진입점과 같다', () => {
    const source = pkg.main.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts');
    expect(existsSync(join(ROOT, source)), source).toBe(true);
    expect(pkg.main).toBe(pkg.build.extraMetadata?.main);
  });

  it('Q7: npm test는 단위 시험이 실패해도 E2E를 끝까지 돌리고, 하나라도 실패하면 실패로 끝난다', () => {
    const test = pkg.scripts.test;
    expect(test).toContain('npm run build');
    expect(test).toContain('vitest run');
    expect(test).toContain('playwright test');
    // vitest가 실패하면 &&로 E2E를 건너뛰지 않는다
    expect(test).not.toMatch(/vitest run\s*&&\s*playwright/);
    expect(test).toMatch(/exit/);
  });

  it('Q7: E2E만 도는 test:e2e가 있고, CLAUDE.md 확인 명령이 OS별 사정을 적는다', () => {
    expect(pkg.scripts['test:e2e']).toMatch(/npm run build && playwright test/);
    const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('npm run test:e2e');
    expect(claude).toMatch(/Linux[^\n]*macOS 전용/);
  });
});
