import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launch, createSession, humanUi, evaluate, waitFor, approvals, decide, tempDir, CdpClient, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
let a: SessionInfo;
let browser: Browser;
let page: Page;
let downloads: string;
let profile: string;
test.beforeEach(async () => {
  server = await startTestServer();
  downloads = tempDir('dl-');
  profile = tempDir();
  app = await launch({ userDataDir: profile, downloadsDir: downloads });
  a = await createSession(app);
  browser = await chromium.connectOverCDP(a.browserUrl);
  page = browser.contexts()[0].pages()[0];
});
test.afterEach(async () => { await browser.close().catch(() => undefined); await app.stop(); await server.close(); });

const files = () => readdirSync(downloads);
const quarantine = () => { const q = join(profile, 'quarantine'); return existsSync(q) ? readdirSync(q) : []; };
const startDownload = async () => { await page.goto(`${server.base}/a`); await page.evaluate((u) => { location.href = u; }, `${server.base}/file`); };
const request = () => waitFor(async () => (await approvals(app)).find((x) => x.kind === 'download'), '다운로드 승인 요청');

test('R13: 세션 A의 다운로드는 사람 창에서 허용해야 다운로드 폴더에 저장된다', async () => {
  await startDownload();
  const req = await request();
  expect(req).toMatchObject({ sessionId: a.id, host: new URL(server.base).host, kind: 'download' });
  expect(req.text).toContain('data.bin');
  await new Promise((r) => setTimeout(r, 500));
  expect(files()).toEqual([]); // 허용 전에는 다운로드 폴더에 없다
  await decide(app, req.id, 'allow');
  await waitFor(async () => files().includes('data.bin'), '다운로드 폴더에 저장');
  expect(statSync(join(downloads, 'data.bin')).size).toBe(200_000);
  await waitFor(async () => quarantine().length === 0, '격리 폴더 비움');
  expect(await approvals(app)).toEqual([]);
});

test('R13: 거부하면 파일이 생기지 않는다 (다운로드 폴더에도, 격리 폴더에도)', async () => {
  await startDownload();
  const req = await request();
  await decide(app, req.id, 'deny');
  await waitFor(async () => (await approvals(app)).length === 0, '요청이 사라짐');
  await waitFor(async () => quarantine().length === 0, '격리 폴더 비움');
  await new Promise((r) => setTimeout(r, 500));
  expect(files()).toEqual([]);
  expect(quarantine()).toEqual([]);
});

test('R13: 사람 창의 다운로드는 묻지 않고 저장된다', async () => {
  await evaluate(app, (await humanUi(app)).targetId, `(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(server.base + '/file')}; i.form.requestSubmit(); })()`);
  await waitFor(async () => files().includes('data.bin'), '사람 다운로드 저장');
  expect(await approvals(app)).toEqual([]);
});

test('R13: 다 받은 뒤에 거부해도 파일이 생기지 않는다', async () => {
  await startDownload();
  const req = await request();
  await waitFor(async () => quarantine().some((f) => statSync(join(profile, 'quarantine', f)).size === 200_000), '격리 폴더에 다 받음');
  await decide(app, req.id, 'deny');
  await waitFor(async () => quarantine().length === 0, '격리 폴더 비움');
  await new Promise((r) => setTimeout(r, 500));
  expect(files()).toEqual([]);
});

test('R13: 에이전트가 Page.setDownloadBehavior로 관문을 건너뛸 수 없다', async () => {
  const elsewhere = tempDir('elsewhere-');
  const ws = ((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  const [tab] = (await (await fetch(a.browserUrl + 'json/list')).json()) as { id: string }[];
  const client = await CdpClient.connect(ws);
  try {
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
    const r = await client.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: elsewhere }, sessionId as string);
    expect(r.error?.message).toMatch(/agent-browser/);
    await client.call('Page.navigate', { url: `${server.base}/file` }, sessionId as string);
    const req = await request();
    await new Promise((r2) => setTimeout(r2, 1000));
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(files()).toEqual([]);
    await decide(app, req.id, 'deny');
  } finally { client.close(); }
});

test('R13: 응답이 오기 전에 탭을 닫아도 승인 없이 저장되지 않는다 (검증 2회차 P1)', async () => {
  await page.goto(`${server.base}/a`);
  const extra = await browser.contexts()[0].newPage();
  await extra.goto(`${server.base}/a`);
  await extra.evaluate((u) => { const l = document.createElement('a'); l.href = u; l.download = ''; document.body.append(l); l.click(); }, `${server.base}/slowfile?ms=1500`);
  await new Promise((r) => setTimeout(r, 200));
  await extra.close();
  await new Promise((r) => setTimeout(r, 2500));
  expect(files()).toEqual([]);
});

test('R13: 다운로드 폴더가 아직 없어도, 허용하면 만들어서 저장한다', async () => {
  await browser.close().catch(() => undefined);
  await app.stop();
  const missing = join(tempDir('dl-parent-'), 'not-yet');
  app = await launch({ userDataDir: tempDir(), downloadsDir: missing });
  a = await createSession(app);
  browser = await chromium.connectOverCDP(a.browserUrl);
  page = browser.contexts()[0].pages()[0];
  await startDownload();
  const req = await request();
  await decide(app, req.id, 'allow');
  await waitFor(async () => existsSync(join(missing, 'data.bin')), '없던 폴더에 저장');
});
