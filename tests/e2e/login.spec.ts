import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, targets, waitFor, tempDir } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => { await server.close(); });

const humanGo = async (app: RunningApp, url: string) => evaluate(app, (await humanUi(app)).targetId, `(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(url)}; i.form.requestSubmit(); })()`);

/** 세션 A의 탭에서 /me를 열어 로그인 상태 문구를 읽는다 */
async function agentSees(app: RunningApp): Promise<string> {
  const a = await createSession(app);
  const browser = await chromium.connectOverCDP(a.browserUrl);
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.goto(`${server.base}/me`);
    return (await page.textContent('#state')) ?? '';
  } finally { await browser.close().catch(() => undefined); }
}

test('R2: 사람 창에서 로그인하면 세션 A의 탭에서도 로그인 상태이고, 앱을 다시 켜도 유지된다', async () => {
  const profile = tempDir();
  let app = await launch({ userDataDir: profile });
  try {
    expect(await agentSees(app)).toBe('anonymous'); // 로그인 전
    await humanGo(app, `${server.base}/login`);
    const login = await waitFor(async () => (await targets(app)).find((t) => t.url === `${server.base}/login`), '로그인 페이지');
    await evaluate(app, login.targetId, `setTimeout(() => document.querySelector('#go').click(), 0); 1`);
    await waitFor(async () => (await targets(app)).some((t) => t.url === `${server.base}/me` && t.title === 'Me'), '로그인 후 /me');
    expect(await agentSees(app)).toBe('logged-in');
  } finally { await app.stop(); }

  app = await launch({ userDataDir: profile }); // 같은 프로필로 다시 켠다
  try {
    expect(await agentSees(app)).toBe('logged-in');
  } finally { await app.stop(); }
});
