// 카드 20261128-find-zoom: 페이지 안 찾기(F-BR-08)와 확대·축소(F-BR-09, CSS 확대 D-8)
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, shown, targets, tempDir, waitFor, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let server: TestServer;
let app: RunningApp | undefined;
const browsers: Browser[] = [];
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => {
  for (const b of browsers.splice(0)) await b.close().catch(() => undefined);
  await app?.stop();
  app = undefined;
  await server.close();
});

const running = () => { if (!app) throw new Error('앱이 없다'); return app; };
const ui = async <T>(expr: string) => evaluate<T>(running(), (await humanUi(running())).targetId, expr);
const menu = (id: string) => running().request({ type: 'clickMenu', id }, 'done');
async function go(path: string) {
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}${path}`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => (await ui<string>(`document.querySelector('#address').value`)) === `${server.base}${path}`, `주소 ${path}`);
  await waitFor(async () => (await ui<boolean>(`document.querySelector('#loading').hidden`)), `${path} 다 읽음`);
}
/** 찾기 막대 상태: 열림, 칸 글자, 결과 글자, 결과 없음 표시, 칸에 커서 */
const bar = () => ui<{ open: boolean; text: string; count: string; countHidden: boolean; none: boolean; focused: boolean; selected: string }>(`(() => {
  const f = document.querySelector('#find'); const i = document.querySelector('#find-text'); const c = document.querySelector('#find-count');
  return { open: !f.hidden, text: i.value, count: c.textContent, countHidden: c.hidden, none: f.classList.contains('none'), focused: document.activeElement === i,
    selected: i.value.slice(i.selectionStart, i.selectionEnd) };
})()`);
const typeFind = (text: string) => ui(`(() => { const i = document.querySelector('#find-text'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); })()`);
const key = (k: string, extra = '') => ui(`document.querySelector('#find-text').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true${extra} }))`);
const countIs = (want: string) => waitFor(async () => (await bar()).count === want, `결과 ${want}`);
const humanTarget = async (path: string) => (await targets(running())).find((t) => t.url === `${server.base}${path}`)?.targetId as string;
const openAgent = async (s: SessionInfo, path: string): Promise<Page> => {
  const browser = await chromium.connectOverCDP(s.browserUrl); browsers.push(browser);
  const page = browser.contexts()[0].pages()[0];
  await page.goto(`${server.base}${path}`);
  return page;
};
const view = async (id: string | null) => {
  await ui(id === null ? `document.querySelector('.back-to-own').click()` : `document.querySelector('#sessions .session[data-session-id="${id}"] .view').click()`);
  await waitFor(async () => (id === null ? (await shown(running())).view === 'human' : (await shown(running())).sessionId === id), id === null ? '내 탭' : '세션 보기');
};

test('F1: ⌘F로 막대를 열고 입력하는 대로 찾는다. Enter·⌘G 다음, ⇧Enter·⇧⌘G 이전, 한글 조합 Enter는 넘기지 않음, 없으면 0/0, 빈 칸은 결과 숨김', async () => {
  app = await launch();
  await go('/find');
  expect((await bar()).open).toBe(false);
  await menu('find');
  await waitFor(async () => (await bar()).open && (await bar()).focused, '막대 열림, 칸에 커서');
  await typeFind('apple');
  await countIs('1/3');
  await key('Enter');
  await countIs('2/3');
  await menu('find-next');
  await countIs('3/3');
  await menu('find-next');
  await countIs('1/3'); // 끝에서 처음으로 돈다(Chrome과 같다)
  await key('Enter', ', shiftKey: true');
  await countIs('3/3');
  await menu('find-prev');
  await countIs('2/3');
  await key('Enter', ', isComposing: true'); // 조합 중 Enter는 글자를 끝낼 뿐
  await new Promise((r) => setTimeout(r, 300));
  expect((await bar()).count).toBe('2/3');
  await typeFind('zzz');
  await waitFor(async () => (await bar()).count === '0/0' && (await bar()).none, '없음 0/0, 경고');
  await typeFind('');
  await waitFor(async () => (await bar()).countHidden && !(await bar()).none, '빈 칸이면 결과 숨김');
  // 이미 열려 있으면 다시 ⌘F로 글자를 모두 고른다
  await typeFind('banana');
  await countIs('1/1');
  await ui(`document.querySelector('#address').focus()`);
  await menu('find');
  await waitFor(async () => { const b = await bar(); return b.focused && b.selected === 'banana'; }, '다시 ⌘F면 칸 글자 모두 선택');
});

test('F2: Esc·✕·탭 바꾸기·이동·세션 보기면 닫고 강조를 지운다. 세션을 보는 중 ⌘F는 열지 않는다', async () => {
  app = await launch({ hidden: false });
  await go('/find');
  const open = async (text = 'apple') => { await menu('find'); await waitFor(async () => (await bar()).open, '열림'); await typeFind(text); await countIs(text === 'apple' ? '1/3' : '1/1'); };
  const findState = () => running().request({ type: 'findState' }, 'findState');
  /** 닫을 때 강조를 실제로 지웠는지: 찾던 탭에 stopFindInPage('clearSelection')를 부른 횟수가 하나 는다 */
  const expectCleared = async (before: number) => { const s = await findState(); expect([s.active, s.cleared]).toEqual([false, before + 1]); };
  // 글자 없이 연 막대도 탭 바꾸기·이동이면 닫는다
  await menu('find');
  await waitFor(async () => (await bar()).open, '빈 막대 열림');
  await menu('new-tab');
  await waitFor(async () => !(await bar()).open, '빈 막대: 탭 바꾸기로 닫힘');
  await menu('close-tab');
  await waitFor(async () => (await ui<string>(`document.querySelector('#tabs .tab.active')?.dataset.title ?? ''`)) === 'Find', '찾기 탭으로');
  await menu('find');
  await waitFor(async () => (await bar()).open, '빈 막대 다시 열림');
  await go('/a');
  await waitFor(async () => !(await bar()).open, '빈 막대: 이동으로 닫힘');
  await go('/find');
  // Esc
  let cleared = (await findState()).cleared;
  await open();
  await key('Escape');
  await waitFor(async () => !(await bar()).open, 'Esc로 닫힘');
  await expectCleared(cleared);
  // ✕
  cleared = (await findState()).cleared;
  await open();
  await ui(`document.querySelector('#find-close').click()`);
  await waitFor(async () => !(await bar()).open, '✕로 닫힘');
  await expectCleared(cleared);
  // 탭 바꾸기
  cleared = (await findState()).cleared;
  await open();
  await menu('new-tab');
  await waitFor(async () => !(await bar()).open, '새 탭(탭 바꾸기)으로 닫힘');
  await expectCleared(cleared);
  await menu('close-tab');
  // 이동
  await waitFor(async () => (await ui<string>(`document.querySelector('#tabs .tab.active')?.dataset.title ?? ''`)) === 'Find', '찾기 탭으로');
  cleared = (await findState()).cleared;
  await open();
  await go('/a');
  await waitFor(async () => !(await bar()).open, '이동으로 닫힘');
  await expectCleared(cleared);
  // 세션 보기
  await go('/find');
  const a = await createSession(running());
  await openAgent(a, '/find');
  cleared = (await findState()).cleared;
  await open();
  await view(a.id);
  await waitFor(async () => !(await bar()).open, '세션 보기로 닫힘');
  await expectCleared(cleared);
  // 세션을 보는 중 ⌘F·⌘G는 막대를 열지도, 찾지도 않는다
  await menu('find');
  await menu('find-next');
  // UI가 찾기 명령을 바로 보내도(막대를 거치지 않아도) main은 세션 탭에 찾지 않는다
  await ui(`window.humanApi.command({ cmd: 'find', text: 'apple', forward: true, next: false })`);
  await new Promise((r) => setTimeout(r, 300));
  expect((await bar()).open).toBe(false);
  const state = await running().request({ type: 'findState' }, 'findState');
  expect([state.active, state.searched]).toEqual([false, ['human']]);
  // 사람 탭에만 찾았다: 세션 탭에는 한 번도 찾지 않았다
  await view(null);
  await open();
  expect((await running().request({ type: 'findState' }, 'findState')).searched).toEqual(['human']);
});

test('Z1: ⌘+·⌘−·⌘0이 정해진 단계로 바꾸고 %를 2초 보이며, 100%가 아니면 돋보기가 남는다. 세션 보는 중에는 바꾸지 않는다', async () => {
  app = await launch({ hidden: false });
  await go('/a');
  const id = await humanTarget('/a');
  const zoom = () => evaluate<string>(running(), id, `getComputedStyle(document.documentElement).zoom`);
  const head = () => ui<{ glass: boolean; notice: boolean; text: string }>(`(() => ({
    glass: !document.querySelector('#zoom-button').hidden, notice: !document.querySelector('#zoom-notice').hidden,
    text: document.querySelector('#zoom-notice .pct').textContent }))()`);
  expect(await zoom()).toBe('1');
  expect(await head()).toMatchObject({ glass: false, notice: false });
  await menu('zoom-in');
  await waitFor(async () => (await zoom()) === '1.1', '110%');
  await waitFor(async () => { const h = await head(); return h.glass && h.notice && h.text === '110%'; }, '돋보기·110% 알림');
  await menu('zoom-in-equal');
  await waitFor(async () => (await zoom()) === '1.25', '⌘=도 확대 125%');
  await waitFor(async () => !(await head()).notice, '알림은 잠시 뒤 사라짐', 5000);
  expect((await head()).glass).toBe(true);
  for (let i = 0; i < 9; i++) await menu('zoom-in');
  await waitFor(async () => (await zoom()) === '3', '끝 300%');
  await menu('zoom-in');
  await waitFor(async () => (await head()).text === '300%', '끝에서는 그대로(알림은 다시)');
  expect(await zoom()).toBe('3');
  await menu('zoom-reset');
  await waitFor(async () => (await zoom()) === '1', '⌘0 100%');
  await waitFor(async () => !(await head()).glass, '100%면 돋보기 숨김');
  for (let i = 0; i < 9; i++) await menu('zoom-out');
  await waitFor(async () => (await zoom()) === '0.5', '끝 50%');
  // 돋보기를 누르면 100%
  await ui(`document.querySelector('#zoom-button').click()`);
  await waitFor(async () => (await zoom()) === '1', '돋보기로 100%');
  // 세션 보는 중: 돋보기 숨김, 단축키 무시
  await menu('zoom-in');
  await waitFor(async () => (await zoom()) === '1.1', '110%');
  const a = await createSession(running());
  const page = await openAgent(a, '/b');
  await view(a.id);
  await waitFor(async () => !(await head()).glass, '세션 보는 중 돋보기 숨김');
  await menu('zoom-in');
  await menu('zoom-reset');
  await new Promise((r) => setTimeout(r, 300));
  expect(await zoom()).toBe('1.1');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe('1');
  await view(null);
  await waitFor(async () => (await head()).glass, '내 탭으로 오면 돋보기');
});

test('Z2: 배율은 사이트마다 남아 다시 열어도·앱을 다시 켜도 같고, 같은 사이트의 에이전트 탭은 100% 그대로', async () => {
  const profile = tempDir();
  app = await launch({ userDataDir: profile, hidden: false });
  await go('/a');
  await menu('zoom-in');
  await menu('zoom-in'); // 125%
  const zoomOf = async (path: string) => evaluate<string>(running(), await humanTarget(path), `getComputedStyle(document.documentElement).zoom`);
  await waitFor(async () => (await zoomOf('/a')) === '1.25', '125%');
  // 같은 사이트 다른 페이지·새 탭도 125%
  await go('/b');
  await waitFor(async () => (await zoomOf('/b')) === '1.25', '같은 사이트 /b도 125%');
  // 같은 사이트의 에이전트 탭은 100%, 창 폭도 그대로
  const a = await createSession(running());
  const page = await openAgent(a, '/a');
  const agentLook = () => page.evaluate(() => ({ zoom: getComputedStyle(document.documentElement).zoom, width: window.innerWidth, dpr: window.devicePixelRatio }));
  const before = await agentLook();
  expect(before.zoom).toBe('1');
  await view(null);
  await menu('zoom-in'); // 사람이 150%로
  await waitFor(async () => (await zoomOf('/b')) === '1.5', '150%');
  await page.reload();
  expect(await agentLook()).toEqual(before);
  // 앱을 다시 켜도 같은 사이트는 150%
  await running().stop();
  app = await launch({ userDataDir: profile, hidden: false });
  await go('/a');
  await waitFor(async () => (await zoomOf('/a')) === '1.5', '다시 켜도 150%');
  await waitFor(async () => !(await ui<boolean>(`document.querySelector('#zoom-button').hidden`)), '돋보기 보임');
  // 100%로 돌리면 파일에서 지워진다
  await menu('zoom-reset');
  await waitFor(async () => (await zoomOf('/a')) === '1', '100%');
  await running().stop();
  app = await launch({ userDataDir: profile, hidden: false });
  await go('/a');
  await new Promise((r) => setTimeout(r, 300));
  expect(await zoomOf('/a')).toBe('1');
});
