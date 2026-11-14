import { test, expect } from '@playwright/test';
import { launch, createSession, CdpClient, humanUi, evaluate, targets, waitFor } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const humanGo = async (url: string) => evaluate(app, (await humanUi(app)).targetId, `(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(url)}; i.form.requestSubmit(); })()`);
const pageWith = (url: string) => waitFor(async () => (await targets(app)).find((t) => t.url === url), url);

test('R7: A가 브라우저 전체에 영향을 주는 명령을 보내면 오류를 받고, 사람의 로그인은 그대로다', async () => {
  // 사람 창에서 로그인
  await humanGo(`${server.base}/login`);
  const login = await pageWith(`${server.base}/login`);
  await evaluate(app, login.targetId, `setTimeout(() => document.querySelector('#go').click(), 0); 1`);
  const me = await pageWith(`${server.base}/me`);
  expect(await evaluate<string>(app, me.targetId, `document.querySelector('#state').textContent`)).toBe('logged-in');

  const a = await createSession(app);
  const ws = ((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  const [tab] = (await (await fetch(a.browserUrl + 'json/list')).json()) as { id: string }[];
  const client = await CdpClient.connect(ws);
  try {
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
    await client.send('Page.navigate', { url: `${server.base}/a` }, sessionId as string);
    const origin = server.base;
    const browserLevel: [string, Record<string, unknown>][] = [
      ['Browser.close', {}],
      ['Browser.crash', {}],
      ['Storage.clearCookies', {}],
      ['Storage.clearDataForOrigin', { origin, storageTypes: 'all' }],
      ['Network.clearBrowserCookies', {}],
    ];
    const pageLevel: [string, Record<string, unknown>][] = [
      ['Network.clearBrowserCookies', {}],
      ['Network.clearBrowserCache', {}],
      ['Network.deleteCookies', { name: 'sid', url: origin }],
      ['Storage.clearDataForOrigin', { origin, storageTypes: 'all' }],
      ['Storage.clearCookies', {}],
      ['Browser.close', {}],
    ];
    for (const [method, params] of browserLevel) {
      expect((await client.call(method, params)).error?.message, `브라우저 수준 ${method}`).toMatch(/agent-browser/);
    }
    for (const [method, params] of pageLevel) {
      expect((await client.call(method, params, sessionId as string)).error?.message, `페이지 세션 ${method}`).toMatch(/agent-browser/);
    }
  } finally { client.close(); }

  // 앱은 살아 있고, 사람의 로그인은 그대로다
  await humanGo(`${server.base}/me?after`);
  const after = await pageWith(`${server.base}/me?after`);
  await waitFor(async () => (await evaluate<string>(app, after.targetId, `document.querySelector('#state')?.textContent`)) === 'logged-in', '로그인 유지');
});
