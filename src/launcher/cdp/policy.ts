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
  | 'setDiscoverTargets' // 연결 상태로 흉내
  | 'setAutoAttach' // 연결 상태로 흉내
  | 'createTarget' // 앱이 세션 창에 탭을 만든다
  | 'closeTarget' // 자기 탭만, 앱이 닫는다
  | 'activateTarget' // 자기 탭만, 앱이 앞으로 가져온다
  | 'ignore'; // 넘기지 않고 {}로 답한다

const BROWSER_LEVEL: Record<string, BrowserLevelAction> = {
  'Browser.getVersion': 'forward',
  'Target.getBrowserContexts': 'forward',
  'Target.getTargetInfo': 'forwardOwnTarget',
  'Target.getTargets': 'getTargets',
  'Target.attachToTarget': 'attach',
  'Target.detachFromTarget': 'detach',
  'Target.getDevToolsTarget': 'requireOwnTarget',
  'Target.setDiscoverTargets': 'setDiscoverTargets',
  'Target.setAutoAttach': 'setAutoAttach',
  'Target.createTarget': 'createTarget',
  'Target.closeTarget': 'closeTarget',
  'Target.activateTarget': 'activateTarget',
  'Browser.setDownloadBehavior': 'ignore',
};

export interface TargetFilterEntry { type?: string; exclude?: boolean }

/** filter를 주지 않았을 때 CDP의 기본값 */
const DEFAULT_FILTER: TargetFilterEntry[] = [{ type: 'browser', exclude: true }, { type: 'tab', exclude: true }, {}];

/** CDP TargetFilter: 처음 맞는 항목이 포함·제외를 정하고, 맞는 항목이 없으면 제외 */
export function matchesTargetFilter(type: string, filter: TargetFilterEntry[] | undefined): boolean {
  for (const entry of filter ?? DEFAULT_FILTER) {
    if (entry.type === undefined || entry.type === type) return !entry.exclude;
  }
  return false;
}

/** 브라우저 수준 명령의 처리 방식. 표에 없으면 undefined(= 막는다) */
export function browserLevelAction(method: string): BrowserLevelAction | undefined {
  return Object.hasOwn(BROWSER_LEVEL, method) ? BROWSER_LEVEL[method] : undefined;
}

/** 페이지 세션에서도 허용하는 Target 명령(자기 페이지 안의 iframe·worker 다루기) */
const SESSION_TARGET_ALLOWED = new Set(['Target.setAutoAttach', 'Target.autoAttachRelated', 'Target.detachFromTarget', 'Target.getTargetInfo']);

/**
 * R7: 공유 파티션(사람 창과 같은 로그인·저장소)을 지우거나 덮어쓰는 명령. 페이지 세션에서 보내도
 * 다른 출처와 사람 창에 닿는다. 쿠키 설정도 지난 만료 시각으로 쿠키를 지울 수 있어 막는다(검증 1회차).
 */
const SHARED_STATE_DESTRUCTIVE = new Set([
  'Network.clearBrowserCookies',
  'Network.clearBrowserCache',
  'Network.deleteCookies',
  'Storage.clearDataForOrigin',
  'Storage.clearDataForStorageKey',
  'Storage.clearCookies',
  'Storage.clearSharedStorageEntries',
  'Storage.deleteSharedStorageEntry',
  'Storage.deleteStorageBucket',
  'Storage.clearTrustTokens',
  'Storage.setCookies',
  'Network.setCookie',
  'Network.setCookies',
  'IndexedDB.deleteDatabase',
  'IndexedDB.clearObjectStore',
  'IndexedDB.deleteObjectStoreEntries',
  'DOMStorage.clear',
  'DOMStorage.removeDOMStorageItem',
  'DOMStorage.setDOMStorageItem',
  'CacheStorage.deleteCache',
  'CacheStorage.deleteEntry',
]);

/** R13: 다운로드 처리 방식을 바꾸면 관문(will-download)을 건너뛰고 사람 창 다운로드 경로까지 바뀐다 */
const DOWNLOAD_BEHAVIOR = new Set(['Page.setDownloadBehavior', 'Browser.setDownloadBehavior']);

/** R12: 가로챈 요청을 이어 보낼 때 method·본문을 바꾸면 GET 이동이 POST(폼 제출)가 되어 관문을 건너뛴다 */
const REQUEST_CONTINUE = new Set(['Fetch.continueRequest', 'Network.continueInterceptedRequest']);

/**
 * 페이지 세션 명령을 막아야 하면 그 이유를, 넘겨도 되면 undefined를 돌려준다.
 */
export function sessionLevelBlockReason(method: string, params: Record<string, unknown> = {}): string | undefined {
  if (SHARED_STATE_DESTRUCTIVE.has(method)) return '사람 창과 공유하는 로그인·저장소를 지우거나 바꾸는 명령은 쓸 수 없다';
  if (DOWNLOAD_BEHAVIOR.has(method)) return '다운로드 처리 방식은 바꿀 수 없다(다운로드 관문)';
  if (REQUEST_CONTINUE.has(method) && (params.method !== undefined || params.postData !== undefined)) return '요청의 method·본문을 바꿀 수 없다(폼 제출 관문)';
  if (method.startsWith('Browser.') && method !== 'Browser.getVersion') return '페이지 세션에서 Browser 명령은 쓸 수 없다';
  if (method.startsWith('Target.')) {
    if (!SESSION_TARGET_ALLOWED.has(method)) return '페이지 세션에서 이 Target 명령은 쓸 수 없다';
    if (method === 'Target.getTargetInfo' && params.targetId !== undefined) return '페이지 세션에서 다른 대상의 정보는 볼 수 없다';
  }
  return undefined;
}
