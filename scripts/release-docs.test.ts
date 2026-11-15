// Release 절차(spec-company-setup B6)가 실제 산출물 이름과 맞는지 본다.
// GitHub은 Release 자산 이름에 [0-9A-Za-z._-] 밖의 문자(공백 등)를 바꿔 올리므로, 문서의 받기·설치 명령이 그 이름과 어긋나면 안 된다.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string; build: { dmg: { artifactName: string } } };
const setup = readFileSync(join(ROOT, 'docs', 'setup.md'), 'utf8');
/** electron-builder가 채우는 자리에 실제 값을 넣은 dmg 이름 */
const dmgName = pkg.build.dmg.artifactName.replace('${version}', pkg.version).replace('${arch}', 'arm64').replace('${ext}', 'dmg');

describe('Release 절차와 산출물 이름 (B6)', () => {
  it('dmg 이름이 GitHub이 그대로 받아들이는 문자만 쓴다', () => {
    expect(dmgName).toMatch(/^[0-9A-Za-z._-]+$/);
    expect(dmgName).toContain(pkg.version);
  });

  it('설치 문서의 받기·설치 명령이 그 이름 규칙과 맞고, 공백 들어간 옛 이름을 쓰지 않는다', () => {
    expect(setup).not.toMatch(/Agent\\? Browser-\*/);
    const pattern = dmgName.replace(pkg.version, '*');
    expect(setup).toContain(pattern); // 받은 폴더에서 고르는 이름
  });

  it('받는 폴더를 비우고 받는다(지난 dmg가 남아 둘 이상이 잡히지 않게)', () => {
    const download = setup.slice(setup.indexOf('## 2-나'), setup.indexOf('## 3.'));
    expect(download).toMatch(/rm -rf \/tmp\/agent-browser-release/);
    expect(download.indexOf('rm -rf /tmp/agent-browser-release')).toBeLessThan(download.indexOf('gh release download'));
  });

  it('Release 올리기는 이번 버전의 dmg 하나만 올린다(release/에 쌓인 옛 dmg 제외)', () => {
    const upload = setup.slice(setup.indexOf('## Release 올리기'));
    expect(upload).not.toMatch(/release\/[^\n]*\*[^\n]*\.dmg/);
  });
});
