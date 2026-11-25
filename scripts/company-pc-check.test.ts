// 회사 PC 확인표(카드 20261122-release-v022 R2·R3)가 실제 버전·이름·화면 글자와 맞는지 본다.
// 확인표는 사람이 Mac에서 따라 하는 문서라, 글자가 코드와 어긋나면 따라 할 수 없다.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const pkg = JSON.parse(read('package.json')) as { version: string; build: { dmg: { artifactName: string } } };
const lock = JSON.parse(read('package-lock.json')) as { version: string; packages: { '': { version: string } } };
const CHECK = join('docs', 'verify', '20261125-company-pc-check-0.2.9.md');
const check = read(CHECK);
// 화면 글자: 사람 창 UI와 앱 메뉴(메뉴 이름도 사람이 보는 글자다, 카드 20261123-update-check-now)
const ui = read('src', 'browser', 'renderer', 'human', 'index.html') + read('src', 'browser', 'renderer', 'human', 'human.ts') + read('src', 'browser', 'appMenu.ts');

describe('회사 PC 확인표 (R1~R4)', () => {
  it('R1 package.json과 lock의 버전이 같고, 확인표가 그 버전을 확인한다', () => {
    expect(pkg.version).toBe('0.2.9');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
    expect(check).toContain(`\`${pkg.version}\``);
  });

  it('R2 확인할 항목을 모두 다룬다', () => {
    for (const heading of ['설치·업데이트', 'MCP 연결', '세션 이름', '여러 세션의 탭', '따라 보기', '최소화·Cmd+H', '다른 앱 포커스', '앞 창', '승인 알림', '자동 거부']) {
      expect(check, heading).toMatch(new RegExp(`^## \\d+\\. ${heading.replace(/[+.]/g, '\\$&')}`, 'm'));
    }
    expect(check).toMatch(/\| 결과 \|/);
  });

  it('R3 dmg 이름·환경 변수·알림 제목이 코드와 같다', () => {
    const dmg = pkg.build.dmg.artifactName.replace('${version}', pkg.version).replace('${arch}', 'arm64').replace('${ext}', 'dmg');
    expect(check).toContain(dmg);
    expect(read('src', 'attach', 'attach.ts')).toContain('AGENT_BROWSER_LABEL');
    expect(check).toContain('AGENT_BROWSER_LABEL');
    expect(read('src', 'browser', 'gate', 'approvals.ts')).toContain('승인 요청 · ');
    expect(check).toContain('승인 요청 · ');
  });

  it('R3 확인표가 쓰는 화면 글자는 실제 화면에 있다', () => {
    for (const label of [...check.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]).filter((l) => l.startsWith('[') === false)) {
      if (/^(기대|주의|준비)$/.test(label)) continue; // 문서 안의 표시어
      expect(ui, label).toContain(label);
    }
  });

  it('R4 README와 setup.md가 확인표를 가리킨다', () => {
    expect(read('README.md')).toContain(CHECK.replaceAll('\\', '/'));
    expect(read('docs', 'setup.md')).toContain('verify/20261125-company-pc-check-0.2.9.md');
  });
});
