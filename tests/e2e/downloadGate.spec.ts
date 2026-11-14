import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launch, createSession, humanUi, evaluate, waitFor, approvals, decide, tempDir, type SessionInfo } from './helpers';
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
