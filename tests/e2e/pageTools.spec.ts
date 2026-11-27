// 카드 20261127-page-devtools: 개발자도구(F-BR-06·F-HW-13)와 오른쪽 클릭 메뉴(F-BR-07)
import { execFileSync } from 'node:child_process';
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { launch, createSession, CdpClient, humanUi, evaluate, shown, waitFor, type SessionInfo } from './helpers';
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
const menu = (id: string) => app.request({ type: 'clickMenu', id }, 'done');
const pageTools = async () => { const { open, ui } = await app.request({ type: 'pageTools' }, 'pageTools'); return { open, ui }; };
/** 브라우저 안 개발자도구 화면(devtools://) 수. 탭 목록과 상관없이 센다(세션이 끝난 뒤에도 남았는지 보려고) */
const devtoolsFrontends = async () => (await app.request({ type: 'pageTools' }, 'pageTools')).frontends;
/** 사람이 지금 보이는 탭의 (x, y)를 오른쪽 클릭했을 때 뜬 메뉴(구분선은 '-') */
const rightClick = async (x: number, y: number) => (await app.request({ type: 'contextMenu', x, y }, 'popup')).items;
const labels = (items: { label: string }[]) => items.map((i) => i.label);
const pick = (label: string) => app.request({ type: 'clickPopup', path: [label] }, 'done');
const tabs = () => ui<{ titles: string[]; active: number; address: string }>(`(() => {
  const all = [...document.querySelectorAll('#tabs .tab')];
  return { titles: all.map((t) => t.querySelector('.title').textContent.trim()), active: all.findIndex((t) => t.classList.contains('active')), address: document.querySelector('#address').value };
})()`);
async function go(path: string) {
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}${path}`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => (await tabs()).address === `${server.base}${path}`, `주소 ${path}`);
}
const open = async (s: SessionInfo, path: string): Promise<{ browser: Browser; page: Page }> => {
  const browser = await chromium.connectOverCDP(s.browserUrl); browsers.push(browser);
  const page = browser.contexts()[0].pages()[0];
  await page.goto(`${server.base}${path}`);
  return { browser, page };
};
const view = async (id: string) => {
  await ui(`document.querySelector('#sessions .session[data-session-id="${id}"] .view').click()`);
  await waitFor(async () => (await shown(app)).sessionId === id, '세션을 보는 중');
};
const backToOwn = async () => {
  await ui(`document.querySelector('.back-to-own').click()`);
  await waitFor(async () => (await shown(app)).view === 'human', '내 탭으로');
};
/** 브라우저(자식 포함)가 여는 TCP 포트. 없으면 빈 문자열(ADR-0002) */
const listeningPorts = (pid: number): string => {
  try {
    const kids = execFileSync('pgrep', ['-P', String(pid)]).toString().trim().split('\n').filter(Boolean);
    return execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', [pid, ...kids].join(',')]).toString();
  } catch {
    return ''; // lsof는 결과가 없으면 1로 끝난다
  }
};

test('D1: 보기 > 개발자도구(⌥⌘I)는 내 탭에 별도 창으로 열고 다시 누르면 닫는다. 창 UI에는 열지 않고, TCP 포트도 열지 않는다', async () => {
  await go('/a');
  expect(await pageTools()).toEqual({ open: [], ui: false });
  await menu('devtools');
  await waitFor(async () => (await pageTools()).open.length === 1, '개발자도구 열림');
  expect(await pageTools()).toEqual({ open: [{ view: 'human', shown: true }], ui: false });
  expect(listeningPorts(app.browserPid)).toBe('');
  expect((await app.request({ type: 'listWindows' }, 'windows')).windows).toEqual([{ kind: 'human' }]);
  await menu('devtools');
  await waitFor(async () => (await pageTools()).open.length === 0, '개발자도구 닫힘');
  expect((await pageTools()).ui).toBe(false);
});

test('D2: 세션을 보는 중 개발자도구는 그 세션의 보이는 탭에 연다. 에이전트는 그대로 되고 개발자도구를 보지 못한다. 나가면 닫는다', async () => {
  const a = await createSession(app);
  const b = await createSession(app);
  const { page } = await open(a, '/a');
  await view(a.id);
  await menu('devtools');
  await waitFor(async () => (await pageTools()).open.length === 1, '세션 탭 개발자도구 열림');
  expect((await pageTools()).open).toEqual([{ view: 'session', sessionId: a.id, shown: true }]);
  // 에이전트: 이동·클릭·스냅숏·스크린샷
  await page.click('#to-b');
  await page.waitForURL(`${server.base}/b`);
  await page.goto(`${server.base}/a`);
  expect(await page.locator('body').ariaSnapshot()).toContain('heading "A"');
  expect((await page.screenshot()).length).toBeGreaterThan(0);
  // 에이전트 목록(json/list, Target.getTargets)에 개발자도구가 없다
  const list = (await (await fetch(`${a.browserUrl}json/list`)).json()) as { url: string; type: string }[];
  expect(list.filter((t) => t.url.startsWith('devtools://') || t.type !== 'page')).toEqual([]);
  expect(list).toHaveLength(1);
  const client = await CdpClient.connect(((await (await fetch(`${a.browserUrl}json/version`)).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
  try {
    const { targetInfos } = await client.send('Target.getTargets');
    expect((targetInfos as { url: string; type: string }[]).map((t) => [t.type, t.url])).toEqual([['page', `${server.base}/a`]]);
  } finally { client.close(); }
  expect(listeningPorts(app.browserPid)).toBe('');
  // 다른 세션으로 옮기면 닫는다
  await open(b, '/b');
  await view(b.id);
  await waitFor(async () => (await pageTools()).open.length === 0, '다른 세션으로 옮기면 닫힘');
  // 내 탭으로 돌아오면 닫는다
  await menu('devtools');
  await waitFor(async () => (await pageTools()).open.length === 1, '세션 b 개발자도구 열림');
  await backToOwn();
  await waitFor(async () => (await pageTools()).open.length === 0, '내 탭으로 오면 닫힘');
  // 세션이 끝나면 닫는다
  await view(a.id);
  await menu('devtools');
  await waitFor(async () => (await pageTools()).open.length === 1, '세션 a 개발자도구 다시 열림');
  await waitFor(async () => (await devtoolsFrontends()) === 1, '개발자도구 화면 하나');
  await app.request({ type: 'closeSession', sessionId: a.id }, 'done');
  await waitFor(async () => (await devtoolsFrontends()) === 0, '세션이 끝나면 개발자도구 화면도 없어짐');
  expect((await pageTools()).open).toEqual([]);
  expect((await pageTools()).ui).toBe(false);
});

test('D3: 내 탭 오른쪽 클릭 메뉴. 링크는 오른쪽 새 탭(활성 그대로)·주소 복사, 이미지·입력 칸·빈 곳 메뉴, 검사', async () => {
  await go('/a'); // 뒤로 갈 곳
  await go('/menu');
  await waitFor(async () => (await tabs()).titles[0] === 'Menu', '제목 Menu');
  const link = await rightClick(20, 20);
  expect(labels(link)).toEqual(['링크를 새 탭에서 열기', '링크 주소 복사', '-', '검사']);
  await pick('링크를 새 탭에서 열기');
  await waitFor(async () => (await tabs()).titles.join('|') === 'Menu|Page B', '오른쪽에 새 탭 B');
  expect((await tabs()).active).toBe(0);
  expect((await tabs()).address).toBe(`${server.base}/menu`);
  await rightClick(20, 20);
  await pick('링크 주소 복사');
  expect((await app.request({ type: 'clipboard' }, 'clipboard')).text).toBe(`${server.base}/b`);
  expect(labels(await rightClick(20, 80))).toEqual(['이미지를 새 탭에서 열기', '이미지 주소 복사', '-', '검사']);
  await pick('이미지 주소 복사');
  expect((await app.request({ type: 'clipboard' }, 'clipboard')).text).toBe(`${server.base}/icon.png`);
  expect(labels(await rightClick(20, 135))).toEqual(['실행 취소', '-', '잘라내기', '복사', '붙여넣기', '-', '모두 선택', '-', '검사']);
  await pick('검사'); // 메뉴 닫기 겸 검사(아래에서 다시 확인)
  await waitFor(async () => (await pageTools()).open.length === 1, '검사로 개발자도구 열림');
  await menu('devtools');
  await waitFor(async () => (await pageTools()).open.length === 0, '닫힘');
  const plain = await rightClick(300, 300);
  expect(labels(plain)).toEqual(['뒤로', '앞으로', '새로고침', '-', '검사']);
  expect(plain.slice(0, 3).map((i) => i.enabled)).toEqual([true, false, true]);
  await pick('검사');
  await waitFor(async () => (await pageTools()).open.length === 1, '검사');
  expect((await pageTools()).open).toEqual([{ view: 'human', shown: true }]);
  expect((await pageTools()).ui).toBe(false);
});

test('D4: 세션을 보는 중 오른쪽 클릭은 "검사" 하나뿐이고, 페이지는 contextmenu·mousedown을 받지 않는다', async () => {
  const a = await createSession(app);
  const { page } = await open(a, '/menu');
  await view(a.id);
  const items = await rightClick(20, 20);
  expect(labels(items)).toEqual(['검사']);
  await new Promise((r) => setTimeout(r, 300));
  expect(await page.evaluate(() => (window as unknown as { ev: string[] }).ev)).toEqual([]);
  await pick('검사');
  await waitFor(async () => (await pageTools()).open.length === 1, '세션 탭 검사');
  expect((await pageTools()).open).toEqual([{ view: 'session', sessionId: a.id, shown: true }]);
  expect(await page.evaluate(() => (window as unknown as { ev: string[] }).ev)).toEqual([]);
});
