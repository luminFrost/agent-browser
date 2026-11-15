// 묶은 앱(.app)의 시작점(spec-mac-app.md). 같은 실행 파일이 세 역할을 한다.
// 1) 사람이 더블클릭: 런처를 Node 모드로 띄우고 끝난다. 이미 런처가 있으면 사람 창을 앞으로 가져오게 하고 끝난다.
// 2) 런처(Node 모드, ELECTRON_RUN_AS_NODE): 이 파일을 거치지 않고 dist/launcher/cli.js를 바로 돈다.
// 3) 런처가 띄운 브라우저: 인자에 --ab-user-data가 있다 → 브라우저 main을 돈다.
// 런처가 파이프로 브라우저 CDP를 쥐는 구조(ADR-0002)는 그대로다. 한 프로필 한 런처는 ADR-0008.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { LAUNCHER_LOCK_ENV, LAUNCHER_LOCK_NAME, LAUNCHER_LOG_NAME, USER_DATA_FLAG } from '../shared/constants';
import { parseCliArgs } from '../launcher/cliArgs';
import { claimLock, isOurLauncher, lockHolder, stoppingLauncher } from './launcherLock';
import { rotateLogIfLarge } from './logRotate';

/** 런처를 띄운다. 출력은 프로필의 로그 파일에 남겨, 시작이 실패해도 원인을 볼 수 있게 한다 */
function startLauncher(profile: string, lock: string): void {
  const logPath = join(profile, LAUNCHER_LOG_NAME);
  rotateLogIfLarge(logPath);
  const log = openSync(logPath, 'a', 0o600);
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', [LAUNCHER_LOCK_ENV]: lock };
  // 원본 CDP를 쥐는 런처에 인스펙터 등 Node 옵션이 흘러들지 않게 한다
  delete env.NODE_OPTIONS;
  const launcher = spawn(process.execPath, [join(__dirname, '..', 'launcher', 'cli.js')], {
    env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  // pid는 런처가 SIGUSR2 처리기를 단 뒤 스스로 적는다. 그 전에 신호를 받으면 기본 동작으로 꺼지기 때문이다
  launcher.unref();
}

/** 끄는 중인 런처가 끝나기를 기다리는 최대 시간. 브라우저를 닫고 정리하는 데 걸리는 시간보다 넉넉히 */
const STOP_WAIT_MS = 15_000;
/** 기다리는 동안 자물쇠를 다시 보는 간격 */
const STOP_POLL_MS = 100;
/** 신호를 보낸 뒤 런처가 그 사이 끄기 시작했는지 한 번 더 보기까지의 시간 */
const SIGNAL_RECHECK_MS = 300;

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * 끄는 중인 런처(oldPid)가 끝나 자물쇠가 풀리면 잡고 새로 띄운다.
 * 그 사이 다른 시작 프로세스가 새 런처를 띄웠으면 그쪽 창이 뜨므로 물러난다.
 */
function waitAndStart(profile: string, lock: string, oldPid: number): void {
  const until = Date.now() + STOP_WAIT_MS;
  while (Date.now() < until) {
    if (claimLock(lock, isOurLauncher)) {
      startLauncher(profile, lock);
      return;
    }
    const holder = lockHolder(lock);
    if (holder !== undefined && holder !== oldPid && stoppingLauncher(lock) !== holder) return;
    sleep(STOP_POLL_MS);
  }
}

function start(): void {
  const { profile } = parseCliArgs([], process.env);
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  const lock = join(profile, LAUNCHER_LOCK_NAME);
  if (claimLock(lock, isOurLauncher)) {
    startLauncher(profile, lock);
    return;
  }
  const pid = lockHolder(lock);
  // 런처가 끄는 중이다: 끝나기를 기다렸다가 새로 띄운다(spec-cleanup-five C1)
  if (pid !== undefined && stoppingLauncher(lock) === pid) {
    waitAndStart(profile, lock, pid);
    return;
  }
  // 이미 런처가 있다(P5): 사람 창을 앞으로 가져오게 한다. pid가 아직 없으면 런처가 막 뜨는 중이다 → 창은 곧 뜬다
  if (pid === undefined) return;
  process.kill(pid, 'SIGUSR2');
  // 신호를 보내는 사이 런처가 끄기 시작했을 수 있다(이미 끝났을 수도 있다) → 한 번 더 보고, 그랬으면 기다렸다가 새로 띄운다
  sleep(SIGNAL_RECHECK_MS);
  if (stoppingLauncher(lock) === pid || lockHolder(lock) !== pid) waitAndStart(profile, lock, pid);
}

if (process.argv.some((a) => a.startsWith(USER_DATA_FLAG))) {
  // 브라우저 main은 불러오는 것만으로 돈다(최상위 코드). 브라우저 역할일 때만 불러야 한다
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../browser/main');
} else {
  try {
    start();
    app.exit(0);
  } catch (e) {
    // 잘못된 환경 값(포트·경로) 등. 남지 않고 실패로 끝낸다
    console.error(`agent-browser: ${e instanceof Error ? e.message : String(e)}`);
    app.exit(1);
  }
}
