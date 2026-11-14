import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, type RunningApp } from './app';
import { parseCliArgs } from './cliArgs';
import { claimLock, isOurLauncher, lockHolder, recordLauncher, releaseLock } from '../app/launcherLock';
import { LAUNCHER_LOCK_ENV, LAUNCHER_LOCK_NAME } from '../shared/constants';

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2), process.env);
  mkdirSync(options.profile, { recursive: true, mode: 0o700 });

  // 한 프로필에 런처는 하나다(ADR-0008). 묶은 앱은 시작 프로세스가 이미 잡아 경로를 넘긴다.
  // 직접 실행(npm start)이면 여기서 잡는다. 런처가 끝날 때(어떤 경로든) 지운다.
  let lock = process.env[LAUNCHER_LOCK_ENV];
  if (!lock) {
    lock = join(options.profile, LAUNCHER_LOCK_NAME);
    if (!claimLock(lock, isOurLauncher)) throw new Error(`이 프로필은 이미 다른 런처(pid ${lockHolder(lock) ?? '?'})가 쓰고 있다: ${options.profile}`);
  }
  const heldLock = lock;
  process.on('exit', () => releaseLock(heldLock, process.pid));

  // 묶은 앱을 다시 열면 시작 프로세스가 보내는 신호. 사람 창을 앞으로 가져온다(준비 전이면 무시: 창이 곧 뜬다).
  // 처리기를 단 뒤에야 pid를 적는다. 시작 프로세스는 pid가 적힌 런처에만 신호를 보내므로, 기본 동작(종료)으로 꺼지지 않는다
  const started: { app?: RunningApp } = {};
  process.on('SIGUSR2', () => { started.app?.request({ type: 'focus' }, 'done').catch(() => undefined); });
  recordLauncher(heldLock, process.pid);

  const app = await startApp({
    userDataDir: options.profile,
    controlPort: options.controlPort,
    hidden: options.hidden,
    onBlocked: options.logBlocked ? (e) => console.error(`agent-browser: 막음 [세션 ${e.sessionId}] ${e.method} — ${e.reason}`) : undefined,
  });
  started.app = app;
  console.log(`agent-browser 실행 중. 제어 파일(포트·토큰): ${app.controlFile}`);

  let stopping = false;
  const running = app;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  running.exited.then(stop); // 사람이 사람 창을 닫아 브라우저가 끝나면 런처도 끝낸다
}

main().catch((e: unknown) => {
  console.error(`agent-browser: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
