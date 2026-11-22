import { isAgentNavigable } from '../../shared/url';
/**
 * CDP 명령을 어떻게 다룰지 정하는 표(docs/design.md 인터페이스 절).
 * 브라우저 수준(sessionId 없음)과 페이지 세션 모두 허용 목록이다(ADR-0004·0005). 목록에 없으면 막는다.
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
  | 'createTarget' // 앱이 세션에 탭을 만든다(사람 창 안의 세션 탭 묶음)
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
 * ADR-0005: 페이지 세션 명령의 허용 목록(메서드 단위). 도메인을 통째로 열지 않는다.
 * 1) 확장 호환 테스트(tests/e2e/compatExtended.spec.ts)에서 chrome-devtools-mcp·Playwright가 실제로 보낸 명령
 * 2) 흔한 에이전트 기능에 필요한 같은 탭 범위의 명령(이번 실행엔 안 나왔지만 같은 도구가 쓰는 것)
 * 목록에 없으면 막는다. Tracing·Memory·ServiceWorker·Security·저장소 쓰기는 없다(프로세스 전체·공유 상태에 닿음).
 * 도구가 새 명령을 쓰다 막히면 `--log-blocked`로 보고, 이유와 함께 여기에 더한다.
 */
const SESSION_ALLOWED = new Set([
  // 1) 실제로 쓴 명령
  'Accessibility.getFullAXTree', 'Accessibility.queryAXTree', 'Audits.enable', 'CSS.enable',
  'Debugger.enable', 'Debugger.setAsyncCallStackDepth', 'Debugger.setBlackboxExecutionContexts', 'Debugger.setBlackboxPatterns',
  'Debugger.setPauseOnExceptions', 'Debugger.setSkipAllPauses',
  'DOM.describeNode', 'DOM.enable', 'DOM.getContentQuads', 'DOM.resolveNode', 'DOM.scrollIntoViewIfNeeded',
  'Emulation.clearGeolocationOverride', 'Emulation.setCPUThrottlingRate', 'Emulation.setDeviceMetricsOverride',
  'Emulation.setEmulatedMedia', 'Emulation.setFocusEmulationEnabled',
  'Fetch.continueRequest', 'Fetch.enable', 'Fetch.fulfillRequest',
  'Input.dispatchKeyEvent', 'Input.dispatchMouseEvent', 'Input.insertText',
  'Inspector.enable', 'Log.enable', 'Log.startViolationsReport',
  'Network.emulateNetworkConditionsByRule', 'Network.enable', 'Network.overrideNetworkState', 'Network.setAttachDebugStack',
  'Network.setCacheDisabled', 'Network.setExtraHTTPHeaders', 'Network.setUserAgentOverride',
  'Page.addScriptToEvaluateOnNewDocument', 'Page.captureScreenshot', 'Page.createIsolatedWorld', 'Page.enable', 'Page.getFrameTree',
  'Page.getLayoutMetrics', 'Page.getResourceTree', 'Page.handleJavaScriptDialog', 'Page.navigate', 'Page.setLifecycleEventsEnabled',
  'Performance.enable', 'Profiler.enable',
  'Runtime.addBinding', 'Runtime.callFunctionOn', 'Runtime.enable', 'Runtime.evaluate', 'Runtime.getIsolateId', 'Runtime.getProperties',
  'Runtime.releaseObject', 'Runtime.runIfWaitingForDebugger',
  'Storage.getStorageKey',
  // 2) 같은 탭 범위의 흔한 기능: 파일 올리기, 이동, 응답 읽기, 가로채기 마무리, 드래그·터치, 닫기
  'DOM.setFileInputFiles', 'DOM.getDocument', 'DOM.querySelector', 'DOM.querySelectorAll', 'DOM.getBoxModel', 'DOM.focus', 'DOM.getOuterHTML',
  'Page.reload', 'Page.stopLoading', 'Page.getNavigationHistory', 'Page.navigateToHistoryEntry', 'Page.close', 'Page.bringToFront',
  'Page.setInterceptFileChooserDialog', 'Page.printToPDF', 'Page.addScriptToEvaluateOnLoad', 'Page.removeScriptToEvaluateOnNewDocument',
  'Network.getResponseBody', 'Network.getRequestPostData', 'Network.disable',
  'Fetch.disable', 'Fetch.failRequest', 'Fetch.continueWithAuth', 'Fetch.getResponseBody',
  'Input.dispatchDragEvent', 'Input.dispatchTouchEvent',
  'Emulation.setTouchEmulationEnabled', 'Emulation.setUserAgentOverride', 'Emulation.clearDeviceMetricsOverride',
  'DOM.pushNodesByBackendIdsToFrontend', 'DOM.requestNode', 'CSS.getComputedStyleForNode', 'CSS.getMatchedStylesForNode',
  'CSS.getInlineStylesForNode', 'CSS.getEnvironmentVariables', 'CSS.disable',
  'IO.read', 'IO.close', // Page.printToPDF의 스트림 읽기(ADR-0006)
  'Runtime.awaitPromise', 'Runtime.releaseObjectGroup', 'Runtime.removeBinding', 'Log.disable', 'Page.disable', 'Runtime.disable', 'DOM.disable',
]);

/** R13: 다운로드 처리 방식을 바꾸면 관문(will-download)을 건너뛰고 사람 창 다운로드 경로까지 바뀐다 */
const DOWNLOAD_BEHAVIOR = new Set(['Page.setDownloadBehavior', 'Browser.setDownloadBehavior']);

/** R12: 가로챈 요청을 이어 보낼 때 method·본문·주소를 바꾸면 관문을 건너뛰거나 승인한 곳과 다른 곳으로 간다 */
const REQUEST_CONTINUE = 'Fetch.continueRequest';

/** R7: 가짜 응답의 Set-Cookie로 그 출처(사람과 공유)의 쿠키를 바꿀 수 있다 */
const RESPONSE_REWRITE = 'Fetch.fulfillRequest';

const hasSetCookie = (params: Record<string, unknown>): boolean => {
  const headers = Array.isArray(params.responseHeaders) ? (params.responseHeaders as { name?: unknown }[]) : [];
  // 헤더 이름 앞뒤 공백은 무시하고 판정한다(ADR-0006)
  if (headers.some((h) => typeof h.name === 'string' && h.name.trim().toLowerCase() === 'set-cookie')) return true;
  if (typeof params.binaryResponseHeaders === 'string') {
    const text = Buffer.from(params.binaryResponseHeaders, 'base64').toString('latin1');
    return text.split(/[\0\r\n]/).some((line) => line.split(':')[0].trim().toLowerCase() === 'set-cookie');
  }
  return false;
};


/**
 * 페이지 세션 명령을 막아야 하면 그 이유를, 넘겨도 되면 undefined를 돌려준다.
 */
export function sessionLevelBlockReason(method: string, params: Record<string, unknown> = {}): string | undefined {
  if (DOWNLOAD_BEHAVIOR.has(method)) return '다운로드 처리 방식은 바꿀 수 없다(다운로드 관문)';
  if (method.startsWith('Browser.') && method !== 'Browser.getVersion') return '페이지 세션에서 Browser 명령은 쓸 수 없다';
  if (method.startsWith('Target.')) {
    if (!SESSION_TARGET_ALLOWED.has(method)) return '페이지 세션에서 이 Target 명령은 쓸 수 없다';
    if (method === 'Target.getTargetInfo' && params.targetId !== undefined) return '페이지 세션에서 다른 대상의 정보는 볼 수 없다';
    return undefined;
  }
  if (method === 'Browser.getVersion') return undefined;
  if (!SESSION_ALLOWED.has(method)) return '사람 창과 공유하는 로그인·저장소나 브라우저 전체에 닿을 수 있는 명령은 쓸 수 없다(허용 목록 밖)';
  if (method === 'Page.navigate' && !isAgentNavigable(String(params.url ?? ''))) return '이 주소로는 이동할 수 없다(웹 주소만, ADR-0006)';
  if (method === REQUEST_CONTINUE && (params.method !== undefined || params.postData !== undefined || params.url !== undefined)) return '요청의 method·본문·주소를 바꿀 수 없다(폼 제출 관문)';
  if (method === RESPONSE_REWRITE && hasSetCookie(params)) return '응답에 Set-Cookie를 넣을 수 없다(공유 로그인 보호)';
  return undefined;
}
