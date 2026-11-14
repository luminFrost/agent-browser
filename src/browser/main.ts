import { app } from 'electron';
import type { BrowserToLauncher, LauncherToBrowser } from '../shared/ipc';

const USER_DATA_FLAG = '--ab-user-data=';

const userDataArg = process.argv.find((a) => a.startsWith(USER_DATA_FLAG));
if (!userDataArg || typeof process.send !== 'function') {
  // 런처 없이 직접 실행하면 CDP 파이프가 없어 에이전트를 붙일 수 없다. 조용히 끝낸다.
  console.error('agent-browser: 런처(startApp)로 실행해야 한다');
  process.exit(1);
}
app.setPath('userData', userDataArg.slice(USER_DATA_FLAG.length));

const send = (m: BrowserToLauncher) => process.send?.(m);

process.on('message', (m: LauncherToBrowser) => {
  if (m.type === 'quit') app.quit();
});
// 런처가 죽으면 같이 끝난다. 에이전트가 붙을 길이 없는 브라우저를 남기지 않는다.
process.on('disconnect', () => app.quit());

app.on('window-all-closed', () => { /* 사람 창 처리는 T2에서 */ });

app.whenReady().then(() => send({ type: 'ready' }));
