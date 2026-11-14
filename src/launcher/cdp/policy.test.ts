import { describe, it, expect } from 'vitest';
import { browserLevelAction, sessionLevelBlockReason } from './policy';

describe('브라우저 수준 허용 목록 (design.md 표)', () => {
  it.each([
    ['Browser.getVersion', 'forward'],
    ['Target.getBrowserContexts', 'forward'],
    ['Target.getTargets', 'getTargets'],
    ['Target.attachToTarget', 'attach'],
    ['Target.detachFromTarget', 'detach'],
    ['Target.getTargetInfo', 'forwardOwnTarget'],
    ['Target.getDevToolsTarget', 'requireOwnTarget'],
    ['Browser.setDownloadBehavior', 'ignore'],
  ])('%s → %s', (method, action) => {
    expect(browserLevelAction(method)).toBe(action);
  });

  it.each(['Browser.close', 'Browser.crash', 'Target.attachToBrowserTarget', 'Target.createBrowserContext', 'Target.exposeDevToolsProtocol', 'Storage.clearCookies', 'SystemInfo.getInfo', 'toString', '__proto__', 'constructor'])(
    '표에 없는 %s는 막는다',
    (method) => { expect(browserLevelAction(method)).toBeUndefined(); },
  );
});

describe('페이지 세션 명령', () => {
  it.each(['Runtime.evaluate', 'Page.navigate', 'DOM.getDocument', 'Input.dispatchMouseEvent', 'Target.setAutoAttach', 'Target.getTargetInfo', 'Browser.getVersion'])(
    '%s는 넘긴다',
    (method) => { expect(sessionLevelBlockReason(method)).toBeUndefined(); },
  );

  it.each(['Target.getTargets', 'Target.attachToTarget', 'Target.createTarget', 'Target.setDiscoverTargets', 'Target.attachToBrowserTarget', 'Browser.close'])(
    '%s는 페이지 세션에서도 막는다(남의 대상·브라우저 전체에 닿음)',
    (method) => { expect(sessionLevelBlockReason(method)).toBeTypeOf('string'); },
  );

  it('페이지 세션의 getTargetInfo는 자기 자신(인자 없음)만', () => {
    expect(sessionLevelBlockReason('Target.getTargetInfo', { targetId: 'OTHER' })).toBeTypeOf('string');
  });
});

import { matchesTargetFilter } from './policy';

describe('TargetFilter 판정 (setAutoAttach·setDiscoverTargets의 filter)', () => {
  it('filter가 없으면 browser·tab을 뺀 모든 것(page 포함)', () => {
    expect(matchesTargetFilter('page', undefined)).toBe(true);
    expect(matchesTargetFilter('browser', undefined)).toBe(false);
    expect(matchesTargetFilter('tab', undefined)).toBe(false);
  });

  it('처음 맞는 항목이 정한다: [{page 제외}, {}] → page 제외, 나머지 포함 (chrome-devtools-mcp)', () => {
    const f = [{ type: 'page', exclude: true }, {}];
    expect(matchesTargetFilter('page', f)).toBe(false);
    expect(matchesTargetFilter('iframe', f)).toBe(true);
  });

  it('맞는 항목이 없으면 포함하지 않는다', () => {
    expect(matchesTargetFilter('page', [{ type: 'worker' }])).toBe(false);
    expect(matchesTargetFilter('page', [])).toBe(false);
  });

  it('[{}]는 모든 것', () => {
    expect(matchesTargetFilter('page', [{}])).toBe(true);
  });
});

describe('R7: 브라우저 전체(공유 파티션)에 영향을 주는 페이지 세션 명령은 막는다', () => {
  it.each([
    'Network.clearBrowserCookies',
    'Network.clearBrowserCache',
    'Network.deleteCookies',
    'Storage.clearDataForOrigin',
    'Storage.clearDataForStorageKey',
    'Storage.clearCookies',
    'Storage.clearSharedStorageEntries',
    'Storage.deleteStorageBucket',
    'IndexedDB.deleteDatabase',
    'IndexedDB.clearObjectStore',
    'IndexedDB.deleteObjectStoreEntries',
    'DOMStorage.clear',
    'DOMStorage.removeDOMStorageItem',
    'DOMStorage.setDOMStorageItem',
    'CacheStorage.deleteCache',
    'CacheStorage.deleteEntry',
    // 만료 시각으로 쿠키를 지울 수 있어 설정도 막는다(검증 1회차 R7 FAIL)
    'Network.setCookie',
    'Network.setCookies',
    'Storage.setCookies',
  ])('%s', (method) => {
    expect(sessionLevelBlockReason(method)).toMatch(/공유하는 로그인·저장소/);
  });

  it('자기 페이지의 일은 막지 않는다', () => {
    for (const m of ['Network.enable', 'Network.getCookies', 'Storage.getCookies', 'Page.reload', 'IndexedDB.requestDatabaseNames', 'DOMStorage.getDOMStorageItems', 'Fetch.enable', 'Fetch.fulfillRequest']) expect(sessionLevelBlockReason(m), m).toBeUndefined();
  });
});

describe('관문 우회 막기 (검증 1회차)', () => {
  it('R13: 다운로드 처리 방식을 바꾸는 명령은 페이지 세션에서 막는다', () => {
    expect(sessionLevelBlockReason('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp' })).toMatch(/다운로드/);
    expect(sessionLevelBlockReason('Browser.setDownloadBehavior')).toBeTypeOf('string');
  });

  it('R12: 가로챈 요청의 method·postData를 바꾸는 이어 보내기는 막는다', () => {
    expect(sessionLevelBlockReason('Fetch.continueRequest', { requestId: '1', method: 'POST' })).toMatch(/폼 제출/);
    expect(sessionLevelBlockReason('Fetch.continueRequest', { requestId: '1', postData: 'YT0x' })).toMatch(/폼 제출/);
    expect(sessionLevelBlockReason('Network.continueInterceptedRequest', { interceptionId: '1', method: 'POST' })).toMatch(/폼 제출/);
    expect(sessionLevelBlockReason('Fetch.continueRequest', { requestId: '1' })).toBeUndefined();
    expect(sessionLevelBlockReason('Fetch.continueRequest', { requestId: '1', url: 'https://x', headers: [] })).toBeUndefined();
  });
});

describe('ADR-0004: 페이지 세션은 허용 목록으로 거른다', () => {
  it.each([
    'ServiceWorker.unregister', 'ServiceWorker.stopAllWorkers', 'Security.setIgnoreCertificateErrors',
    'Storage.overrideQuotaForOrigin', 'Network.setCookieControls', 'SystemInfo.getInfo', 'Memory.forciblyPurgeJavaScriptMemory',
    'Foo.bar', 'Network.someFutureMethod', 'IndexedDB.someFutureWrite',
  ])('목록에 없는 %s는 막는다', (method) => {
    expect(sessionLevelBlockReason(method)).toBeTypeOf('string');
  });

  it.each([
    'Page.navigate', 'Page.enable', 'Page.captureScreenshot', 'Runtime.evaluate', 'DOM.getDocument', 'Input.dispatchMouseEvent',
    'Accessibility.getFullAXTree', 'Emulation.setDeviceMetricsOverride', 'Network.enable', 'Network.getResponseBody',
    'Fetch.enable', 'Fetch.continueRequest', 'IndexedDB.requestDatabaseNames', 'DOMStorage.getDOMStorageItems',
    'CacheStorage.requestCacheNames', 'Storage.getUsageAndQuota', 'Log.enable', 'Tracing.start', 'Target.setAutoAttach',
  ])('%s는 넘긴다', (method) => {
    expect(sessionLevelBlockReason(method)).toBeUndefined();
  });

  it('Fetch 가짜 응답·응답 이어 보내기에 Set-Cookie가 있으면 막는다(대소문자, 바이너리 헤더 포함)', () => {
    expect(sessionLevelBlockReason('Fetch.fulfillRequest', { requestId: '1', responseCode: 200, responseHeaders: [{ name: 'set-COOKIE', value: 'sid=; Max-Age=0' }] })).toMatch(/Set-Cookie/);
    const binary = Buffer.from('Content-Type: text/html\0Set-Cookie: sid=; Max-Age=0\0').toString('base64');
    expect(sessionLevelBlockReason('Fetch.fulfillRequest', { requestId: '1', responseCode: 200, binaryResponseHeaders: binary })).toMatch(/Set-Cookie/);
    expect(sessionLevelBlockReason('Fetch.continueResponse', { requestId: '1', responseHeaders: [{ name: 'Set-Cookie', value: 'a=b' }] })).toMatch(/Set-Cookie/);
    expect(sessionLevelBlockReason('Fetch.fulfillRequest', { requestId: '1', responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] })).toBeUndefined();
  });
});
