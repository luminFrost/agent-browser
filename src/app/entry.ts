// 묶은 앱(.app)의 시작점(spec-mac-app.md). 같은 실행 파일이 세 역할을 한다.
// 1) 사람이 더블클릭: 런처를 Node 모드로 띄우고 끝난다.
// 2) 런처(Node 모드, ELECTRON_RUN_AS_NODE): 이 파일을 거치지 않고 dist/launcher/cli.js를 바로 돈다.
// 3) 런처가 띄운 브라우저: 인자에 --ab-user-data가 있다 → 브라우저 main을 돈다.
// 런처가 파이프로 브라우저 CDP를 쥐는 구조(ADR-0002)는 그대로다.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { LAUNCHER_LOG_NAME, START_MARKER_ENV, START_MARKER_NAME, USER_DATA_FLAG } from '../shared/constants';
import { parseCliArgs } from '../launcher/cliArgs';
import { claimStart, processAlive, recordLauncher } from './startMarker';

/** 런처를 띄운다. 출력은 프로필의 로그 파일에 남겨, 시작이 실패해도 원인을 볼 수 있게 한다 */
function startLauncher(profile: string, marker: string): void {
  const log = openSync(join(profile, LAUNCHER_LOG_NAME), 'a', 0o600);
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', [START_MARKER_ENV]: marker };
  // 원본 CDP를 쥐는 런처에 인스펙터 등 Node 옵션이 흘러들지 않게 한다
  delete env.NODE_OPTIONS;
  const launcher = spawn(process.execPath, [join(__dirname, '..', 'launcher', 'cli.js')], {
    env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  if (launcher.pid !== undefined) recordLauncher(marker, launcher.pid);
  launcher.unref();
}

function start(): void {
  const { profile } = parseCliArgs([], process.env);
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath('userData', profile);
  // 이미 이 프로필로 브라우저가 돌고 있으면 그쪽이 second-instance를 받아 사람 창을 앞으로 가져온다(P5).
  if (!app.requestSingleInstanceLock()) return;
  // 자물쇠는 브라우저가 이어받으므로 놓는다. 브라우저가 잡기 전의 틈은 시작 표시가 막는다.
  app.releaseSingleInstanceLock();
  const marker = join(profile, START_MARKER_NAME);
  if (claimStart(marker, processAlive)) startLauncher(profile, marker);
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
