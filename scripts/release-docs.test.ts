// Release 절차(spec-company-setup B6, 카드 20261119-release-ci)가 실제 산출물 이름과 맞는지 본다.
// GitHub은 Release 자산 이름에 [0-9A-Za-z._-] 밖의 문자(공백 등)를 바꿔 올리므로, 문서의 받기·설치 명령이 그 이름과 어긋나면 안 된다.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string; build: { dmg: { artifactName: string } } };
const setup = readFileSync(join(ROOT, 'docs', 'setup.md'), 'utf8');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
const installer = readFileSync(join(ROOT, 'scripts', 'install-mac.sh'), 'utf8');
/** 설치 스크립트가 등록하는 붙이기 명령 경로(/Applications에 설치했을 때) */
const attachPath = `/Applications/${/APP_NAME="([^"]+)"/.exec(installer)![1]}/${/ATTACH_REL="([^"]+)"/.exec(installer)![1]}`;
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
    const download = setup.slice(setup.indexOf('## 2-가'), setup.indexOf('## 2-나'));
    expect(download).toMatch(/rm -rf \/tmp\/agent-browser-release/);
    expect(download.indexOf('rm -rf /tmp/agent-browser-release')).toBeLessThan(download.indexOf('gh release download'));
  });

  it('U2: 설치 줄이 받은 폴더의 파일을 쓰고, 받기 --pattern이 실제 자산 이름에 맞는다', () => {
    const block = setup.slice(setup.indexOf('## 2-가'), setup.indexOf('## 2-나'));
    const dir = /gh release download[^\n]*--dir (\S+)/.exec(block)?.[1];
    expect(dir).toBeTruthy();
    const patterns = [...block.matchAll(/--pattern '([^']+)'/g)].map((m) => m[1]);
    const glob = (p: string) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
    const assets = [dmgName, 'install-mac.sh'];
    for (const a of assets) expect(patterns.some((p) => glob(p).test(a)), a).toBe(true);
    const install = /^bash (\S+)\/install-mac\.sh --from-dmg (\S+)\/(\S+)$/m.exec(block);
    expect(install, '설치 줄').toBeTruthy();
    expect(install![1]).toBe(dir);
    expect(install![2]).toBe(dir);
    expect(glob(install![3]).test(dmgName)).toBe(true);
  });

  it('Release 올리기는 이번 버전의 dmg 하나만 올린다(release/에 쌓인 옛 dmg 제외)', () => {
    const upload = setup.slice(setup.indexOf('## Release 올리기'));
    expect(upload).not.toMatch(/release\/[^\n]*\*[^\n]*\.dmg/);
    expect(workflow).not.toMatch(/release\/[^\n]*\*[^\n]*\.dmg/);
  });
});

describe('PR CI (카드 20261122-pr-ci)', () => {
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  it('PR과 main push에서 Linux(lint·build·E2E 창 표시)와 macOS(lint·단위 시험)를 돌리고, 시험을 건너뛰지 않는다', () => {
    expect(ci).toMatch(/pull_request/);
    expect(ci).toMatch(/branches:\s*\[\s*main\s*\]/);
    expect(ci).toMatch(/runs-on:\s*ubuntu-/);
    expect(ci).toMatch(/runs-on:\s*macos-1\d/);
    expect(ci).toContain('xvfb-run');
    expect(ci).toContain("AB_TEST_SHOW: '1'");
    expect(ci).toContain('npx playwright test');
    expect(ci).toContain('npx vitest run');
    expect(ci).not.toMatch(/--grep-invert|test\.skip|AB_DIST_SKIP/);
  });
});

describe('소스 없이 dmg로 설치 (카드 20261119-release-ci)', () => {
  it('기본 설치 경로(2-가)가 Release이고, 저장소 안의 스크립트가 아니라 Release에 올린 install-mac.sh를 쓴다', () => {
    const release = setup.slice(setup.indexOf('## 2-가'), setup.indexOf('## 2-나'));
    expect(release).toContain('gh release download');
    expect(release).toContain("--pattern 'install-mac.sh'");
    expect(release).not.toContain('scripts/install-mac.sh');
    expect(setup.slice(setup.indexOf('## 2-나'), setup.indexOf('## 3.'))).toContain('scripts/install-mac.sh'); // 소스 빌드는 개발자용
  });

  it('CI가 macOS arm64에서 시험한 뒤 그 버전의 dmg와 설치 스크립트를 올리고, 태그와 버전이 다르면 멈춘다', () => {
    expect(workflow).toMatch(/runs-on:\s*macos-1\d/);
    expect(workflow).toMatch(/tags:\s*\[?\s*'?v\*/);
    expect(workflow).toContain('npm run dist');
    expect(workflow).toContain('playwright test -c playwright.dist.config.ts');
    // CI에서 빼는 것은 P5의 "앞으로 오기" 하나뿐이다(그 밖의 묶은 앱 시험은 모두 게이트)
    expect(workflow.match(/AB_DIST_SKIP_\w+/g)).toEqual(['AB_DIST_SKIP_FRONTMOST']);
    expect(workflow).toContain(pkg.build.dmg.artifactName.replace('${version}', '$VERSION').replace('${arch}', 'arm64').replace('${ext}', 'dmg'));
    expect(workflow).toContain('scripts/install-mac.sh');
    expect(workflow).toMatch(/태그와 package\.json 버전이 다르다/);
  });

  it('묶기는 스스로 올리지 않는다(CI에서 electron-builder가 토큰 없이 올리려다 멈춘다. 올리기는 워크플로가 한다)', () => {
    const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts.dist).toMatch(/electron-builder[^&]*--publish never/);
  });

  it('업데이트 확인: 설치된 버전을 읽는 명령과 최신 Release를 보는 곳이 README·setup.md에 있고, Release 노트에 바뀐 내용이 자동으로 들어간다', () => {
    const versionCmd = `defaults read "/Applications/${/APP_NAME="([^"]+)"/.exec(installer)![1]}/Contents/Info" CFBundleShortVersionString`;
    const quick = readme.slice(readme.indexOf('## 빠른 시작'), readme.indexOf('## 쓰는 법'));
    expect(quick).toContain(versionCmd);
    expect(quick).toMatch(/Watch[^\n]*Releases/);
    const update = setup.slice(setup.indexOf('## 업데이트'), setup.indexOf('## Release 올리기'));
    expect(update).toContain(versionCmd);
    expect(update).toContain('gh release view --repo luminFrost/agent-browser');
    expect(workflow).toContain('--generate-notes');
  });

  it('README 빠른 시작: Release에서 dmg 받기 → 처음 열기 → claude mcp add 한 줄(설치 스크립트와 같은 경로), 업데이트 방법', () => {
    const quick = readme.slice(readme.indexOf('## 빠른 시작'), readme.indexOf('## 쓰는 법'));
    expect(quick).toContain('releases/latest');
    expect(quick).toContain(`claude mcp add --scope user agent-browser -- "${attachPath}"`);
    expect(quick).toMatch(/업데이트/);
    expect(quick.indexOf('releases/latest')).toBeLessThan(quick.indexOf('git clone') === -1 ? Infinity : quick.indexOf('git clone'));
  });
});
