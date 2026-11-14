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
  ])('%s', (method) => {
    expect(sessionLevelBlockReason(method)).toMatch(/공유/);
  });

  it('자기 페이지의 일은 막지 않는다', () => {
    for (const m of ['Network.enable', 'Network.getCookies', 'Network.setCookie', 'Network.setCookies', 'Storage.getCookies', 'Page.reload']) expect(sessionLevelBlockReason(m), m).toBeUndefined();
  });
});
