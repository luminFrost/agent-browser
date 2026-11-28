/** 런처 → 브라우저 main 명령 (fd 5의 Node ipc 채널, ADR-0002). rid는 응답을 짝짓는 요청 번호 */
export type LauncherCommand =
  | { type: 'quit' }
  | { type: 'listWindows' }
  /** 살아 있는 에이전트 세션 id(세션은 창이 아니라 사람 창 안의 탭 묶음이다, spec-embedded-sessions) */
  | { type: 'listSessions' }
  /** 사람 창 왼쪽 영역에 지금 보이는 탭(테스트·진단용) */
  | { type: 'shownTab' }
  /** label: 세션 이름(카드 20261120-session-labels). 없으면 이름 없음 */
  | { type: 'createSession'; sessionId: string; label?: string }
  | { type: 'newTab'; sessionId: string }
  | { type: 'navigateTab'; sessionId: string; targetId: string; url: string }
  | { type: 'closeTab'; sessionId: string; targetId: string }
  | { type: 'activateTab'; sessionId: string; targetId: string }
  | { type: 'closeSession'; sessionId: string }
  /** 에이전트의 CDP Input.* 명령을 보내기 전(on)과 응답을 받은 뒤(off). 그 사이에만 세션 탭의 마우스를 통과시킨다(카드 20261122-agent-input-lock) */
  | { type: 'agentInput'; sessionId: string; inputId: number; on: boolean }
  /** 사람 창을 앞으로 가져온다(묶은 앱을 다시 열 때, ADR-0008) */
  | { type: 'focus' }
  /** 승인 요청 알림 상태(시험·진단용, 카드 20261122-approval-attention) */
  | { type: 'attention' }
  /** 앱 메뉴 항목의 역할(시험·진단용, 카드 20261123-qa-followups Q5) */
  | { type: 'menu' }
  /** 화면 모드 상태(시험·진단용, 카드 20261123-theme-mode) */
  | { type: 'theme' }
  /** 시험용: 앱 메뉴 항목을 사람이 누른 것처럼 누른다(id가 있는 항목만, 카드 20261123-theme-mode) */
  | { type: 'clickMenu'; id: string }
  /** 시험용: 마지막으로 띄운 팝업 메뉴(북마크 막대·테마 버튼)에서 이름 경로로 항목을 누른다(카드 20261127-bookmark-folders) */
  | { type: 'clickPopup'; path: string[] }
  /** 앱 안 업데이트 상태(시험·진단용, 카드 20261123-update-notice) */
  | { type: 'update' }
  /** 시험용: 세션의 활성 탭에 사람 입력(OS 입력 경로: 마우스 누르기·떼기, 글자 하나)을 보낸다(카드 20261122-agent-input-lock) */
  | { type: 'simulateHumanInput'; sessionId: string; x: number; y: number; text: string }
  /** 개발자도구가 열린 탭과 창 UI에 열렸는지(시험·진단용, 카드 20261127-page-devtools) */
  | { type: 'pageTools' }
  /** 시험용: 지금 보이는 탭의 (x, y)를 사람이 오른쪽 클릭한 것처럼 보내고(OS 입력 경로) 뜬 메뉴를 돌려준다 */
  | { type: 'contextMenu'; x: number; y: number }
  /** 시험용: 클립보드 글자 */
  | { type: 'clipboard' };

export type LauncherToBrowser = LauncherCommand & { rid?: number };

/** OS 창. 사람 창 말고는 없어야 한다(spec-embedded-sessions E1). other는 그 밖의 창이 생겼을 때 드러내려는 것 */
export type WindowInfo = { kind: 'human' | 'other' };
/** 창 내용 좌표의 사각형 */
export interface Rect { x: number; y: number; width: number; height: number }

/** 브라우저 main → 런처 알림·응답 */
export type BrowserReply =
  | { type: 'ready' }
  | { type: 'windows'; windows: WindowInfo[] }
  | { type: 'sessions'; sessionIds: string[] }
  /** view: 사람 탭을 보는 중이면 human, 세션을 보는 중이면 session(그 세션에 탭이 없으면 targetId 없음) */
  | { type: 'shownTab'; view: 'human' | 'session'; sessionId?: string; targetId?: string; exposed: Rect[]; content: { width: number; height: number }; focusedSession: string | null; focusedUi: boolean; windowFocused: boolean; offscreenFocusCount: number }
  /** badge: Dock 배지에 보인 기다리는 승인 수, notices: 띄운 승인 알림 수 */
  | { type: 'attention'; badge: number; notices: number; bounces: number; noticeFailures: number }
  /** roles: 앱 메뉴 항목 역할(소문자) */
  | { type: 'menu'; roles: string[] }
  /** source: nativeTheme.themeSource, dark: 지금 어두운 색을 쓰는지, menuChecked: 메뉴 "보기 > 모양"에서 체크된 모드 */
  | { type: 'theme'; source: 'system' | 'light' | 'dark'; dark: boolean; menuChecked: string | null }
  /** state: none | latest | checkFailed | available | downloading | installing | failed (src/browser/update.ts UpdateState) */
  | { type: 'update'; state: string; version?: string; reason?: string }
  /** open: 개발자도구가 열린 탭(shown: 지금 보이는 탭인지), ui: 사람 창 UI에 열렸는지(늘 false여야 한다), frontends: 브라우저 안 개발자도구 화면(devtools://) 수 */
  | { type: 'pageTools'; open: { view: 'human' | 'session'; sessionId?: string; shown: boolean }[]; ui: boolean; frontends: number }
  /** 뜬 팝업 메뉴 항목(구분선은 label '-') */
  | { type: 'popup'; items: { label: string; enabled: boolean }[] }
  | { type: 'clipboard'; text: string }
  | { type: 'sessionCreated'; sessionId: string; targetId: string }
  | { type: 'tabCreated'; targetId: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  // 아래는 요청 없이 오는 알림(rid 없음). 에이전트 탭의 소유권은 이것으로만 정한다(design.md)
  | { type: 'tabAdded'; sessionId: string; targetId: string }
  | { type: 'tabRemoved'; sessionId: string; targetId: string }
  | { type: 'sessionClosed'; sessionId: string }
  /** 사람이 지켜보기 패널에서 멈추기를 눌렀다(R11) */
  | { type: 'stopRequested'; sessionId: string }
  /** 사람이 패널에서 세션 이름을 바꿨다. 브라우저는 빈 이름이면 보내지 않는다(이름 지우기는 없다). label이 없으면 런처는 이름을 지운다 */
  | { type: 'sessionLabel'; sessionId: string; label?: string };

export type BrowserToLauncher = BrowserReply & { rid?: number };
