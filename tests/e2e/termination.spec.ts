import { test, expect, chromium, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { launch, createSession, CdpClient, evaluate, targets, waitFor, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const responds = (s: SessionInfo) => fetch(s.browserUrl + 'json/version').then(() => true, () => false);
const agentWindows = async () => (await app.request({ type: 'listWindows' }, 'windows')).windows.filter((w) => w.kind === 'agent').map((w) => (w as { sessionId: string }).sessionId);

async function expectEnded(a: SessionInfo, browserA: Browser, wsA: string) {
  await waitFor(async () => !browserA.isConnected(), 'A의 CDP 연결이 끊김');
  await waitFor(async () => !(await responds(a)), 'A의 browserUrl이 응답하지 않음');
  await expect(CdpClient.connect(wsA)).rejects.toThrow(); // R10: 끝난 세션의 엔드포인트
  expect(await agentWindows()).not.toContain(a.id);
}

async function expectAlive(b: SessionInfo, browserB: Browser) {
  expect(browserB.isConnected()).toBe(true);
  const page = browserB.contexts()[0].pages()[0];
  await page.goto(`${server.base}/a`);
  await expect(page).toHaveTitle('Page A');
  expect(await agentWindows()).toContain(b.id);
}

test('R9: 세션 A를 멈추면 A의 연결이 끊기고 browserUrl이 응답하지 않으며, B는 계속 동작한다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const wsA = ((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  const [browserA, browserB] = await Promise.all([chromium.connectOverCDP(a.browserUrl), chromium.connectOverCDP(b.browserUrl)]);
  try {
    await app.stopSession(a.id);
    await expectEnded(a, browserA, wsA);
    await expectAlive(b, browserB);
  } finally { await browserB.close().catch(() => undefined); }
});

test('R9: 사람이 A의 창을 닫아도 같다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const wsA = ((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  const [browserA, browserB] = await Promise.all([chromium.connectOverCDP(a.browserUrl), chromium.connectOverCDP(b.browserUrl)]);
  try {
    // A 창의 머리줄 UI에서 창을 닫는다(사람이 닫기 버튼을 누른 것과 같은 창 닫힘)
    // 머리줄 UI가 세션 id를 그릴 때까지 기다린다(그리기 전에 읽으면 A의 창을 못 찾는다)
    const uiOfA = await waitFor(async () => {
      for (const ui of (await targets(app)).filter((t) => t.url.includes('/renderer/agent/index.html'))) {
        if (await evaluate<string>(app, ui.targetId, `document.getElementById('session').textContent`) === a.id) return ui;
      }
      return undefined;
    }, 'A 창의 머리줄 UI');
    await evaluate(app, uiOfA.targetId, `window.close(); 1`).catch(() => undefined);
    await expectEnded(a, browserA, wsA);
    await expectAlive(b, browserB);
  } finally { await browserB.close().catch(() => undefined); }
});

const control = () => JSON.parse(readFileSync(app.controlFile, 'utf8')) as { port: number; token: string };

test('A4(spec-claude-attach): DELETE /sessions/<id>로 A를 닫으면 R9와 같이 끝나고 B는 계속 동작한다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const wsA = ((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  const [browserA, browserB] = await Promise.all([chromium.connectOverCDP(a.browserUrl), chromium.connectOverCDP(b.browserUrl)]);
  try {
    const { port, token } = control();
    const res = await fetch(`http://127.0.0.1:${port}/sessions/${a.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(204);
    await expectEnded(a, browserA, wsA);
    await expectAlive(b, browserB);
    expect((await fetch(`http://127.0.0.1:${port}/sessions/${a.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })).status).toBe(404);
  } finally { await browserB.close().catch(() => undefined); }
});

test('A3 다(spec-claude-attach): 붙잡은 세션의 연결이 끊기면 그 창이 닫힌다', async () => {
  const { port, token } = control();
  const held = await new Promise<{ info: SessionInfo; drop: () => void }>((ok, fail) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/sessions?hold=1', method: 'POST', headers: { authorization: `Bearer ${token}` } }, (res) => {
      let buf = '';
      res.on('data', (d: Buffer) => { buf += d.toString(); const i = buf.indexOf('\n'); if (i >= 0) ok({ info: JSON.parse(buf.slice(0, i)) as SessionInfo, drop: () => req.destroy() }); });
      res.on('error', () => undefined);
    });
    req.on('error', fail);
    req.end();
  });
  const b = await createSession(app);
  expect(await agentWindows()).toContain(held.info.id);
  held.drop();
  await waitFor(async () => !(await agentWindows()).includes(held.info.id), '끊긴 세션의 창이 닫힘', 5_000);
  await waitFor(async () => !(await responds(held.info)), '끊긴 세션의 browserUrl이 응답하지 않음', 5_000);
  expect(await responds(b)).toBe(true);
});

test('없는 세션을 멈추라고 하면 아무 일도 없다', async () => {
  const b = await createSession(app);
  await app.stopSession('no-such-session');
  expect(await responds(b)).toBe(true);
});

const BROWSER_EXIT_TIMEOUT_MS = 10_000;

test('P4(spec-mac-app): 사람이 사람 창을 닫으면 브라우저가 끝난다(런처는 exited를 받아 함께 끝난다, cli.ts)', async () => {
  const human = await waitFor(async () => (await targets(app)).find((t) => t.url.includes('/renderer/human/index.html')), '사람 창 UI');
  await evaluate(app, human.targetId, `window.close(); 1`).catch(() => undefined);
  await Promise.race([app.exited, new Promise((_, fail) => setTimeout(() => fail(new Error('브라우저가 끝나지 않음')), BROWSER_EXIT_TIMEOUT_MS))]);
});
