import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, targets, waitFor, approvals, decide, CdpClient, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
let a: SessionInfo;
let browser: Browser;
let page: Page;
test.beforeEach(async () => {
  server = await startTestServer();
  app = await launch();
  a = await createSession(app);
  browser = await chromium.connectOverCDP(a.browserUrl);
  page = browser.contexts()[0].pages()[0];
});
test.afterEach(async () => { await browser.close().catch(() => undefined); await app.stop(); await server.close(); });

const posts = () => server.hits.filter((h) => h === 'POST /submit').length;
const host = () => new URL(server.base).host;
/** 페이지 이동을 기다리지 않고 제출 버튼을 누른다(관문이 이동을 붙잡고 있으므로) */
const submit = () => page.evaluate(() => setTimeout(() => (document.querySelector('#submit') as HTMLButtonElement).click(), 0));

test('R12: 세션 A의 폼 제출은 서버에 닿기 전에 멈추고 사람 창에 묻는다. 허용하면 서버가 받는다', async () => {
  await page.goto(`${server.base}/form`);
  await submit();
  const [req] = await waitFor(async () => { const l = await approvals(app); return l.length ? l : undefined; }, '승인 요청');
  expect(req).toMatchObject({ sessionId: a.id, host: host(), kind: 'form' });
  expect(req.text).toContain(a.id);
  expect(req.text).toContain(host());
  expect(req.text).toContain('폼 제출');
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0); // 아직 서버에 닿지 않았다

  await decide(app, req.id, 'allow');
  await waitFor(async () => posts() === 1, '서버가 POST를 받음');
  await waitFor(async () => (await page.title()) === 'Submitted', 'A의 탭이 결과 페이지');
  expect(await approvals(app)).toEqual([]);
});

test('R12: 거부하면 서버가 받지 않고, A의 탭에는 차단 오류 페이지가 뜬다', async () => {
  await page.goto(`${server.base}/form`);
  await submit();
  const [req] = await waitFor(async () => { const l = await approvals(app); return l.length ? l : undefined; }, '승인 요청');
  await decide(app, req.id, 'deny');
  await waitFor(async () => (await page.textContent('body').catch(() => ''))?.includes('차단') ?? false, '차단 오류 페이지');
  expect(await page.textContent('body')).toContain('사람이 폼 제출을 거부했습니다');
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0);
  expect(await approvals(app)).toEqual([]);
});

test('R12: GET 이동과 사람 창의 폼 제출은 묻지 않는다', async () => {
  await page.goto(`${server.base}/a`);
  await page.click('#to-b');
  await expect(page).toHaveTitle('Page B');
  // 사람 창에서 폼 제출
  await evaluate(app, (await humanUi(app)).targetId, `(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(server.base + '/form?human')}; i.form.requestSubmit(); })()`);
  const form = await waitFor(async () => (await targets(app)).find((t) => t.url === `${server.base}/form?human`), '사람 창 폼');
  await evaluate(app, form.targetId, `setTimeout(() => document.querySelector('#submit').click(), 0); 1`);
  await waitFor(async () => posts() === 1, '사람 창 POST는 바로 서버에');
  expect(await approvals(app)).toEqual([]);
});

test('R12: 기다리는 동안 세션을 멈추면 요청은 취소되고 서버는 받지 않는다', async () => {
  await page.goto(`${server.base}/form`);
  await submit();
  await waitFor(async () => (await approvals(app)).length === 1, '승인 요청');
  await app.stopSession(a.id);
  await waitFor(async () => (await approvals(app)).length === 0, '승인 요청이 사라짐');
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0);
});

test('R12: 에이전트가 Fetch로 최상위 이동을 POST로 바꿔 관문을 건너뛸 수 없다', async () => {
  const ws = ((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  const [tab] = (await (await fetch(a.browserUrl + 'json/list')).json()) as { id: string }[];
  const client = await CdpClient.connect(ws);
  try {
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*submit*' }] }, sessionId as string);
    client.call('Page.navigate', { url: `${server.base}/submit` }, sessionId as string).catch(() => undefined); // 가로챈 동안 응답이 오지 않는다
    const paused = await waitFor(async () => client.events.find((e) => e.method === 'Fetch.requestPaused'), '요청 가로챔');
    const r = await client.call('Fetch.continueRequest', { requestId: paused.params.requestId, method: 'POST', postData: Buffer.from('a=1').toString('base64') }, sessionId as string);
    expect(r.error?.message).toMatch(/agent-browser/);
    await new Promise((r2) => setTimeout(r2, 500));
    expect(posts()).toBe(0);
  } finally { client.close(); }
});

test('R12: iframe 안으로 보내는 폼 제출도 묻는다 (ADR-0004)', async () => {
  await page.goto(`${server.base}/frameform`);
  await submit();
  const [req] = await waitFor(async () => { const l = await approvals(app); return l.length ? l : undefined; }, '승인 요청');
  expect(req).toMatchObject({ sessionId: a.id, kind: 'form' });
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0);
  await decide(app, req.id, 'deny');
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0);
});

test('R12: <object> 안으로 보내는 폼 제출도 묻는다 (검증 3회차, ADR-0005)', async () => {
  await page.goto(`${server.base}/objform`);
  await submit();
  const [req] = await waitFor(async () => { const l = await approvals(app); return l.length ? l : undefined; }, '승인 요청');
  expect(req).toMatchObject({ sessionId: a.id, kind: 'form' });
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0);
  await decide(app, req.id, 'deny');
  await new Promise((r) => setTimeout(r, 500));
  expect(posts()).toBe(0);
});

test('R12: fetch·XHR·sendBeacon은 묻지 않는다 (spec의 알려진 한계)', async () => {
  await page.goto(`${server.base}/a`);
  await page.evaluate(async (u) => { await fetch(u, { method: 'POST', body: 'a=1' }); navigator.sendBeacon(u, 'b=1'); }, `${server.base}/submit`);
  await waitFor(async () => posts() === 2, 'fetch와 beacon POST가 서버에');
  expect(await approvals(app)).toEqual([]);
});
