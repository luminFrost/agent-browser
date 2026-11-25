// 카드 20261123-update-notice U4: 앱 안 업데이트를 사람·Claude가 문서로 알 수 있는지(검증 2회차: 문서를 지워도 시험이 통과하던 빈틈)
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('앱 안 업데이트 문서 (U4)', () => {
  it('ADR-0010이 있고 끄는 법 두 가지(설정 파일·환경 변수)를 적는다', () => {
    expect(existsSync(join(ROOT, 'docs', 'adr', '0010-in-app-update.md'))).toBe(true);
    const adr = read('docs', 'adr', '0010-in-app-update.md');
    expect(adr).toContain('"updateCheck": false');
    expect(adr).toContain('AGENT_BROWSER_UPDATE_CHECK=off');
  });
  it('README가 업데이트 버튼과 끄는 법을 적는다', () => {
    const readme = read('README.md');
    expect(readme).toContain('**업데이트**');
    expect(readme).toContain('"updateCheck": false');
  });
  it('setup.md가 앱 안 업데이트를 가리킨다', () => {
    expect(read('docs', 'setup.md')).toContain('ADR-0010');
  });
  it('회사 PC 확인표 v0.2.7에 12장(테마·업데이트·업데이트 확인 메뉴·탭 크기·단축키)이 있다', () => {
    const check = read('docs', 'verify', '20261125-company-pc-check-0.2.7.md');
    expect(check).toMatch(/^## 12\. v0\.2\.4~v0\.2\.7에서 바뀐 것/m);
    for (const id of ['12-1', '12-4', '12-5', '12-6', '12-7', '12-8', '12-9', '12-10']) expect(check).toMatch(new RegExp(`^\\| ${id} \\|`, 'm'));
  });
  it('README·spec·ADR-0010이 1시간 간격과 "업데이트 확인…" 메뉴를 적고 6시간은 남기지 않는다(카드 20261123-update-check-now C3)', () => {
    for (const f of [['README.md'], ['docs', 'spec-update-notice.md'], ['docs', 'adr', '0010-in-app-update.md']]) {
      const text = read(...f);
      expect(text, f.join('/')).toContain('1시간');
      expect(text, f.join('/')).toContain('업데이트 확인…');
      expect(text, f.join('/')).not.toContain('6시간');
    }
  });
});
