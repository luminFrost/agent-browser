import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import electron from 'electron';
import { CdpPipe } from './cdpPipe';
import { newToken } from './control/auth';
import { removeControlFile, writeControlFile } from './control/controlFile';
import { startControlServer } from './control/server';
import { SessionRegistry } from './sessions';
import type { BrowserReply, BrowserToLauncher, LauncherCommand } from '../shared/ipc';

export interface StartOptions {
  /** 브라우저 프로필(로그인 상태가 저장되는 곳). 하드코딩하지 않고 호출자가 정한다. */
  userDataDir: string;
  /** 제어 정보(포트·토큰) 파일. 기본값은 `<userDataDir>/control.json` */
  controlFile?: string;
  /** 제어 서버 포트. 기본값 0은 빈 포트를 고른다(제어 파일에 적힌다). */
  controlPort?: number;
  /** 브라우저 main 스크립트. 기본값은 빌드 산출물. */
  browserMain?: string;
  /** 창을 화면에 띄우지 않는다(테스트용). */
  hidden?: boolean;
  /** 브라우저 응답을 기다리는 최대 시간(ms). */
  replyTimeoutMs?: number;
}

type Reply<T extends BrowserReply['type']> = Extract<BrowserReply, { type: T }>;

export interface RunningApp {
  /** 브라우저 전체에 대한 원본 CDP. 런처 내부와 테스트만 쓴다. 외부에는 열지 않는다(ADR-0002). */
  rawCdp: CdpPipe;
  browserPid: number;
  controlFile: string;
  /** 브라우저 main에 명령을 보내고, 같은 요청 번호의 응답을 기다린다. */
  request<T extends BrowserReply['type']>(command: LauncherCommand, expect: T): Promise<Reply<T>>;
  stop(): Promise<void>;
}

const DEFAULT_BROWSER_MAIN = resolve(__dirname, '..', '..', 'dist', 'browser', 'main.js');
const DEFAULT_REPLY_TIMEOUT_MS = 30_000;
const CONTROL_FILE_NAME = 'control.json';

/** Electron 패키지는 Node에서 불리면 실행 파일 경로(문자열)를 내보낸다. */
const electronBinary = electron as unknown as string;

export async function startApp(options: StartOptions): Promise<RunningApp> {
  const timeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
  const child: ChildProcess = spawn(
    electronBinary,
    [options.browserMain ?? DEFAULT_BROWSER_MAIN, '--remote-debugging-pipe', `--ab-user-data=${options.userDataDir}`, ...(options.hidden ? ['--ab-hidden'] : [])],
    // fd 3·4: CDP 파이프, fd 5: 런처 ↔ 브라우저 명령 채널(ipc). TCP는 쓰지 않는다.
    { stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe', 'ipc'] },
  );
  const rawCdp = new CdpPipe(child.stdio[3] as Writable, child.stdio[4] as Readable);
  const exited = once(child, 'exit');

  const waitFor = <T extends BrowserReply['type']>(match: (m: BrowserToLauncher) => boolean, what: string) =>
    new Promise<Reply<T>>((ok, fail) => {
      const timer = setTimeout(() => { child.off('message', onMessage); fail(new Error(`브라우저가 ${what}에 ${timeoutMs}ms 안에 답하지 않았다`)); }, timeoutMs);
      const onMessage = (m: BrowserToLauncher) => {
        if (!match(m)) return;
        clearTimeout(timer);
        child.off('message', onMessage);
        if (m.type === 'error') fail(new Error(`브라우저 오류(${what}): ${m.message}`));
        else ok(m as Reply<T>);
      };
      child.on('message', onMessage);
    });

  let nextRid = 1;
  const request = <T extends BrowserReply['type']>(command: LauncherCommand, expect: T): Promise<Reply<T>> => {
    const rid = nextRid++;
    const reply = waitFor<T>((m) => m.rid === rid && (m.type === expect || m.type === 'error'), command.type);
    child.send({ ...command, rid });
    return reply;
  };

  await waitFor<'ready'>((m) => m.type === 'ready', 'ready');

  const sessions = new SessionRegistry();
  const token = newToken();
  const control = await startControlServer(token, options.controlPort ?? 0, {
    async createSession() {
      const id = sessions.newId();
      await request({ type: 'createSession', sessionId: id }, 'sessionCreated');
      sessions.add({ id });
      return { id };
    },
  });
  const controlFile = options.controlFile ?? join(options.userDataDir, CONTROL_FILE_NAME);
  writeControlFile(controlFile, { port: control.port, token });

  return {
    rawCdp,
    browserPid: child.pid as number,
    controlFile,
    request,
    async stop() {
      await control.close();
      removeControlFile(controlFile);
      if (child.exitCode !== null) return;
      child.send({ type: 'quit' });
      await exited;
    },
  };
}
