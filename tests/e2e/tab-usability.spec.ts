// 카드 20261125-tab-usability: 사람 후기 "탭·글자·+ 버튼이 작다", "탭 기본 단축키가 없다"
import { test, expect } from '@playwright/test';
import { launch, humanUi, evaluate, targets, waitFor } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => { await app?.stop(); await server.close(); });

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const menu = (id: string) => app.request({ type: 'clickMenu', id }, 'done');
/** 탭 막대의 탭 제목과 활성 탭 번호(0부터) */
const strip = () => ui<{ titles: string[]; active: number; address: string }>(`(() => {
  const tabs = [...document.querySelectorAll('#tabs .tab')];
  return { titles: tabs.map((t) => t.querySelector('.title').textContent), active: tabs.findIndex((t) => t.classList.contains('active')), address: document.querySelector('#address').value };
})()`);
async function go(path: string) {
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}${path}`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => (await strip()).address === `${server.base}${path}`, `주소 ${path}`);
}

test('K1: 탭 32px 이상·글자 14px, + 버튼 28×28 이상, 주소창 14px, 페이지는 머리 바로 아래', async () => {
  app = await launch();
  const s = await ui<{ tabH: number; tabFont: string; plusW: number; plusH: number; addrFont: string; head: number; winH: number }>(`(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { tabH: r('#tabs .tab').height, tabFont: getComputedStyle(document.querySelector('#tabs .tab .title')).fontSize,
      plusW: r('#new-tab').width, plusH: r('#new-tab').height, addrFont: getComputedStyle(document.querySelector('#address')).fontSize,
      head: document.querySelector('#tabbar').offsetHeight + document.querySelector('#nav').offsetHeight, winH: innerHeight };
  })()`);
  expect(s.tabH).toBeGreaterThanOrEqual(32);
  expect(s.tabFont).toBe('14px');
  expect(s.plusW).toBeGreaterThanOrEqual(28);
  expect(s.plusH).toBeGreaterThanOrEqual(28);
  expect(s.addrFont).toBe('14px');
  // 페이지 영역 높이 = 창 높이 - 머리 높이(Electron 쪽 TOOLBAR_HEIGHT와 CSS가 어긋나면 틈이나 겹침이 생긴다)
  await go('/a');
  const page = (await targets(app)).find((t) => t.type === 'page' && t.url === `${server.base}/a`)!;
  expect(await evaluate<number>(app, page.targetId, 'innerHeight')).toBe(s.winH - s.head);
});

test('K2: ⌘T 새 탭(주소창에 커서), ⌘W 닫기, ⇧⌘T 다시 열기, ⇧⌘K 복제(바로 옆)', async () => {
  app = await launch();
  await go('/a');
  await menu('new-tab');
  await waitFor(async () => (await strip()).titles.length === 2, '새 탭');
  expect((await strip()).active).toBe(1);
  await waitFor(async () => ui<boolean>(`document.activeElement === document.querySelector('#address')`), '주소창에 커서');
  await go('/b');
  await menu('close-tab');
  await waitFor(async () => (await strip()).titles.length === 1, '닫힘');
  await waitFor(async () => (await strip()).address === `${server.base}/a`, '남은 탭(/a)');
  await menu('reopen-tab');
  await waitFor(async () => (await strip()).address === `${server.base}/b`, '닫은 탭 다시 열림');
  expect((await strip()).titles.length).toBe(2);
  // 첫 탭(/a)을 골라 복제하면 그 바로 옆(두 번째)에 같은 주소로 생긴다
  await menu('select-tab-1');
  await waitFor(async () => (await strip()).active === 0, '첫 탭');
  await menu('duplicate-tab');
  await waitFor(async () => (await strip()).titles.length === 3, '복제');
  // 복제한 탭은 새로 불러오므로 주소가 잠시 뒤 찬다
  await waitFor(async () => (await strip()).address === `${server.base}/a`, '복제한 탭이 /a');
  expect((await strip()).active).toBe(1);
});

test('K2: 다음·이전 탭(끝에서 돌아감), ⌘1·⌘9, ⌘L 주소창', async () => {
  app = await launch();
  await go('/a');
  await menu('new-tab'); await go('/b');
  await menu('new-tab'); await go('/widgets');
  await menu('next-tab');
  await waitFor(async () => (await strip()).active === 0, '마지막 다음은 첫 탭');
  await menu('prev-tab');
  await waitFor(async () => (await strip()).active === 2, '첫 탭 이전은 마지막 탭');
  await menu('select-tab-1');
  await waitFor(async () => (await strip()).active === 0, '⌘1');
  await menu('select-tab-last');
  await waitFor(async () => (await strip()).active === 2, '⌘9');
  await ui(`document.querySelector('#address').blur()`);
  await menu('focus-address');
  await waitFor(async () => ui<boolean>(`document.activeElement === document.querySelector('#address')`), '⌘L');
});
