// 카드 20261122-human-ui-guard: 사람 창 UI는 다른 페이지가 되지 않고, UI 파일이 아닌 곳의 명령은 받지 않는다
import { test, expect } from '@playwright/test';
import { launch, createSession, humanUi, evaluate, sessionIds, targets, waitFor } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let server: TestServer;
let app: RunningApp;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

/** UI 대상의 지금 주소(바깥 페이지가 되어도 같은 대상 id로 찾는다) */
const urlOf = async (targetId: string) => (await targets(app)).find((t) => t.targetId === targetId)?.url ?? '';

test('G1: UI 페이지 스스로의 이동(스크립트, 끌어다 놓기와 같은 경로)은 하지 않는다', async () => {
  const ui = await humanUi(app);
  const before = ui.url;
  expect(before.startsWith('file:')).toBe(true);
  await evaluate(app, ui.targetId, `location.href = ${JSON.stringify(`${server.base}/a`)}`);
  await new Promise((r) => setTimeout(r, 800));
  expect(await urlOf(ui.targetId)).toBe(before);
  expect(server.hits.some((h) => h.includes('/a'))).toBe(false);
});

test('G2: UI에서 새 창이 열리지 않는다', async () => {
  const ui = await humanUi(app);
  await evaluate(app, ui.targetId, `void window.open(${JSON.stringify(`${server.base}/b`)})`);
  await new Promise((r) => setTimeout(r, 800));
  expect((await app.request({ type: 'listWindows' }, 'windows')).windows).toEqual([{ kind: 'human' }]);
  expect((await targets(app)).some((t) => t.url === `${server.base}/b`)).toBe(false);
  expect(server.hits.some((h) => h.endsWith(' /b'))).toBe(false);
});

test('G3·G4: UI가 다른 수단으로 바깥 페이지가 되어도 그 페이지는 humanApi가 없고, 보낸 명령도 받지 않는다', async () => {
  const a = await createSession(app);
  const ui = await humanUi(app);
  // 브라우저 쪽에서 이동시킨다(will-navigate를 거치지 않는 경로). 실제로는 막힌 이동의 빈틈을 흉내 낸다
  const { sessionId } = await app.rawCdp.send('Target.attachToTarget', { targetId: ui.targetId, flatten: true });
  await app.rawCdp.send('Page.navigate', { url: `${server.base}/a` }, sessionId as string);
  await app.rawCdp.send('Target.detachFromTarget', { sessionId });
  await waitFor(async () => (await urlOf(ui.targetId)).startsWith(server.base), 'UI가 바깥 페이지');
  expect(await evaluate<string>(app, ui.targetId, 'typeof window.humanApi')).toBe('undefined');
  // main 쪽 확인(보낸 프레임 주소)은 단위 시험(humanUiGuard.test.ts)이 본다
  expect(await sessionIds(app)).toEqual([a.id]);
});
