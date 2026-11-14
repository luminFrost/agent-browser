/** 런처 → 브라우저 main 명령 (fd 5의 Node ipc 채널, ADR-0002) */
export type LauncherToBrowser = { type: 'quit' };

/** 브라우저 main → 런처 알림·응답 */
export type BrowserToLauncher = { type: 'ready' };
