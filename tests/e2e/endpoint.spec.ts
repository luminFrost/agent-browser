import { test, expect } from '@playwright/test';
import { launch, createSession, CdpClient, humanUi, type SessionInfo } from './helpers';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
test.beforeEach(async () => { app = await launch(); });
test.afterEach(async () => { await app.stop(); });

const getJson = async (url: string) => { const r = await fetch(url); return { status: r.status, body: r.status === 200 ? await r.json() : undefined }; };
const parts = (s: SessionInfo) => { const u = new URL(s.browserUrl); return { port: Number(u.port), secret: u.pathname.split('/')[1] }; };

test('R3: 세션마다 별도 포트와 비밀 경로의 browserUrl을 받는다', async () => {
  const a = await createSession(app);
  const b = await createSession(app);
  expect(a.browserUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{32,}\/$/);
  expect(parts(a).port).not.toBe(parts(b).port);
  expect(parts(a).secret).not.toBe(parts(b).secret);
});

test('R3: browserUrl의 /json/version과 /json/list가 CDP 형식으로 응답하고, list에는 그 세션의 탭만 있다', async () => {
  await humanUi(app); // 사람 창 UI와 사람 탭이 떠 있는 상태
  const a = await createSession(app);
  const version = await getJson(a.browserUrl + 'json/version');
  expect(version.status).toBe(200);
  expect(version.body).toMatchObject({ 'Protocol-Version': '1.3' });
  expect(version.body.Browser).toMatch(/Chrome\//);
  expect(version.body.webSocketDebuggerUrl).toMatch(new RegExp(`^ws://127\\.0\\.0\\.1:${parts(a).port}/${parts(a).secret}/devtools/browser/`));

  const list = await getJson(a.browserUrl + 'json/list');
  expect(list.status).toBe(200);
  expect(list.body).toHaveLength(1);
  expect(list.body[0]).toMatchObject({ type: 'page', url: 'about:blank' });
  expect(list.body[0].webSocketDebuggerUrl).toBe(`ws://127.0.0.1:${parts(a).port}/${parts(a).secret}/devtools/page/${list.body[0].id}`);
  // /json은 /json/list와 같은 목록이다. 새 탭의 title은 ""에서 "about:blank"로 바뀌는 중일 수 있어 title은 빼고 견준다(카드 20261122-agent-input-lock A7)
  const withoutTitle = (l: unknown) => (l as Record<string, unknown>[]).map(({ title: _t, ...rest }) => rest);
  expect(withoutTitle((await getJson(a.browserUrl + 'json')).body)).toEqual(withoutTitle(list.body));
});

test('R3: 브라우저 WebSocket으로 자기 탭에 붙어 명령을 보낼 수 있다', async () => {
  const a = await createSession(app);
  const ws = (await getJson(a.browserUrl + 'json/version')).body.webSocketDebuggerUrl as string;
  const [tab] = (await getJson(a.browserUrl + 'json/list')).body as { id: string }[];
  const client = await CdpClient.connect(ws);
  try {
    expect((await client.send('Browser.getVersion')).product).toMatch(/Chrome\//);
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
    const r = await client.send('Runtime.evaluate', { expression: '6 * 7', returnByValue: true }, sessionId as string);
    expect((r.result as { value: number }).value).toBe(42);
  } finally { client.close(); }
});

test('R3: 페이지 WebSocket(/devtools/page/<id>)으로도 그 탭에 명령을 보낼 수 있다', async () => {
  const a = await createSession(app);
  const [tab] = (await getJson(a.browserUrl + 'json/list')).body as { webSocketDebuggerUrl: string }[];
  const client = await CdpClient.connect(tab.webSocketDebuggerUrl);
  try {
    const r = await client.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    expect((r.result as { value: string }).value).toBe('about:blank');
  } finally { client.close(); }
});

test('R10: 비밀 경로가 없거나 틀리면 거부된다 (HTTP 404, WebSocket 연결 실패)', async () => {
  const a = await createSession(app);
  const b = await createSession(app);
  const { port, secret } = parts(a);
  expect((await getJson(`http://127.0.0.1:${port}/json/version`)).status).toBe(404);
  expect((await getJson(`http://127.0.0.1:${port}/json/list`)).status).toBe(404);
  expect((await getJson(`http://127.0.0.1:${port}/${'x'.repeat(secret.length)}/json/version`)).status).toBe(404);
  expect((await getJson(`http://127.0.0.1:${parts(b).port}/${secret}/json/version`)).status).toBe(404); // A의 비밀로 B의 포트
  await expect(CdpClient.connect(`ws://127.0.0.1:${port}/devtools/browser/x`)).rejects.toThrow();
  await expect(CdpClient.connect(`ws://127.0.0.1:${port}/wrong/devtools/browser/x`)).rejects.toThrow();
});

test('R10: Host 헤더가 127.0.0.1·localhost가 아니면 거부한다 (DNS rebinding)', async () => {
  const a = await createSession(app);
  const { port, secret } = parts(a);
  const status = await new Promise<number>((ok, fail) => {
    // fetch는 Host 헤더를 바꿀 수 없어 http 모듈로 보낸다
    import('node:http').then(({ request }) => {
      const req = request({ host: '127.0.0.1', port, path: `/${secret}/json/version`, headers: { host: `evil.example:${port}` } }, (res) => ok(res.statusCode ?? 0));
      req.on('error', fail);
      req.end();
    });
  });
  expect(status).toBe(403);
});
