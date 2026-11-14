/** 런처 → 브라우저 main 명령 (fd 5의 Node ipc 채널, ADR-0002). rid는 응답을 짝짓는 요청 번호 */
export type LauncherCommand =
  | { type: 'quit' }
  | { type: 'listWindows' }
  | { type: 'createSession'; sessionId: string };

export type LauncherToBrowser = LauncherCommand & { rid?: number };

export type WindowInfo = { kind: 'human' } | { kind: 'agent'; sessionId: string };

/** 브라우저 main → 런처 알림·응답 */
export type BrowserReply =
  | { type: 'ready' }
  | { type: 'windows'; windows: WindowInfo[] }
  | { type: 'sessionCreated'; sessionId: string }
  | { type: 'error'; message: string };

export type BrowserToLauncher = BrowserReply & { rid?: number };
