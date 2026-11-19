// spec-embedded-sessions: 에이전트 세션의 탭을 사람 창 안에서 본다(E2·E3·E4·E7). E1은 control.spec, E6은 termination.spec.
import { test, expect, chromium, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { launch, createSession, humanUi, evaluate, shown, waitFor, CdpClient, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
const browsers: Browser[] = [];
// 이 파일은 창에 보이는 것(보는 세션, 보이지 않는 세션이 계속 그려지는지)이 대상이라 실행 모드와 관계없이 창을 띄운다.
// 숨긴 창은 OS에 따라 아예 그리지 않아 E4를 확인할 수 없다(ADR-0009).
test.beforeEach(async () => { server = await startTestServer(); app = await launch({ hidden: false }); });
test.afterEach(async () => {
  for (const b of browsers.splice(0)) await b.close().catch(() => undefined);
  await app.stop();
  await server.close();
});

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const click = (selector: string) => ui(`document.querySelector(${JSON.stringify(selector)}).click()`);
const toolbar = () => ui<{ viewing: string | null; address: string; readOnly: boolean; back: boolean; forward: boolean; reload: boolean; newTab: boolean; tabs: string[]; emptyView: string | null }>(`(() => {
  const $ = (s) => document.querySelector(s);
  return {
    viewing: $('#viewing:not([hidden]) .label')?.textContent ?? null,
    address: $('#address').value,
    readOnly: $('#address').readOnly,
    back: $('#back').disabled, forward: $('#forward').disabled, reload: $('#reload').disabled, newTab: $('#new-tab').disabled,
    tabs: [...document.querySelectorAll('#tabs .tab')].map((t) => t.title),
    emptyView: $('#view-empty:not([hidden])')?.textContent ?? null,
  };
})()`);
const view = async (s: SessionInfo) => {
  await waitFor(async () => ui<boolean>(`!!document.querySelector('#sessions .session[data-session-id="${s.id}"] .view')`), `패널에 세션 ${s.id}`);
  await click(`#sessions .session[data-session-id="${s.id}"] .view`);
};
const connect = async (s: SessionInfo) => { const b = await chromium.connectOverCDP(s.browserUrl); browsers.push(b); return b; };
const firstTargetId = async (s: SessionInfo) => ((await (await fetch(s.browserUrl + 'json/list')).json()) as { id: string }[])[0].id;

test('E2: 패널에서 세션 A를 누르면 왼쪽에 A의 탭이 보이고, A가 이동하면 따라 바뀌며, "내 탭으로"로 돌아온다', async () => {
  const a = await createSession(app);
  const page = (await connect(a)).contexts()[0].pages()[0];
  await page.goto(`${server.base}/a`);
  expect((await shown(app)).view).toBe('human'); // 세션이 생겨도 화면은 바뀌지 않는다

  await view(a);
  await waitFor(async () => (await shown(app)).sessionId === a.id, '왼쪽 화면에 A');
  expect((await shown(app)).targetId).toBe(await firstTargetId(a));
  await waitFor(async () => {
    const t = await toolbar();
    return t.viewing === `세션 ${a.id} 보는 중` && t.address === `${server.base}/a` && t.readOnly && t.tabs.join() === `${server.base}/a`;
  }, '머리·주소창·탭 막대가 A의 것');

  await page.goto(`${server.base}/b`);
  await waitFor(async () => (await toolbar()).address === `${server.base}/b`, 'A가 이동하면 주소창이 따라 바뀜');

  await click('#viewing .back-to-own');
  await waitFor(async () => (await shown(app)).view === 'human', '내 탭으로 돌아옴');
  const t = await toolbar();
  expect(t.viewing).toBeNull();
  expect(t.readOnly).toBe(false);
});

test('E3: A를 보는 중에는 주소창·이동 버튼이 잠기고, 입력해도 A의 탭은 움직이지 않으며, 내 탭은 그대로다', async () => {
  // 내 탭을 A → B로 옮겨 둔다(뒤로 갈 기록이 생긴다)
  for (const path of ['/a', '/b']) {
    await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}${path}`)}; i.form.requestSubmit(); })()`);
    await waitFor(async () => (await toolbar()).address === `${server.base}${path}`, `내 탭이 ${path}`);
  }
  const a = await createSession(app);
  const page = (await connect(a)).contexts()[0].pages()[0];
  await page.goto(`${server.base}/a`);
  await view(a);
  await waitFor(async () => (await toolbar()).address === `${server.base}/a`, 'A를 보는 중');
  const t = await toolbar();
  expect([t.readOnly, t.back, t.forward, t.reload, t.newTab]).toEqual([true, true, true, true, true]);

  // UI 잠금을 우회해 명령을 보내도(main 쪽 방어) A의 탭은 움직이지 않는다
  const hitsBefore = server.hits.length;
  await ui(`(() => { const i = document.querySelector('#address'); i.readOnly = false; i.value = ${JSON.stringify(`${server.base}/download`)}; i.form.requestSubmit(); })()`);
  await ui(`window.humanApi.command({ cmd: 'newTab' })`);
  // 렌더러를 거치지 않고 main에 바로 보낸 명령도 무시된다
  const tabId = await ui<number>(`Number(document.querySelector('#tabs .tab').dataset.id)`);
  await ui(`(() => { const c = window.humanApi.command;
    c({ cmd: 'navigate', input: ${JSON.stringify(`${server.base}/download`)} }); c({ cmd: 'back' }); c({ cmd: 'forward' }); c({ cmd: 'reload' }); c({ cmd: 'close', id: ${tabId} }); })()`);
  await new Promise((r) => setTimeout(r, 500));
  expect(page.url()).toBe(`${server.base}/a`);
  expect(page.isClosed()).toBe(false);
  expect(server.hits.length).toBe(hitsBefore);

  await click('#viewing .back-to-own');
  await waitFor(async () => (await shown(app)).view === 'human', '내 탭으로 돌아옴');
  const own = await toolbar();
  expect(own.address).toBe(`${server.base}/b`);
  expect(own.tabs).toHaveLength(1); // 새 탭 명령이 사람 탭에 들어가지도 않았다
  expect(own.back).toBe(false); // 기록(새 탭 → B)도 그대로라 뒤로 갈 수 있다
});

test('E3: A를 보는 중 탭 막대에서 다른 탭을 고르면 보는 탭만 바뀌고, A의 활성 탭은 그대로다', async () => {
  const a = await createSession(app);
  const context = (await connect(a)).contexts()[0];
  await context.pages()[0].goto(`${server.base}/b`);
  const active = await context.newPage(); // 새 탭이 A의 활성 탭이 된다
  await active.goto(`${server.base}/a`);
  await view(a);
  await waitFor(async () => (await toolbar()).address === `${server.base}/a`, '활성 탭(Page A)을 보는 중');
  const panelUrl = () => ui<string | null>(`document.querySelector('#sessions .session[data-session-id="${a.id}"] .tab-url.active')?.textContent ?? null`);
  expect(await panelUrl()).toBe(`${server.base}/a`);

  await click(`#tabs .tab[data-title="Page B"]`);
  await waitFor(async () => (await toolbar()).address === `${server.base}/b`, '보는 탭이 Page B로 바뀜');
  const targets = (await (await fetch(a.browserUrl + 'json/list')).json()) as { id: string; url: string }[];
  expect((await shown(app)).targetId).toBe(targets.find((t) => t.url === `${server.base}/b`)?.id);
  expect(await panelUrl()).toBe(`${server.base}/a`); // 에이전트의 활성 탭은 그대로
  // 화면에서 비켜난 활성 탭도 계속 조작된다(E4)
  await active.locator('#to-b').click();
  await expect(active).toHaveURL(`${server.base}/b`);
  expect((await active.screenshot()).length).toBeGreaterThan(1000);
});

test('E6: 주소창에 포커스를 둔 채 보던 세션이 끝나도, 주소창은 내 탭 주소로 돌아오고 다시 편집할 수 있다', async () => {
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}/b`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => (await toolbar()).address === `${server.base}/b`, '내 탭이 B');
  const a = await createSession(app);
  await (await connect(a)).contexts()[0].pages()[0].goto(`${server.base}/a`);
  await view(a);
  await waitFor(async () => (await toolbar()).address === `${server.base}/a`, 'A를 보는 중');
  await ui(`document.querySelector('#address').focus()`);
  expect(await ui<boolean>(`document.activeElement === document.querySelector('#address')`)).toBe(true);
  const { port, token } = JSON.parse(readFileSync(app.controlFile, 'utf8')) as { port: number; token: string };
  expect((await fetch(`http://127.0.0.1:${port}/sessions/${a.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })).status).toBe(204);
  await waitFor(async () => (await shown(app)).view === 'human', '내 탭으로 돌아옴');
  await waitFor(async () => { const t = await toolbar(); return !t.readOnly && t.address === `${server.base}/b` && t.viewing === null; }, '주소창이 내 탭(B) 주소');
});

test('E4: 사람이 내 탭이나 B를 보는 동안에도 A의 CDP 조작(이동·클릭·스크린샷)이 된다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const pageA = (await connect(a)).contexts()[0].pages()[0];
  const check = async () => {
    await pageA.goto(`${server.base}/a`);
    await expect(pageA).toHaveTitle('Page A');
    await pageA.locator('a').first().click();
    await expect(pageA).not.toHaveURL(`${server.base}/a`);
    const png = await pageA.screenshot();
    expect(png.length).toBeGreaterThan(1000);
    const cdp = await CdpClient.connect(`ws://${new URL(a.browserUrl).host}${new URL(a.browserUrl).pathname}devtools/page/${await firstTargetId(a)}`);
    try {
      for (let i = 0; i < 3; i++) { // 가려진 화면은 첫 장만 찍히고 다음 장에서 멈출 수 있어 여러 장 찍는다
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        expect(String(data).length).toBeGreaterThan(1000);
      }
    } finally { cdp.close(); }
  };
  expect((await shown(app)).view).toBe('human');
  // 보이지 않는 세션은 창 안에 1px만 드러난다(창 오른쪽 아래 끝, 탭의 왼쪽 위 점). 띠로 드러나면 패널 클릭이 에이전트 탭에 들어간다
  const { exposed, content } = await shown(app);
  expect(exposed).toHaveLength(2);
  for (const r of exposed) expect([r.width, r.height, r.y]).toEqual([1, 1, content.height - 1]);
  expect(exposed.map((r) => r.x).sort()).toEqual([content.width - 2, content.width - 1]);
  await check(); // 내 탭을 보는 동안
  // 에이전트가 화면 크기를 줄여도(emulate·setViewportSize) 그려진다. 드러난 점이 페이지 왼쪽 위라 줄인 화면 안에 있다
  await pageA.setViewportSize({ width: 600, height: 400 });
  await check();
  await view(b);
  await waitFor(async () => (await shown(app)).sessionId === b.id, '왼쪽 화면에 B');
  await check(); // B를 보는 동안
});

test('E7: 세션이 없으면 "에이전트 세션 없음"만 있고, 보는 세션의 탭이 모두 닫히면 빈 화면 문구가 보인다', async () => {
  expect(await ui<string | null>(`document.querySelector('#sessions-empty:not([hidden])')?.textContent ?? null`)).toBe('에이전트 세션 없음');
  expect((await toolbar()).emptyView).toBeNull();
  const a = await createSession(app);
  await view(a);
  await waitFor(async () => (await shown(app)).sessionId === a.id, '왼쪽 화면에 A');
  const cdp = await CdpClient.connect(((await (await fetch(a.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
  try {
    await cdp.send('Target.closeTarget', { targetId: await firstTargetId(a) });
    await waitFor(async () => (await toolbar()).emptyView === '이 세션에 열린 탭이 없습니다', '빈 화면 문구');
    const s = await shown(app);
    expect([s.view, s.sessionId, s.targetId ?? null]).toEqual(['session', a.id, null]);
  } finally { cdp.close(); }
});
