import { test, expect, chromium } from '@playwright/test';
import { launch, createSession } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const list = async (browserUrl: string) => (await (await fetch(browserUrl + 'json/list')).json()) as { url: string }[];

test('R8: A와 B가 동시에 다른 주소로 navigate해도 서로 영향이 없다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const [ba, bb] = await Promise.all([chromium.connectOverCDP(a.browserUrl), chromium.connectOverCDP(b.browserUrl)]);
  try {
    const pa = ba.contexts()[0].pages()[0];
    const pb = bb.contexts()[0].pages()[0];
    for (let round = 0; round < 5; round++) {
      const [ua, ub] = round % 2 ? [`${server.base}/a?r=${round}`, `${server.base}/b?r=${round}`] : [`${server.base}/b?r=${round}`, `${server.base}/a?r=${round}`];
      await Promise.all([pa.goto(ua), pb.goto(ub)]);
      expect(pa.url()).toBe(ua);
      expect(pb.url()).toBe(ub);
      expect((await list(a.browserUrl)).map((t) => t.url)).toEqual([ua]);
      expect((await list(b.browserUrl)).map((t) => t.url)).toEqual([ub]);
    }
  } finally {
    await Promise.all([ba.close().catch(() => undefined), bb.close().catch(() => undefined)]);
  }
});

test('R8: A가 느린 페이지를 기다리는 동안 B는 막히지 않는다', async () => {
  const [a, b] = [await createSession(app), await createSession(app)];
  const [ba, bb] = await Promise.all([chromium.connectOverCDP(a.browserUrl), chromium.connectOverCDP(b.browserUrl)]);
  try {
    const slow = ba.contexts()[0].pages()[0].goto(`${server.base}/slow?ms=3000`);
    const started = Date.now();
    const pb = bb.contexts()[0].pages()[0];
    await pb.goto(`${server.base}/a`);
    await pb.click('#to-b');
    await expect(pb).toHaveTitle('Page B');
    expect(Date.now() - started).toBeLessThan(2500); // A의 3초를 기다리지 않았다
    await slow;
  } finally {
    await Promise.all([ba.close().catch(() => undefined), bb.close().catch(() => undefined)]);
  }
});
