// 카드 20261122-agent-input-lock: 에이전트 탭에는 사람 입력이 닿지 않고, 에이전트의 CDP 입력은 그대로 된다
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, shown, waitFor, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let server: TestServer;
let app: RunningApp;
const browsers: Browser[] = [];
test.beforeEach(async () => { server = await startTestServer(); app = await launch({ hidden: false }); });
test.afterEach(async () => {
  for (const b of browsers.splice(0)) await b.close().catch(() => undefined);
  await app.stop();
  await server.close();
});

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const open = async (s: SessionInfo): Promise<Page> => {
  const b = await chromium.connectOverCDP(s.browserUrl); browsers.push(b);
  const page = b.contexts()[0].pages()[0];
  await page.goto(`${server.base}/input`);
  return page;
};
const view = async (id: string) => {
  await ui(`document.querySelector('#sessions .session[data-session-id="${id}"] .view').click()`);
  await waitFor(async () => (await shown(app)).sessionId === id, '세션을 보는 중');
};
/** 사람이 그 세션의 보이는 탭(x, y)을 누르고 글자를 친 것처럼 OS 입력 경로로 보낸다 */
const human = (sessionId: string, x: number, y: number) => app.request({ type: 'simulateHumanInput', sessionId, x, y, text: 'h' }, 'done');
const events = (page: Page) => page.evaluate(() => (window as unknown as { ev: string[] }).ev.splice(0));

test('A1·A3·A6: 보는 중인 세션 페이지에 사람의 클릭·키는 닿지 않고, 에이전트의 클릭·입력은 그대로 된다. 막힌 키 뒤 포커스는 사람 UI로', async () => {
  const a = await createSession(app);
  const page = await open(a);
  await view(a.id);
  await human(a.id, 50, 50);
  await new Promise((r) => setTimeout(r, 300));
  expect(await events(page)).toEqual([]);
  expect(await page.inputValue('#i')).toBe('');
  await waitFor(async () => (await shown(app)).focusedUi, '포커스가 사람 UI로');
  // 보는 중에도 에이전트(Playwright: Input.dispatchMouseEvent·dispatchKeyEvent·insertText)는 된다
  await page.click('#i');
  await page.keyboard.type('ok');
  await page.keyboard.insertText('!');
  expect(await events(page)).toEqual(expect.arrayContaining(['mousedown', 'keydown']));
  expect(await page.inputValue('#i')).toBe('ok!');
  // 에이전트 입력이 끝난 뒤에는 다시 막힌다
  await human(a.id, 50, 50);
  await new Promise((r) => setTimeout(r, 300));
  expect(await events(page)).toEqual([]);
  expect(await page.inputValue('#i')).toBe('ok!');
});

test('A2: 보이지 않는 세션 탭(창 구석 1px)을 사람이 눌러도 페이지에 닿지 않는다', async () => {
  const a = await createSession(app);
  const page = await open(a);
  expect((await shown(app)).view).toBe('human');
  await human(a.id, 0, 0); // 드러난 왼쪽 위 점
  await new Promise((r) => setTimeout(r, 300));
  expect(await events(page)).toEqual([]);
  await page.click('#i', { position: { x: 1, y: 1 } }); // 에이전트는 된다
  expect(await events(page)).toContain('mousedown');
});
