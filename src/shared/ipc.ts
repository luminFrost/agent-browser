/** 런처 → 브라우저 main 명령 (fd 5의 Node ipc 채널, ADR-0002). rid는 응답을 짝짓는 요청 번호 */
export type LauncherCommand =
  | { type: 'quit' }
  | { type: 'listWindows' }
  /** 살아 있는 에이전트 세션 id(세션은 창이 아니라 사람 창 안의 탭 묶음이다, spec-embedded-sessions) */
  | { type: 'listSessions' }
  /** 사람 창 왼쪽 영역에 지금 보이는 탭(테스트·진단용) */
  | { type: 'shownTab' }
  | { type: 'createSession'; sessionId: string }
  | { type: 'newTab'; sessionId: string }
  | { type: 'navigateTab'; sessionId: string; targetId: string; url: string }
  | { type: 'closeTab'; sessionId: string; targetId: string }
  | { type: 'activateTab'; sessionId: string; targetId: string }
  | { type: 'closeSession'; sessionId: string }
  /** 사람 창을 앞으로 가져온다(묶은 앱을 다시 열 때, ADR-0008) */
  | { type: 'focus' };

export type LauncherToBrowser = LauncherCommand & { rid?: number };

/** OS 창. 에이전트 세션은 사람 창 안에 있으므로 창은 사람 창 하나뿐이다(spec-embedded-sessions E1) */
export type WindowInfo = { kind: 'human' };

/** 브라우저 main → 런처 알림·응답 */
export type BrowserReply =
  | { type: 'ready' }
  | { type: 'windows'; windows: WindowInfo[] }
  | { type: 'sessions'; sessionIds: string[] }
  /** view: 사람 탭을 보는 중이면 human, 세션을 보는 중이면 session(그 세션에 탭이 없으면 targetId 없음) */
  | { type: 'shownTab'; view: 'human' | 'session'; sessionId?: string; targetId?: string }
  | { type: 'sessionCreated'; sessionId: string; targetId: string }
  | { type: 'tabCreated'; targetId: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  // 아래는 요청 없이 오는 알림(rid 없음). 에이전트 탭의 소유권은 이것으로만 정한다(design.md)
  | { type: 'tabAdded'; sessionId: string; targetId: string }
  | { type: 'tabRemoved'; sessionId: string; targetId: string }
  | { type: 'sessionClosed'; sessionId: string }
  /** 사람이 지켜보기 패널에서 멈추기를 눌렀다(R11) */
  | { type: 'stopRequested'; sessionId: string };

export type BrowserToLauncher = BrowserReply & { rid?: number };
