// 묶은 앱(.app)의 시작점(spec-mac-app.md). 같은 실행 파일이 세 역할을 한다.
// 1) 사람이 더블클릭: 런처를 Node 모드로 띄우고 끝난다.
// 2) 런처(Node 모드, ELECTRON_RUN_AS_NODE): 이 파일을 거치지 않고 dist/launcher/cli.js를 바로 돈다.
// 3) 런처가 띄운 브라우저: 인자에 --ab-user-data가 있다 → 브라우저 main을 돈다.
// 런처가 파이프로 브라우저 CDP를 쥐는 구조(ADR-0002)는 그대로다.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';
import { USER_DATA_FLAG } from '../shared/constants';
import { parseCliArgs } from '../launcher/cliArgs';

if (process.argv.some((a) => a.startsWith(USER_DATA_FLAG))) {
  // 브라우저 main은 불러오는 것만으로 돈다(최상위 코드). 브라우저 역할일 때만 불러야 한다
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../browser/main');
} else {
  // 이미 이 프로필로 브라우저가 돌고 있으면 그쪽이 second-instance를 받아 사람 창을 앞으로 가져온다(P5).
  const { profile } = parseCliArgs([], process.env);
  app.setPath('userData', profile);
  if (app.requestSingleInstanceLock()) {
    // 자물쇠는 브라우저가 이어받는다. 런처가 브라우저를 띄우기 전에 놓는다.
    app.releaseSingleInstanceLock();
    spawn(process.execPath, [join(__dirname, '..', 'launcher', 'cli.js')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
  app.exit(0);
}
