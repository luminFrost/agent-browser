// 카드 20261122-approval-attention P4: 답이 없으면 정한 시간 뒤 거부로 끝난다
import { test, expect, chromium } from '@playwright/test';
import { launch, createSession, approvals, waitFor } from './helpers';
import { startTestServer } from '../fixtures/server';

test('P4: AGENT_BROWSER_APPROVAL_TIMEOUT_MS가 지나도록 답이 없으면 거부되고 서버는 받지 않는다', async () => {
  const server = await startTestServer();
  process.env.AGENT_BROWSER_APPROVAL_TIMEOUT_MS = '2000';
  const app = await launch();
  delete process.env.AGENT_BROWSER_APPROVAL_TIMEOUT_MS;
  try {
    const a = await createSession(app);
    const browser = await chromium.connectOverCDP(a.browserUrl);
    const page = browser.contexts()[0].pages()[0];
    await page.goto(`${server.base}/form`);
    await page.evaluate(() => setTimeout(() => (document.querySelector('#submit') as HTMLButtonElement).click(), 0));
    await waitFor(async () => (await approvals(app)).length === 1, '승인 요청');
    await waitFor(async () => (await approvals(app)).length === 0, '시간이 지나 거부됨', 6000);
    await new Promise((r) => setTimeout(r, 500));
    expect(server.hits.filter((h) => h === 'POST /submit')).toEqual([]);
    expect(await app.request({ type: 'attention' }, 'attention')).toMatchObject({ badge: 0 });
    await browser.close();
  } finally { await app.stop(); await server.close(); }
});
