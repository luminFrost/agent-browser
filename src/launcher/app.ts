import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { CdpPipe } from './cdpPipe';
import { DOWNLOADS_FLAG, HIDDEN_FLAG, USER_DATA_FLAG } from '../shared/constants';
import { newToken } from './control/auth';
import { removeControlFile, writeControlFile } from './control/controlFile';
import { startControlServer } from './control/server';
import { SessionRegistry } from './sessions';
import { Router } from './cdp/router';
import { startSessionEndpoint, type BrowserVersion, type SessionEndpoint } from './cdp/endpoint';
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
  /** 다운로드 폴더. 기본값은 OS의 다운로드 폴더 */
  downloadsDir?: string;
  /** 에이전트 명령이 막힐 때마다 불린다(ADR-0005: 도구가 새 명령을 쓰다 막혔는지 찾기) */
  onBlocked?(event: { sessionId: string; method: string; reason: string }): void;
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
  /** 세션을 끝낸다: 엔드포인트를 닫아 연결을 끊고, 세션 창을 닫는다(R9). 없는 세션이면 아무 일도 없다 */
  stopSession(id: string): Promise<void>;
  /** 브라우저 프로세스가 끝나면 풀린다 */
  exited: Promise<void>;
  /** 브라우저 main에 명령을 보내고, 같은 요청 번호의 응답을 기다린다. */
  request<T extends BrowserReply['type']>(command: LauncherCommand, expect: T): Promise<Reply<T>>;
  stop(): Promise<void>;
}

const DEFAULT_BROWSER_MAIN = resolve(__dirname, '..', '..', 'dist', 'browser', 'main.js');
const DEFAULT_REPLY_TIMEOUT_MS = 30_000;
const CONTROL_FILE_NAME = 'control.json';

/**
 * 브라우저로 띄울 Electron 실행 파일.
 * 묶은 앱의 런처는 앱 실행 파일 자신을 Node 모드로 돌리므로 그 파일을 다시 쓴다(spec-mac-app.md).
 * 개발·테스트에서는 electron 패키지가 Node에 실행 파일 경로(문자열)를 내보낸다.
 */
const electronBinary = (): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  process.versions.electron ? process.execPath : (require('electron') as string);

/** 런처의 Node 모드 표시를 브라우저에 물려주지 않는다. 물려주면 브라우저도 Node로 돈다 */
const browserEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};

export async function startApp(options: StartOptions): Promise<RunningApp> {
  const timeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
  const child: ChildProcess = spawn(
    electronBinary(),
    [options.browserMain ?? DEFAULT_BROWSER_MAIN, '--remote-debugging-pipe', `${USER_DATA_FLAG}${options.userDataDir}`, ...(options.hidden ? [HIDDEN_FLAG] : []), ...(options.downloadsDir ? [`${DOWNLOADS_FLAG}${options.downloadsDir}`] : [])],
    // fd 3·4: CDP 파이프, fd 5: 런처 ↔ 브라우저 명령 채널(ipc). TCP는 쓰지 않는다.
    { stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe', 'ipc'], env: browserEnv() },
  );
  const rawCdp = new CdpPipe(child.stdio[3] as Writable, child.stdio[4] as Readable);
  // ipc 채널이 닫힌 뒤 보내기 오류가 런처를 죽이지 않게 한다(사람 창을 닫아 브라우저가 끝나는 중 등)
  child.on('error', () => undefined);
  const exited = once(child, 'exit');

  // 브라우저가 끝나면 기다리던 응답을 모두 실패로 끝내고 타이머를 지운다. 남은 타이머가 프로세스를 붙잡지 않게 한다(spec-cleanup-five C4)
  const pending = new Set<(e: Error) => void>();
  void exited.then(() => { for (const cancel of [...pending]) cancel(new Error('브라우저가 끝났다')); });
  const waitFor = <T extends BrowserReply['type']>(match: (m: BrowserToLauncher) => boolean, what: string) =>
    new Promise<Reply<T>>((ok, fail) => {
      const finish = () => { clearTimeout(timer); child.off('message', onMessage); pending.delete(cancel); };
      const cancel = (e: Error) => { finish(); fail(e); };
      const timer = setTimeout(() => cancel(new Error(`브라우저가 ${what}에 ${timeoutMs}ms 안에 답하지 않았다`)), timeoutMs);
      const onMessage = (m: BrowserToLauncher) => {
        if (!match(m)) return;
        finish();
        if (m.type === 'error') fail(new Error(`브라우저 오류(${what}): ${m.message}`));
        else ok(m as Reply<T>);
      };
      pending.add(cancel);
      child.on('message', onMessage);
    });

  let nextRid = 1;
  const request = <T extends BrowserReply['type']>(command: LauncherCommand, expect: T): Promise<Reply<T>> => {
    if (!child.connected) return Promise.reject(new Error(`브라우저가 끝나 ${command.type}를 보낼 수 없다`));
    const rid = nextRid++;
    const reply = waitFor<T>((m) => m.rid === rid && (m.type === expect || m.type === 'error'), command.type);
    child.send({ ...command, rid }, (e) => { if (e) child.emit('message', { type: 'error', message: e.message, rid }); });
    return reply;
  };

  // 브라우저가 준비 전에 끝나면(같은 프로필을 이미 다른 브라우저가 씀 등) 기다리지 않고 실패한다
  await waitFor<'ready'>((m) => m.type === 'ready', 'ready').catch((e: unknown) => {
    throw child.exitCode !== null || child.signalCode !== null ? new Error('브라우저가 준비되기 전에 끝났다') : e;
  });

  const router = new Router(rawCdp);
  await router.start();
  const version = (await rawCdp.send('Browser.getVersion')) as unknown as BrowserVersion;
  // 소유권 알림(요청 없이 오는 tabAdded/tabRemoved). 범위 반영이 끝나는 약속을 targetId별로 들고 있는다
  const additions = new Map<string, Promise<void>>();
  const added = (sessionId: string, targetId: string) => additions.get(`${sessionId}/${targetId}`) ?? router.addTarget(sessionId, targetId);
  child.on('message', (m: BrowserToLauncher) => {
    if (m.type === 'tabAdded') additions.set(`${m.sessionId}/${m.targetId}`, router.addTarget(m.sessionId, m.targetId).catch(() => undefined));
    // 창이 닫혔거나 사람이 멈추기를 눌렀다: 아직 만드는 중이면 끝나는 즉시 거둔다
    if (m.type === 'sessionClosed' || m.type === 'stopRequested') closedWindows.add(m.sessionId);
    if (m.type === 'sessionClosed' || m.type === 'stopRequested') stopSession(m.sessionId).catch(() => undefined);
    if (m.type === 'tabRemoved') {
      additions.delete(`${m.sessionId}/${m.targetId}`);
      router.removeTarget(m.sessionId, m.targetId);
    }
  });

  const sessions = new SessionRegistry();
  /** 창이 닫혔거나 멈추기를 요청한 세션(생성 중에 그런 경우를 알아채려고) */
  const closedWindows = new Set<string>();
  /** 여러 번 불려도 한 번만 끝낸다(멈추기 버튼 → 창 닫힘 → sessionClosed가 다시 부른다) */
  async function stopSession(id: string): Promise<void> {
    const session = sessions.remove(id);
    if (!session) return;
    closedWindows.delete(id);
    await session.endpoint.close(); // 먼저 끊는다: 창이 닫히는 동안 에이전트가 더 움직이지 못하게
    router.removeScope(id);
    if (child.exitCode === null) await request({ type: 'closeSession', sessionId: id }, 'done').catch(() => undefined);
  }
  const token = newToken();
  const control = await startControlServer(token, options.controlPort ?? 0, {
    async createSession() {
      const id = sessions.newId();
      // 첫 탭의 tabAdded를 받을 수 있게 창보다 먼저 만든다
      const scope = router.addScope(id, {
        async newTab(url) {
          const { targetId } = await request({ type: 'newTab', sessionId: id }, 'tabCreated');
          await added(id, targetId); // 소유권이 범위에 반영되고 흉내(자동 붙기)가 끝난 뒤에
          // 이동한다(design.md 순서). 이동이 실패해도 탭은 이미 있으므로 targetId를 돌려준다
          if (url !== 'about:blank') await request({ type: 'navigateTab', sessionId: id, targetId, url }, 'done').catch(() => undefined);
          return targetId;
        },
        async closeTab(targetId) { await request({ type: 'closeTab', sessionId: id, targetId }, 'done'); },
        async activateTab(targetId) { await request({ type: 'activateTab', sessionId: id, targetId }, 'done'); },
      }, (method, reason) => options.onBlocked?.({ sessionId: id, method, reason }));
      let endpoint: SessionEndpoint | undefined;
      try {
        const created = await request({ type: 'createSession', sessionId: id }, 'sessionCreated');
        await added(id, created.targetId); // 첫 탭이 범위에 들어간 뒤 응답한다(바로 /json/list에 보이게)
        endpoint = await startSessionEndpoint(scope, router, version);
        if (closedWindows.has(id)) throw new Error('세션이 만들어지는 중에 닫혔거나 멈췄다');
      } catch (e) {
        // 실패하면 만든 것을 모두 거둔다(범위·엔드포인트·창)
        await endpoint?.close();
        router.removeScope(id);
        closedWindows.delete(id);
        await request({ type: 'closeSession', sessionId: id }, 'done').catch(() => undefined);
        throw e;
      }
      sessions.add({ id, endpoint });
      return { id, browserUrl: endpoint.browserUrl };
    },
  });
  const controlFile = options.controlFile ?? join(options.userDataDir, CONTROL_FILE_NAME);
  writeControlFile(controlFile, { port: control.port, token });

  let stopped = false;
  return {
    rawCdp,
    browserPid: child.pid as number,
    controlFile,
    request,
    stopSession,
    exited: exited.then(() => undefined),
    async stop() {
      if (stopped) return;
      stopped = true;
      await control.close();
      await Promise.all(sessions.all().map((s) => s.endpoint.close()));
      removeControlFile(controlFile);
      if (child.exitCode !== null) return;
      child.send({ type: 'quit' });
      await exited;
    },
  };
}
