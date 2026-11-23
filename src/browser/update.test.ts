// 카드 20261123-update-notice U1: 최신 Release 해석과 버전 비교
import { describe, expect, it } from 'vitest';
import { compareVersions, latestReleaseApi, parseRelease, checkForUpdate, UPDATE_CHECK_INTERVAL_MS, dmgAssetName, appBundlePath } from './update';

const release = (tag: string, assets: string[]) => ({
  tag_name: tag,
  html_url: `https://github.com/o/r/releases/tag/${tag}`,
  assets: assets.map((name) => ({ name, browser_download_url: `https://dl/${name}` })),
});

describe('버전 비교', () => {
  it('숫자로 비교한다(0.2.10 > 0.2.9), 앞의 v는 무시', () => {
    expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.2.4', '0.2.4')).toBe(0);
    expect(compareVersions('0.2.3', '0.3.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
  });
  it('형식이 아니면 NaN(새 버전으로 보지 않는다)', () => {
    expect(compareVersions('latest', '0.2.4')).toBeNaN();
  });
});

describe('Release 주소 (하드코딩하지 않고 package.json repository에서)', () => {
  it('repository 주소에서 GitHub API latest 주소를 만든다', () => {
    expect(latestReleaseApi('https://github.com/luminFrost/agent-browser.git')).toBe('https://api.github.com/repos/luminFrost/agent-browser/releases/latest');
    expect(latestReleaseApi({ type: 'git', url: 'git+https://github.com/o/r' })).toBe('https://api.github.com/repos/o/r/releases/latest');
    expect(latestReleaseApi('github:o/r')).toBe('https://api.github.com/repos/o/r/releases/latest');
  });
  it('알 수 없으면 undefined(묻지 않는다)', () => {
    expect(latestReleaseApi(undefined)).toBeUndefined();
    expect(latestReleaseApi('https://example.com/x')).toBeUndefined();
  });
  it('dmg 이름은 묶기 설정과 같은 규칙', () => {
    expect(dmgAssetName('0.2.4')).toBe('Agent-Browser-0.2.4-arm64.dmg');
  });
});

describe('Release 응답 해석', () => {
  it('지금보다 높고 그 버전 dmg가 있으면 업데이트 정보', () => {
    expect(parseRelease(release('v9.9.9', ['Agent-Browser-9.9.9-arm64.dmg', 'install-mac.sh']), '0.2.4')).toEqual({
      version: '9.9.9', dmgName: 'Agent-Browser-9.9.9-arm64.dmg', dmgUrl: 'https://dl/Agent-Browser-9.9.9-arm64.dmg', pageUrl: 'https://github.com/o/r/releases/tag/v9.9.9',
    });
  });
  it('같거나 낮으면 없음', () => {
    expect(parseRelease(release('v0.2.4', ['Agent-Browser-0.2.4-arm64.dmg']), '0.2.4')).toBeUndefined();
    expect(parseRelease(release('v0.2.3', ['Agent-Browser-0.2.3-arm64.dmg']), '0.2.4')).toBeUndefined();
  });
  it('그 버전 dmg가 없거나 형식이 틀리면 없음', () => {
    expect(parseRelease(release('v9.9.9', ['Agent-Browser-9.9.8-arm64.dmg']), '0.2.4')).toBeUndefined();
    expect(parseRelease({ message: 'Not Found' }, '0.2.4')).toBeUndefined();
    expect(parseRelease(null, '0.2.4')).toBeUndefined();
    expect(parseRelease({ tag_name: 'v9.9.9', assets: 'x' }, '0.2.4')).toBeUndefined();
  });
});

describe('묻기', () => {
  it('응답을 해석해 돌려주고, 실패(HTTP 오류·JSON 아님·연결 실패)는 없음', async () => {
    const ok = async () => new Response(JSON.stringify(release('v9.9.9', ['Agent-Browser-9.9.9-arm64.dmg'])), { status: 200 });
    expect((await checkForUpdate('http://x', '0.2.4', ok))?.version).toBe('9.9.9');
    expect(await checkForUpdate('http://x', '0.2.4', async () => new Response('nope', { status: 500 }))).toBeUndefined();
    expect(await checkForUpdate('http://x', '0.2.4', async () => new Response('<html>', { status: 200 }))).toBeUndefined();
    expect(await checkForUpdate('http://x', '0.2.4', async () => { throw new Error('ECONNREFUSED'); })).toBeUndefined();
  });
  it('다시 묻는 간격은 6시간', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe('앱 묶음 경로 (U2: 설치 스크립트에 넘기는 자리)', () => {
  it('실행 파일 경로에서 .app 묶음을 얻는다(공백·~/Applications 포함)', () => {
    expect(appBundlePath('/Applications/Agent Browser.app/Contents/MacOS/Agent Browser')).toBe('/Applications/Agent Browser.app');
    expect(appBundlePath('/Users/a/Applications/Agent Browser.app/Contents/MacOS/Agent Browser')).toBe('/Users/a/Applications/Agent Browser.app');
  });
  it('묶음 안이 아니면 그대로', () => {
    expect(appBundlePath('/usr/lib/electron/electron')).toBe('/usr/lib/electron/electron');
  });
});
