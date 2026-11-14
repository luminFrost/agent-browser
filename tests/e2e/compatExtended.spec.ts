import { test, expect, chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, createSession, tempDir } from './helpers';
import { McpClient } from './mcpClient';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

/**
 * ADR-0005: 페이지 세션 허용 목록은 도구가 실제로 쓰는 명령으로 좁혔다.
 * 에이전트가 흔히 쓰는 도구 기능을 돌려, 동작이 되고 막힌 명령이 아래 "무시해도 되는 것" 밖에 없는지 지킨다.
 */
const TOLERATED = new Set([
  'Autofill.enable', 'Autofill.setAddresses', // puppeteer가 시도하고 실패를 무시한다(자동 완성 데이터라 열지 않음)
  'WebMCP.enable',
]);

let app: RunningApp;
let server: TestServer;
let blocked: string[];
test.beforeEach(async () => {
  server = await startTestServer();
  blocked = [];
  app = await launch({ onBlocked: (e) => blocked.push(`${e.method} (${e.reason})`) });
});
test.afterEach(async () => { await app.stop(); await server.close(); });

// 이미 닫힌 탭·세션을 묻는 호출은 막히는 것이 맞다(원래 Chrome도 없는 대상에는 오류)
const unexpected = () => blocked.filter((b) => !TOLERATED.has(b.split(' ')[0]) && !b.includes('이 연결의 세션이 아니다') && !b.startsWith('Target.getDevToolsTarget (이 세션의 탭이 아니다)'));
const uidOf = (snapshot: string, pattern: RegExp) => { const line = snapshot.split('\n').find((l) => pattern.test(l)); const m = /uid=(\S+)/.exec(line ?? ''); if (!m) throw new Error(`uid 없음: ${pattern}\n${snapshot}`); return m[1]; };

test('ADR-0005: chrome-devtools-mcp의 조작 도구들이 막히지 않고 동작한다', async () => {
  const a = await createSession(app);
  const mcp = await McpClient.start(a.browserUrl);
  try {
    const pageId = Number(/(\d+):/.exec(await mcp.tool('list_pages'))?.[1]);
    await mcp.tool('navigate_page', { pageId, type: 'url', url: `${server.base}/widgets` });
    let snap = await mcp.tool('take_snapshot', { pageId });
    await mcp.tool('fill', { pageId, uid: uidOf(snap, /textbox "name"/), value: 'kim' });
    await mcp.tool('hover', { pageId, uid: uidOf(snap, /button "go"/) });
    await mcp.tool('click', { pageId, uid: uidOf(snap, /button "go"/) });
    await mcp.tool('wait_for', { pageId, text: ['hello kim'] });
    await mcp.tool('press_key', { pageId, key: 'Tab' });
    await mcp.tool('type_text', { pageId, text: 'x' });
    expect(await mcp.tool('evaluate_script', { pageId, function: '() => document.title' })).toContain('Widgets');
    expect(await mcp.tool('take_screenshot', { pageId })).toBeTruthy();
    expect(await mcp.tool('list_console_messages', { pageId })).toContain('widgets ready');
    expect(await mcp.tool('list_network_requests', { pageId })).toContain('/widgets');
    await mcp.tool('emulate', { pageId, colorScheme: 'dark' });
    // resize_page는 Browser.setWindowBounds로 OS 창 크기를 바꾼다: 사람 창에도 닿을 수 있어 열지 않는다(spec 알려진 한계)
    snap = await mcp.tool('take_snapshot', { pageId });
    await mcp.tool('get_css_styles', { pageId, uid: uidOf(snap, /button "go"/) });
    const upload = join(tempDir('up-'), 'a.txt');
    writeFileSync(upload, 'hi');
    await mcp.tool('upload_file', { pageId, uid: uidOf(snap, /button "Choose File"|button "파일 선택"|"file"/), filePaths: [upload] }).catch(() => undefined); // 파일 선택 단추 이름은 언어마다 다르다
    // 대화상자
    const clickAsk = mcp.tool('click', { pageId, uid: uidOf(snap, /button "ask"/) }).catch(() => '');
    await new Promise((r) => setTimeout(r, 500));
    await mcp.tool('handle_dialog', { pageId, action: 'accept' }).catch(() => undefined);
    await clickAsk;
    // 새 페이지·선택·닫기
    await mcp.tool('new_page', { url: `${server.base}/b` });
    const pages = await mcp.tool('list_pages');
    const second = Number([...pages.matchAll(/(\d+):/g)].map((m) => m[1]).at(-1));
    await mcp.tool('select_page', { pageId: second });
    await mcp.tool('close_page', { pageId: second });
    expect(unexpected(), '막힌 명령').toEqual([]);
  } finally { mcp.stop(); }
});

test('ADR-0005: Playwright의 흔한 API가 막히지 않고 동작한다', async () => {
  const a = await createSession(app);
  const browser = await chromium.connectOverCDP(a.browserUrl);
  try {
    const context = browser.contexts()[0];
    await context.addInitScript(() => { (window as unknown as { injected: boolean }).injected = true; });
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ 'x-test': '1' });
    await page.setViewportSize({ width: 900, height: 700 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route('**/b', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>routed</title>ok' }));
    await page.goto(`${server.base}/widgets`);
    expect(await page.evaluate(() => (window as unknown as { injected: boolean }).injected)).toBe(true);
    await page.fill('#name', 'lee');
    await page.hover('#go');
    await page.click('#go');
    await expect(page.locator('#out')).toHaveText('hello lee');
    await page.keyboard.press('Tab');
    await page.keyboard.type('x');
    page.once('dialog', (d) => d.accept());
    await page.click('#alert');
    await expect(page.locator('#out')).toHaveText('true');
    const upload = join(tempDir('up-'), 'b.txt');
    writeFileSync(upload, 'hi');
    await page.setInputFiles('#file', upload);
    expect(await page.screenshot()).toBeTruthy();
    expect(await page.locator('body').ariaSnapshot()).toContain('button "go"');
    const response = page.waitForResponse('**/b');
    await page.click('#to-b');
    await response;
    await expect(page).toHaveTitle('routed');
    await page.close();
    expect(unexpected(), '막힌 명령').toEqual([]);
  } finally { await browser.close().catch(() => undefined); }
});
