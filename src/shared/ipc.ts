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
  /** 사람 창을 앞으로 가져온다(묶은 앱을 다시 열 때, ADR-0008) */
  | { type: 'focus' }
  /** 승인 요청 알림 상태(시험·진단용, 카드 20261122-approval-attention) */
  | { type: 'attention' };

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
  /** 사람이 패널에서 세션 이름을 바꿨다(label 없으면 이름 지움) */
  | { type: 'sessionLabel'; sessionId: string; label?: string };

export type BrowserToLauncher = BrowserReply & { rid?: number };
