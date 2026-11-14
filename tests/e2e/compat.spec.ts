import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, waitFor } from './helpers';
import { McpClient } from './mcpClient';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const humanGo = async (url: string) => evaluate(app, (await humanUi(app)).targetId, `(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(url)}; i.form.requestSubmit(); })()`);
const list = async (browserUrl: string) => (await (await fetch(browserUrl + 'json/list')).json()) as { id: string; url: string }[];

test('R4: chrome-devtools-mcp를 --browserUrl로 붙여 navigate와 snapshot이 성공한다', async () => {
  await humanGo(`${server.base}/b`); // 사람 창에 다른 페이지
  const a = await createSession(app);
  const mcp = await McpClient.start(a.browserUrl);
  try {
    const pages = await mcp.tool('list_pages');
    expect(pages).toContain('about:blank');
    expect(pages).not.toContain(`${server.base}/b`); // 사람 창의 탭은 안 보인다
    const pageId = Number(/(\d+):/.exec(pages)?.[1]);
    await mcp.tool('navigate_page', { pageId, type: 'url', url: `${server.base}/a` });
    const snapshot = await mcp.tool('take_snapshot', { pageId });
    expect(snapshot).toMatch(/heading "A"/);
    expect((await list(a.browserUrl)).map((t) => t.url)).toContain(`${server.base}/a`);
  } finally { mcp.stop(); }
});

test('R4: Playwright connectOverCDP로 페이지를 열고 클릭할 수 있다', async () => {
  await humanGo(`${server.base}/b`);
  const a = await createSession(app);
  const browser = await chromium.connectOverCDP(a.browserUrl);
  try {
    const context = browser.contexts()[0];
    expect(context.pages().map((p) => p.url())).toEqual(['about:blank']); // 자기 탭만
    const page = await context.newPage();
    await page.goto(`${server.base}/a`);
    await page.click('#to-b');
    await expect(page).toHaveTitle('Page B');
    await waitFor(async () => (await list(a.browserUrl)).some((t) => t.url === `${server.base}/b`), 'A의 목록에 B');
    // 사람 창 탭은 그대로다
    const humanTitle = await evaluate<string>(app, (await humanUi(app)).targetId, `document.querySelector('#tabs .tab').dataset.title`);
    expect(humanTitle).toBe('Page B');
    expect(await evaluate<number>(app, (await humanUi(app)).targetId, `document.querySelectorAll('#tabs .tab').length`)).toBe(1);
  } finally { await browser.close().catch(() => undefined); }
});
