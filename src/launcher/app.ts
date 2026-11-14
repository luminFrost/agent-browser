import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import electron from 'electron';
import { CdpPipe } from './cdpPipe';
import type { BrowserToLauncher, LauncherToBrowser } from '../shared/ipc';

export interface StartOptions {
  /** 브라우저 프로필(로그인 상태가 저장되는 곳). 하드코딩하지 않고 호출자가 정한다. */
  userDataDir: string;
  /** 브라우저 main 스크립트. 기본값은 빌드 산출물. */
  browserMain?: string;
  /** 창을 화면에 띄우지 않는다(테스트용). */
  hidden?: boolean;
  /** 준비를 기다리는 최대 시간(ms). */
  readyTimeoutMs?: number;
}

export interface RunningApp {
  /** 브라우저 전체에 대한 원본 CDP. 런처 내부와 테스트만 쓴다. 외부에는 열지 않는다(ADR-0002). */
  rawCdp: CdpPipe;
  browserPid: number;
  /** 브라우저 main에 명령을 보내고 응답을 기다린다. */
  request<T extends BrowserToLauncher['type']>(message: LauncherToBrowser, expect: T): Promise<Extract<BrowserToLauncher, { type: T }>>;
  stop(): Promise<void>;
}

const DEFAULT_BROWSER_MAIN = resolve(__dirname, '..', '..', 'dist', 'browser', 'main.js');
const DEFAULT_READY_TIMEOUT_MS = 30_000;

/** Electron 패키지는 Node에서 불리면 실행 파일 경로(문자열)를 내보낸다. */
const electronBinary = electron as unknown as string;

export async function startApp(options: StartOptions): Promise<RunningApp> {
  const child: ChildProcess = spawn(
    electronBinary,
    [options.browserMain ?? DEFAULT_BROWSER_MAIN, '--remote-debugging-pipe', `--ab-user-data=${options.userDataDir}`, ...(options.hidden ? ['--ab-hidden'] : [])],
    // fd 3·4: CDP 파이프, fd 5: 런처 ↔ 브라우저 명령 채널(ipc). TCP는 쓰지 않는다.
    { stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe', 'ipc'] },
  );
  const rawCdp = new CdpPipe(child.stdio[3] as Writable, child.stdio[4] as Readable);

  const waitFor = <T extends BrowserToLauncher['type']>(type: T, timeoutMs: number) =>
    new Promise<Extract<BrowserToLauncher, { type: T }>>((ok, fail) => {
      const timer = setTimeout(() => { child.off('message', onMessage); fail(new Error(`브라우저가 ${type}에 ${timeoutMs}ms 안에 답하지 않았다`)); }, timeoutMs);
      const onMessage = (m: BrowserToLauncher) => {
        if (m.type !== type) return;
        clearTimeout(timer);
        child.off('message', onMessage);
        ok(m as Extract<BrowserToLauncher, { type: T }>);
      };
      child.on('message', onMessage);
    });

  const timeout = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  await waitFor('ready', timeout);
  const exited = once(child, 'exit');

  return {
    rawCdp,
    browserPid: child.pid as number,
    async request(message, expect) {
      const reply = waitFor(expect, timeout);
      child.send(message);
      return reply;
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.send({ type: 'quit' } satisfies LauncherToBrowser);
      await exited;
    },
  };
}
