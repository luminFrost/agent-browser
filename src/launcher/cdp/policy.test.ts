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
