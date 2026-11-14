import { app, session } from 'electron';
import { createHumanWindow, type HumanWindow } from './humanWindow';
import { SHARED_PARTITION } from '../shared/constants';
import type { BrowserToLauncher, LauncherToBrowser, WindowInfo } from '../shared/ipc';

const USER_DATA_FLAG = '--ab-user-data=';
const HIDDEN_FLAG = '--ab-hidden';

const userDataArg = process.argv.find((a) => a.startsWith(USER_DATA_FLAG));
if (!userDataArg || typeof process.send !== 'function') {
  // 런처 없이 직접 실행하면 CDP 파이프가 없어 에이전트를 붙일 수 없다.
  console.error('agent-browser: 런처(startApp)로 실행해야 한다');
  process.exit(1);
}
app.setPath('userData', userDataArg.slice(USER_DATA_FLAG.length));
const showWindows = !process.argv.includes(HIDDEN_FLAG);

const send = (m: BrowserToLauncher) => process.send?.(m);
let human: HumanWindow | undefined;

const listWindows = (): WindowInfo[] => (human && !human.win.isDestroyed() ? [{ kind: 'human' }] : []);

process.on('message', (m: LauncherToBrowser) => {
  switch (m.type) {
    case 'quit': return app.quit();
    case 'listWindows': return send({ type: 'windows', windows: listWindows() });
  }
});
// 런처가 죽으면 같이 끝난다. 에이전트가 붙을 길이 없는 브라우저를 남기지 않는다.
process.on('disconnect', () => app.quit());

// 사람 창을 닫으면 앱을 끝낸다. 지켜보기·관문이 사람 창에 있으므로 사람 창 없이 에이전트만 돌게 두지 않는다.
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  const shared = session.fromPartition(SHARED_PARTITION);
  // 사이트의 권한 요청(카메라·위치·알림 등)은 기본적으로 거부한다(spec 제약).
  shared.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  shared.setPermissionCheckHandler(() => false);

  human = createHumanWindow(showWindows);
  human.win.on('closed', () => { human = undefined; });
  send({ type: 'ready' });
});
