// 카드 20261120-follow-agents: 에이전트 따라 보기(기본 켬)
import { test, expect, chromium, type Browser } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, shown, setFollow, waitFor, tempDir, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let server: TestServer;
let app: RunningApp;
const browsers: Browser[] = [];
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => {
  for (const b of browsers.splice(0)) await b.close().catch(() => undefined);
  await app?.stop();
  await server.close();
});

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const followChecked = () => ui<boolean>(`document.querySelector('#follow').checked`);
const connect = async (s: SessionInfo) => { const b = await chromium.connectOverCDP(s.browserUrl); browsers.push(b); return b.contexts()[0].pages()[0]; };
const shownSession = async () => (await shown(app)).sessionId ?? null;

test('F1·F2: 처음엔 따라 보기가 켜져 있고, 세션이 생기거나 주소가 바뀌거나 활성 탭이 바뀌면 그 세션을 왼쪽에 보인다(제목만 바뀌면 옮기지 않는다)', async () => {
  app = await launch({ keepFollow: true, hidden: false });
  expect(await followChecked()).toBe(true);
  const a = await createSession(app);
  await waitFor(async () => (await shownSession()) === a.id, '새 세션 A를 보임');
  const pageA = await connect(a);
  await pageA.goto(`${server.base}/a`);
  const b = await createSession(app);
  await waitFor(async () => (await shownSession()) === b.id, '새 세션 B를 보임');
  // 보는 상태는 "보기"와 같다: 읽기 전용 머리 표시
  await waitFor(() => ui<boolean>(`document.body.classList.contains('viewing') && document.querySelector('#address').readOnly`), '읽기 전용');
  // A가 이동하면 A로
  await pageA.locator('#to-b').click();
  await waitFor(async () => (await shownSession()) === a.id, '이동한 A를 보임');
  // B는 제목만 바꾼다 → 그대로 A
  const pageB = await connect(b);
  await pageB.evaluate(() => { document.title = '제목만 바뀜'; });
  await new Promise((r) => setTimeout(r, 500));
  expect(await shownSession()).toBe(a.id);
  // B가 새 탭을 열어 활성 탭이 바뀌면 B로
  await (await pageB.context().newPage()).goto(`${server.base}/a`);
  await waitFor(async () => (await shownSession()) === b.id, '활성 탭이 바뀐 B를 보임');
});

test('F3: 따라 보기를 끄면 세션이 생기거나 움직여도 내 화면 그대로다', async () => {
  app = await launch({ keepFollow: true });
  await setFollow(app, false);
  const a = await createSession(app);
  await (await connect(a)).goto(`${server.base}/a`);
  await new Promise((r) => setTimeout(r, 500));
  expect((await shown(app)).view).toBe('human');
});

test('F4: 따라 보는 중 "내 탭으로"를 누르면 따라 보기가 꺼지고, 그 뒤 에이전트가 움직여도 내 화면 그대로다', async () => {
  app = await launch({ keepFollow: true });
  const a = await createSession(app);
  await waitFor(async () => (await shownSession()) === a.id, 'A를 보임');
  await ui(`document.querySelector('#viewing .back-to-own').click()`);
  await waitFor(async () => (await shown(app)).view === 'human', '내 탭으로');
  expect(await followChecked()).toBe(false);
  await (await connect(a)).goto(`${server.base}/a`);
  await new Promise((r) => setTimeout(r, 500));
  expect((await shown(app)).view).toBe('human');
  // 다시 켤 수 있다
  await ui(`document.querySelector('#follow').click()`);
  await waitFor(followChecked, '다시 켬');
});

test('F5: 스위치 값은 앱을 다시 켜도 남는다', async () => {
  const profile = tempDir();
  app = await launch({ keepFollow: true, userDataDir: profile });
  await ui(`document.querySelector('#follow').click()`); // 사람이 끈다
  await waitFor(async () => !(await followChecked()), '끔');
  await app.stop();
  app = await launch({ keepFollow: true, userDataDir: profile });
  expect(await followChecked()).toBe(false);
});
