/** 런처 → 브라우저 main 명령 (fd 5의 Node ipc 채널, ADR-0002). rid는 응답을 짝짓는 요청 번호 */
export type LauncherCommand =
  | { type: 'quit' }
  | { type: 'listWindows' }
  | { type: 'createSession'; sessionId: string }
  | { type: 'newTab'; sessionId: string }
  | { type: 'navigateTab'; sessionId: string; targetId: string; url: string }
  | { type: 'closeTab'; sessionId: string; targetId: string }
  | { type: 'activateTab'; sessionId: string; targetId: string }
  | { type: 'closeSession'; sessionId: string }
  /** 사람 창을 앞으로 가져온다(묶은 앱을 다시 열 때, ADR-0008) */
  | { type: 'focus' };

export type LauncherToBrowser = LauncherCommand & { rid?: number };

export type WindowInfo = { kind: 'human' } | { kind: 'agent'; sessionId: string };

/** 브라우저 main → 런처 알림·응답 */
export type BrowserReply =
  | { type: 'ready' }
  | { type: 'windows'; windows: WindowInfo[] }
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
