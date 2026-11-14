/**
 * CDP 명령을 어떻게 다룰지 정하는 표(docs/design.md 인터페이스 절).
 * 브라우저 수준(sessionId 없음)은 허용 목록, 페이지 세션은 차단 목록이다.
 */

/** 브라우저 수준 명령의 처리 방식 */
export type BrowserLevelAction =
  | 'forward' // 그대로 넘긴다
  | 'forwardOwnTarget' // params.targetId가 자기 탭일 때만 넘긴다(없으면 넘긴다)
  | 'requireOwnTarget' // params.targetId가 꼭 있고 자기 탭이어야 넘긴다
  | 'attach' // 자기 탭에 flatten으로 붙는다
  | 'detach' // 자기 세션만 뗀다
  | 'getTargets' // 자기 탭만 돌려준다
  | 'ignore'; // 넘기지 않고 {}로 답한다

const BROWSER_LEVEL: Record<string, BrowserLevelAction> = {
  'Browser.getVersion': 'forward',
  'Target.getBrowserContexts': 'forward',
  'Target.getTargetInfo': 'forwardOwnTarget',
  'Target.getTargets': 'getTargets',
  'Target.attachToTarget': 'attach',
  'Target.detachFromTarget': 'detach',
  'Target.getDevToolsTarget': 'requireOwnTarget',
  'Browser.setDownloadBehavior': 'ignore',
};

/** 브라우저 수준 명령의 처리 방식. 표에 없으면 undefined(= 막는다) */
export function browserLevelAction(method: string): BrowserLevelAction | undefined {
  return Object.hasOwn(BROWSER_LEVEL, method) ? BROWSER_LEVEL[method] : undefined;
}

/** 페이지 세션에서도 허용하는 Target 명령(자기 페이지 안의 iframe·worker 다루기) */
const SESSION_TARGET_ALLOWED = new Set(['Target.setAutoAttach', 'Target.autoAttachRelated', 'Target.detachFromTarget', 'Target.getTargetInfo']);

/**
 * 페이지 세션 명령을 막아야 하면 그 이유를, 넘겨도 되면 undefined를 돌려준다.
 */
export function sessionLevelBlockReason(method: string, params: Record<string, unknown> = {}): string | undefined {
  if (method.startsWith('Browser.') && method !== 'Browser.getVersion') return '페이지 세션에서 Browser 명령은 쓸 수 없다';
  if (method.startsWith('Target.')) {
    if (!SESSION_TARGET_ALLOWED.has(method)) return '페이지 세션에서 이 Target 명령은 쓸 수 없다';
    if (method === 'Target.getTargetInfo' && params.targetId !== undefined) return '페이지 세션에서 다른 대상의 정보는 볼 수 없다';
  }
  return undefined;
}
