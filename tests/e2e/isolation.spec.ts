import { test, expect } from '@playwright/test';
import { launch, createSession, CdpClient, humanUi, evaluate, targets, waitFor, type SessionInfo } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const list = async (s: SessionInfo) => (await (await fetch(s.browserUrl + 'json/list')).json()) as { id: string; url: string }[];
const browserWs = async (s: SessionInfo) => CdpClient.connect(((await (await fetch(s.browserUrl + 'json/version')).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
const humanGo = async (url: string) => evaluate(app, (await humanUi(app)).targetId, `(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(url)}; i.form.requestSubmit(); })()`);
const humanNewTab = async () => evaluate(app, (await humanUi(app)).targetId, `document.querySelector('#new-tab').click()`);
/** 사람 창의 탭과 UI, 다른 세션 창의 UI 등 A가 볼 수 없어야 하는 대상 전부 */
const notMine = async (mine: string[]) => (await targets(app)).filter((t) => !mine.includes(t.targetId)).map((t) => t.targetId);

test('R5: A의 /json/list와 Target.getTargets에는 A의 탭만 나온다', async () => {
  await humanGo(`${server.base}/a`);
  const a = await createSession(app);
  const b = await createSession(app);
  const aTabs = (await list(a)).map((t) => t.id);
  expect(aTabs).toHaveLength(1);
  expect(aTabs).not.toContain((await list(b))[0].id);
  const client = await browserWs(a);
  try {
    const { targetInfos } = await client.send('Target.getTargets');
    expect((targetInfos as { targetId: string }[]).map((t) => t.targetId)).toEqual(aTabs);
    expect((await notMine(aTabs)).length).toBeGreaterThanOrEqual(4); // 사람 UI·사람 탭·B의 UI·B의 탭·A의 UI
  } finally { client.close(); }
});

test('R5: setDiscoverTargets 이벤트에 다른 세션·사람 창의 탭이 나오지 않는다', async () => {
  const a = await createSession(app);
  const b = await createSession(app);
  const ca = await browserWs(a);
  const cb = await browserWs(b);
  try {
    await ca.send('Target.setDiscoverTargets', { discover: true });
    await waitFor(async () => ca.events.some((e) => e.method === 'Target.targetCreated'), 'A의 기존 탭 targetCreated');
    const created = () => ca.events.filter((e) => e.method === 'Target.targetCreated').map((e) => (e.params.targetInfo as { targetId: string }).targetId);
    expect(created()).toEqual((await list(a)).map((t) => t.id));

    await cb.send('Target.createTarget', { url: `${server.base}/b` }); // B의 새 탭
    await humanNewTab(); // 사람 창의 새 탭
    await humanGo(`${server.base}/a`);
    const { targetId } = await ca.send('Target.createTarget', { url: 'about:blank' }); // A의 새 탭
    await waitFor(async () => created().includes(targetId as string), 'A의 새 탭 targetCreated');
    await new Promise((r) => setTimeout(r, 500));
    const mine = (await list(a)).map((t) => t.id);
    const seen = ca.events.filter((e) => e.method.startsWith('Target.')).map((e) => (e.params.targetInfo as { targetId?: string } | undefined)?.targetId ?? (e.params.targetId as string));
    for (const id of seen) expect(mine, `A가 본 대상 ${id}`).toContain(id);
  } finally { ca.close(); cb.close(); }
});

test('R6: 남의 탭(B의 탭, 사람 창 탭, 창 UI)으로 attachToTarget → 오류', async () => {
  await humanGo(`${server.base}/a`);
  const a = await createSession(app);
  const b = await createSession(app);
  const client = await browserWs(a);
  try {
    const others = await notMine((await list(a)).map((t) => t.id));
    expect(others).toContain((await list(b))[0].id);
    for (const targetId of others) {
      const r = await client.call('Target.attachToTarget', { targetId, flatten: true });
      expect(r.error?.message, `attach ${targetId}`).toMatch(/agent-browser/);
    }
    const r2 = await client.call('Target.attachToBrowserTarget');
    expect(r2.error?.message).toMatch(/agent-browser/);
    await expect(CdpClient.connect(`${a.browserUrl.replace('http', 'ws')}devtools/page/${(await list(b))[0].id}`)).rejects.toThrow();
  } finally { client.close(); }
});

test('R6: 페이지 세션에서도 Target.getTargets·attachToTarget으로 범위를 벗어날 수 없다', async () => {
  const a = await createSession(app);
  const b = await createSession(app);
  const client = await browserWs(a);
  try {
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: (await list(a))[0].id, flatten: true });
    expect((await client.call('Target.getTargets', {}, sessionId as string)).error?.message).toMatch(/agent-browser/);
    expect((await client.call('Target.attachToTarget', { targetId: (await list(b))[0].id, flatten: true }, sessionId as string)).error?.message).toMatch(/agent-browser/);
    expect((await client.call('Runtime.evaluate', { expression: '1' }, 'not-my-session')).error?.message).toMatch(/agent-browser/);
  } finally { client.close(); }
});

test('R6: A의 Target.createTarget → A의 창에 탭이 생기고, 새 창이나 사람 창 탭은 생기지 않는다', async () => {
  const a = await createSession(app);
  const before = await targets(app);
  const windowsBefore = (await app.request({ type: 'listWindows' }, 'windows')).windows;
  const client = await browserWs(a);
  try {
    const { targetId } = await client.send('Target.createTarget', { url: `${server.base}/b` });
    expect((await list(a)).map((t) => t.id)).toContain(targetId);
    await waitFor(async () => (await list(a)).find((t) => t.id === targetId)?.url === `${server.base}/b`, '새 탭이 url로 이동');
    expect((await app.request({ type: 'listWindows' }, 'windows')).windows).toEqual(windowsBefore);
    expect((await targets(app)).length).toBe(before.length + 1);
    const humanTabs = await evaluate<number>(app, (await humanUi(app)).targetId, `document.querySelectorAll('#tabs .tab').length`);
    expect(humanTabs).toBe(1);
  } finally { client.close(); }
});

test('R6: A의 탭에서 연 팝업(window.open) → A의 창에 탭으로 생기고 opener가 이어진다', async () => {
  const a = await createSession(app);
  const windowsBefore = (await app.request({ type: 'listWindows' }, 'windows')).windows;
  const client = await browserWs(a);
  try {
    const [tab] = await list(a);
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
    await client.send('Page.navigate', { url: `${server.base}/a` }, sessionId as string);
    await waitFor(async () => (await list(a))[0].url === `${server.base}/a`, 'A 탭 이동');
    await client.send('Runtime.evaluate', { expression: `window.popup = window.open(${JSON.stringify(server.base + '/b')}); 1`, userGesture: true }, sessionId as string);
    const popup = await waitFor(async () => (await list(a)).find((t) => t.url === `${server.base}/b`), 'A의 목록에 팝업');
    expect(popup).toBeTruthy();
    expect((await app.request({ type: 'listWindows' }, 'windows')).windows).toEqual(windowsBefore);
    const opener = await client.send('Runtime.evaluate', { expression: '!!window.popup && !window.popup.closed', returnByValue: true }, sessionId as string);
    expect((opener.result as { value: boolean }).value).toBe(true);
  } finally { client.close(); }
});

test('setAutoAttach(waitForDebuggerOnStart)를 해도 사람 창의 새 탭은 멈추지 않고, A에게 붙지 않는다', async () => {
  const a = await createSession(app);
  const client = await browserWs(a);
  try {
    await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await waitFor(async () => client.events.some((e) => e.method === 'Target.attachedToTarget'), 'A의 기존 탭 자동 붙기');
    expect(client.events.filter((e) => e.method === 'Target.attachedToTarget').map((e) => (e.params.targetInfo as { targetId: string }).targetId)).toEqual((await list(a)).map((t) => t.id));

    await humanNewTab();
    await humanGo(`${server.base}/b`);
    await waitFor(async () => (await targets(app)).some((t) => t.url === `${server.base}/b` && t.title === 'Page B'), '사람 창 새 탭이 멈추지 않고 로드됨');
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    await waitFor(async () => client.events.some((e) => e.method === 'Target.attachedToTarget' && (e.params.targetInfo as { targetId: string }).targetId === targetId), 'A의 새 탭 자동 붙기');
    const mine = (await list(a)).map((t) => t.id);
    for (const e of client.events.filter((x) => x.method === 'Target.attachedToTarget')) expect(mine).toContain((e.params.targetInfo as { targetId: string }).targetId);
  } finally { client.close(); }
});

test('setAutoAttach의 filter가 page를 빼면 page에는 직접 붙지 않고 자기 tab 대상에만 붙는다 (chrome-devtools-mcp 방식)', async () => {
  const a = await createSession(app);
  const client = await browserWs(a);
  try {
    const { targetInfos } = await client.send('Target.getTargets', { filter: [{}] });
    const ownTabs = (targetInfos as { targetId: string; type: string }[]).filter((t) => t.type === 'tab').map((t) => t.targetId);
    expect(ownTabs).toHaveLength(1);
    await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'page', exclude: true }, {}] });
    await waitFor(async () => client.events.some((e) => e.method === 'Target.attachedToTarget'), '자기 tab에 붙기');
    const attached = client.events.filter((e) => e.method === 'Target.attachedToTarget').map((e) => e.params.targetInfo as { targetId: string; type: string });
    expect(attached.map((t) => t.type)).toEqual(['tab']);
    expect(attached.map((t) => t.targetId)).toEqual(ownTabs);
  } finally { client.close(); }
});

test('closeTarget: 자기 탭은 닫히고, 남의 탭은 오류', async () => {
  const a = await createSession(app);
  const b = await createSession(app);
  const client = await browserWs(a);
  try {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    expect((await client.send('Target.closeTarget', { targetId })).success).toBe(true);
    await waitFor(async () => !(await list(a)).some((t) => t.id === targetId), '닫힌 탭이 목록에서 빠짐');
    expect((await client.call('Target.closeTarget', { targetId: (await list(b))[0].id })).error?.message).toMatch(/agent-browser/);
    expect(await list(b)).toHaveLength(1);
  } finally { client.close(); }
});

test('팝업이 스스로 닫히면(window.close) 목록에서 빠지고 창은 계속 동작한다', async () => {
  const a = await createSession(app);
  const client = await browserWs(a);
  try {
    const [tab] = await list(a);
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
    await client.send('Page.navigate', { url: `${server.base}/a` }, sessionId as string);
    await waitFor(async () => (await list(a))[0].url === `${server.base}/a`, 'A 탭 이동');
    await client.send('Runtime.evaluate', { expression: `window.popup = window.open(${JSON.stringify(server.base + '/b')}); 1`, userGesture: true }, sessionId as string);
    await waitFor(async () => (await list(a)).length === 2, '팝업 생김');
    await client.send('Runtime.evaluate', { expression: 'window.popup.close(); 1' }, sessionId as string);
    await waitFor(async () => (await list(a)).length === 1, '팝업이 목록에서 빠짐');
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' }); // 창이 아직 정상
    expect((await list(a)).map((t) => t.id)).toContain(targetId);
  } finally { client.close(); }
});
