import { test, expect, chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { launch, createSession, humanUi, evaluate, waitFor } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const panel = () => ui<{ empty: string | null; sessions: { id: string; urls: string[] }[] }>(`({
  empty: document.querySelector('#sessions-empty:not([hidden])')?.textContent ?? null,
  sessions: [...document.querySelectorAll('#sessions .session')].map(s => ({ id: s.dataset.sessionId, urls: [...s.querySelectorAll('.tab-url')].map(u => u.textContent) })),
})`);

/** 사람 창 UI의 화면을 저장한다(상태별 스크린샷, spec R11 확인 방법) */
async function screenshot(name: string) {
  const { targetId } = await humanUi(app);
  const { sessionId } = await app.rawCdp.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    const { data } = await app.rawCdp.send('Page.captureScreenshot', { format: 'png' }, sessionId as string);
    writeFileSync(test.info().outputPath(`${name}.png`), Buffer.from(data as string, 'base64'));
    await test.info().attach(name, { path: test.info().outputPath(`${name}.png`), contentType: 'image/png' });
  } finally { await app.rawCdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined); }
}

test('R11: 세션이 없으면 "에이전트 세션 없음" 문구 하나만 보인다', async () => {
  const p = await panel();
  expect(p.empty).toBe('에이전트 세션 없음');
  expect(p.sessions).toEqual([]);
  await screenshot('R11-1-빈-상태');
});

test('R11: 사람 창에 세션 목록과 각 세션의 탭 URL이 보이고, 멈추기가 R9처럼 동작한다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const browserA = await chromium.connectOverCDP(a.browserUrl);
  const browserB = await chromium.connectOverCDP(b.browserUrl);
  try {
    await browserA.contexts()[0].pages()[0].goto(`${server.base}/a`);
    const extra = await browserA.contexts()[0].newPage();
    await extra.goto(`${server.base}/b`);
    await browserB.contexts()[0].pages()[0].goto(`${server.base}/b?from=B`);
    await waitFor(async () => {
      const p = await panel();
      const sa = p.sessions.find((s) => s.id === a.id);
      const sb = p.sessions.find((s) => s.id === b.id);
      return p.empty === null && sa?.urls.join() === [`${server.base}/a`, `${server.base}/b`].join() && sb?.urls.join() === `${server.base}/b?from=B`;
    }, '패널에 A(탭 2개)와 B(탭 1개)의 URL');
    await screenshot('R11-2-세션-2개');

    // A의 멈추기 버튼
    await ui(`document.querySelector('#sessions .session[data-session-id="${a.id}"] .stop').click()`);
    await waitFor(async () => !browserA.isConnected(), 'A의 CDP 연결이 끊김');
    await waitFor(async () => !(await fetch(a.browserUrl + 'json/version').then(() => true, () => false)), 'A의 browserUrl 응답 없음');
    await waitFor(async () => (await panel()).sessions.map((s) => s.id).join() === b.id, '패널에 B만 남음');
    expect(browserB.isConnected()).toBe(true);
    const pb = browserB.contexts()[0].pages()[0];
    await pb.goto(`${server.base}/a`);
    await expect(pb).toHaveTitle('Page A');
    await screenshot('R11-3-A-멈춘-뒤');
  } finally {
    await browserB.close().catch(() => undefined);
  }
});
