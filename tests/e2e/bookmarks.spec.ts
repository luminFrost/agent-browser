// 카드 20261125-bookmarks: 사람 후기 4번 "북마크 or 즐겨 찾기 없음"
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launch, humanUi, evaluate, targets, waitFor, tempDir } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp | undefined;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => { await app?.stop(); app = undefined; await server.close(); });

const ui = async <T>(expr: string) => evaluate<T>(app!, (await humanUi(app!)).targetId, expr);
const menu = (id: string) => app!.request({ type: 'clickMenu', id }, 'done');
const bar = () => ui<{ items: { title: string; folder: boolean }[]; hint: boolean; star: string }>(`(() => ({
  items: [...document.querySelectorAll('#bookmarks .bookmark')].map((b) => ({ title: b.textContent.trim(), folder: b.classList.contains('folder') })),
  hint: !document.querySelector('#bookmarks-empty').hidden,
  star: document.querySelector('#bookmark-star').textContent.trim(),
}))()`);
const tabs = () => ui<{ count: number; address: string }>(`({ count: document.querySelectorAll('#tabs .tab').length, address: document.querySelector('#address').value })`);
async function go(path: string) {
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}${path}`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => (await tabs()).address === `${server.base}${path}`, `주소 ${path}`);
  // 제목이 들어올 때까지(북마크 이름이 된다)
  await waitFor(async () => ui<boolean>(`[...document.querySelectorAll('#tabs .tab.active .title')].some((t) => t.textContent.startsWith('Page'))`), `${path} 제목`);
}
const saved_ = (profile: string) => JSON.parse(readFileSync(join(profile, 'bookmarks.json'), 'utf8')) as { url?: string }[];

test('B1: 별표·⌘D로 북마크하고 지우며, 다시 켜도 남는다', async () => {
  const profile = tempDir();
  app = await launch({ userDataDir: profile });
  expect(await bar()).toEqual({ items: [], hint: true, star: '☆' });
  await go('/a');
  await ui(`document.querySelector('#bookmark-star').click()`);
  await waitFor(async () => (await bar()).star === '★', '별표 채움');
  expect(await bar()).toEqual({ items: [{ title: 'Page A', folder: false }], hint: false, star: '★' });
  expect(saved_(profile).map((b) => b.url)).toEqual([`${server.base}/a`]);
  // 같은 동작(⌘D)이 지운다
  await menu('toggle-bookmark');
  await waitFor(async () => (await bar()).star === '☆', '별표 비움');
  expect((await bar()).items).toEqual([]);
  await menu('toggle-bookmark');
  await waitFor(async () => (await bar()).items.length === 1, '다시 북마크');
  await app.stop();
  app = await launch({ userDataDir: profile });
  await waitFor(async () => (await bar()).items.length === 1, '다시 켜도 남음');
  await go('/a');
  await waitFor(async () => (await bar()).star === '★', '이미 북마크한 페이지는 ★');
});

test('B2: 누르면 지금 탭, ⌘클릭은 새 탭, 메뉴 항목도 연다. 페이지는 막대 바로 아래', async () => {
  app = await launch();
  await go('/b');
  await menu('toggle-bookmark');
  await waitFor(async () => (await bar()).items.length === 1, '북마크 B');
  await go('/a');
  await ui(`document.querySelector('#bookmarks .bookmark').click()`);
  await waitFor(async () => (await tabs()).address === `${server.base}/b`, '지금 탭이 B');
  expect((await tabs()).count).toBe(1);
  await ui(`document.querySelector('#bookmarks .bookmark').dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true, ctrlKey: true }))`);
  await waitFor(async () => (await tabs()).count === 2, '⌘클릭은 새 탭');
  await waitFor(async () => (await tabs()).address === `${server.base}/b`, '새 탭이 B');
  // 메뉴 "북마크" 아래 항목
  await go('/a');
  const id = await ui<string>(`document.querySelector('#bookmarks .bookmark').dataset.id`);
  await menu(`bookmark-${id}`);
  await waitFor(async () => (await tabs()).address === `${server.base}/b`, '메뉴로 연 B');
  // 머리(탭 막대·주소창 줄·북마크 막대) 바로 아래에서 페이지가 시작한다
  const s = await ui<{ head: number; winH: number }>(`({ head: ['#tabbar', '#nav', '#bookmarks'].reduce((h, s) => h + document.querySelector(s).offsetHeight, 0), winH: innerHeight })`);
  const page = (await targets(app)).find((t) => t.type === 'page' && t.url === `${server.base}/b`)!;
  expect(await evaluate<number>(app, page.targetId, 'innerHeight')).toBe(s.winH - s.head);
});

test('B3: Chrome 북마크 가져오기는 없다(11-25 사람 결정: 북마크는 이 앱에서 등록한다)', async () => {
  app = await launch();
  const r = await app.request({ type: 'clickMenu', id: 'import-chrome-bookmarks' }, 'done').then(() => 'found', (e: Error) => e.message);
  expect(r).toContain('없는 메뉴 항목');
  expect(await ui<string>(`document.querySelector('#bookmarks-empty').textContent`)).not.toContain('Chrome');
});
