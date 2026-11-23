// 카드 20261123-theme-mode: Chrome처럼 화면 모드(기기·밝게·어둡게), 기본은 기기
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launch, humanUi, evaluate, targets, waitFor, tempDir } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

type Mode = 'system' | 'light' | 'dark';
let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => { await app?.stop(); await server.close(); });

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const selected = () => ui<string>(`document.querySelector('#theme').value`);
/** 사람이 패널의 "모양" 선택을 바꾼 것처럼 */
const pick = (mode: Mode) => ui(`(() => { const s = document.querySelector('#theme'); s.value = ${JSON.stringify(mode)}; s.dispatchEvent(new Event('change')); })()`);
const theme = () => app.request({ type: 'theme' }, 'theme');
const settingsTheme = (profile: string) => (JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')) as { theme?: string }).theme;
const darkQuery = (targetId: string) => evaluate<boolean>(app, targetId, `matchMedia('(prefers-color-scheme: dark)').matches`);
const bg = (selector: string) => ui<string>(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`);

/** 사람 탭을 시험 서버 페이지로 옮기고 그 대상 id */
async function humanPage(): Promise<string> {
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}/a`)}; i.form.requestSubmit(); })()`);
  return (await waitFor(async () => (await targets(app)).find((t) => t.type === 'page' && t.url === `${server.base}/a`), '사람 탭이 A')).targetId;
}

test('T1: 처음엔 기기 모드이고, 패널·메뉴에서 고르면 바로 바뀌며 서로 같고, 다시 켜도 남는다', async () => {
  const profile = tempDir();
  app = await launch({ userDataDir: profile });
  expect(await selected()).toBe('system');
  expect(await theme()).toMatchObject({ source: 'system', menuChecked: 'system' });
  expect([...await ui<string[]>(`[...document.querySelectorAll('#theme option')].map(o => o.value + ':' + o.textContent)`)])
    .toEqual(['system:시스템 설정', 'light:라이트', 'dark:다크']);

  await pick('dark');
  await waitFor(async () => (await theme()).source === 'dark', '패널에서 어둡게');
  expect(await theme()).toMatchObject({ source: 'dark', dark: true, menuChecked: 'dark' });
  expect(settingsTheme(profile)).toBe('dark');

  // 메뉴 "보기 > 모양 > 밝게"를 누르면 패널 선택도 따라온다
  await app.request({ type: 'clickMenu', id: 'theme-light' }, 'done');
  await waitFor(async () => (await selected()) === 'light', '메뉴에서 밝게 → 패널도 밝게');
  expect(await theme()).toMatchObject({ source: 'light', dark: false, menuChecked: 'light' });
  expect(settingsTheme(profile)).toBe('light');

  await app.stop();
  app = await launch({ userDataDir: profile });
  expect(await selected()).toBe('light');
  expect(await theme()).toMatchObject({ source: 'light', menuChecked: 'light' });
});

test('H1: 테마 선택은 주소창 줄 오른쪽 끝의 버튼(30×30 이상, 지금 모드 아이콘)이고 패널에는 없다', async () => {
  app = await launch();
  const box = await ui<{ inNav: boolean; inPanel: boolean; last: boolean; w: number; h: number; selW: number; selH: number; title: string }>(`(() => {
    const b = document.querySelector('#theme-button'); const s = document.querySelector('#theme');
    const r = b.getBoundingClientRect(); const q = s.getBoundingClientRect(); const nav = document.querySelector('#nav');
    const items = [...nav.children].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none');
    return { inNav: nav.contains(s), inPanel: document.querySelector('#panel').contains(s), last: items[items.length - 1] === b,
      w: r.width, h: r.height, selW: q.width, selH: q.height, title: b.title };
  })()`);
  expect(box).toMatchObject({ inNav: true, inPanel: false, last: true, title: '테마' });
  expect(box.w).toBeGreaterThanOrEqual(30); expect(box.h).toBeGreaterThanOrEqual(30);
  // 누르는 자리 전체가 선택 목록(OS 목록이 열린다)
  expect(box.selW).toBeGreaterThanOrEqual(box.w - 1); expect(box.selH).toBeGreaterThanOrEqual(box.h - 1);
  const icon = () => ui<string>(`document.querySelector('#theme-button .icon').textContent`);
  expect(await icon()).toBe('◐');
  await pick('dark'); await waitFor(async () => (await icon()) === '☾', '다크 아이콘');
  await pick('light'); await waitFor(async () => (await icon()) === '☀', '라이트 아이콘');
});

test('T2: 어둡게면 사람 창이 Chrome 어두운 색이고 웹 페이지도 dark를 받는다. 밝게면 지금 밝은 모양 그대로다', async () => {
  app = await launch();
  const page = await humanPage();
  // 지금(바꾸기 전) 밝은 모양의 탭 막대 색: 원래 식 그대로
  const lightFrame = await ui<string>(`(() => { const p = document.createElement('div'); p.style.background = 'color-mix(in srgb, CanvasText 8%, Canvas)'; p.style.colorScheme = 'light'; document.body.append(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; })()`);

  await pick('dark');
  await waitFor(() => ui<boolean>(`matchMedia('(prefers-color-scheme: dark)').matches`), 'UI가 어두운 모드');
  expect(await bg('#tabbar')).toBe('rgb(32, 33, 36)');
  expect(await bg('#nav')).toBe('rgb(53, 54, 58)');
  expect(await ui<string>(`getComputedStyle(document.body).color`)).toBe('rgb(232, 234, 237)');
  await waitFor(() => darkQuery(page), '페이지가 dark를 받음');

  await pick('light');
  await waitFor(async () => !(await ui<boolean>(`matchMedia('(prefers-color-scheme: dark)').matches`)), 'UI가 밝은 모드');
  expect(await bg('#tabbar')).toBe(lightFrame);
  await waitFor(async () => !(await darkQuery(page)), '페이지가 light를 받음');
});

/**
 * 패널·머리의 글자와 실제 바탕의 대비(WCAG). 세션 카드(보통·보는 중)와 승인 줄을 패널에 같은 구조로 넣어 실제 CSS로 계산한다.
 * 바탕은 조상까지 반투명을 겹쳐 그린 색이다(1px 캔버스에 칠해 읽는다).
 */
const CONTRAST = `(() => {
  const panel = document.querySelector('#panel');
  const box = document.createElement('div');
  box.id = 'contrast-probe';
  box.innerHTML = '<ul id="sessions"><li class="session"><header><div class="name"><span class="label">이름</span></div><div class="buttons"><button class="view">보기</button><button class="stop">멈추기</button></div></header><ul><li class="tab-url">http://a</li></ul></li>'
    + '<li class="session viewing"><header><div class="buttons"><button class="view">보는 중</button></div></header></li></ul>'
    + '<ul id="approvals"><li class="approval"><div class="what">승인</div><div class="buttons"><button class="allow">허용</button><button class="deny">거부</button></div></li></ul>';
  panel.append(box);
  const viewing = document.querySelector('#viewing'); const wasHidden = viewing.hidden; viewing.hidden = false;
  const empty = document.querySelector('#sessions-empty'); const emptyHidden = empty.hidden; empty.hidden = false;
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgb = (layers) => { cx.clearRect(0, 0, 1, 1); for (const c of layers) { cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); } return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const backOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(getComputedStyle(e).backgroundColor); return rgb(chain); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (el) => { const b = backOf(el); const f = rgb(['rgb(' + b.join(',') + ')', getComputedStyle(el).color]); const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
  const pick = (s) => box.querySelector(s) ?? document.querySelector(s);
  const out = {};
  for (const s of ['.session .label', '.session .view', '.session .stop', '.tab-url', '.session.viewing .view', '.approval .what', '.approval .allow', '.approval .deny', '#viewing .label', '#viewing .back-to-own', '#sessions-empty']) out[s] = ratio(pick(s));
  box.remove(); viewing.hidden = wasHidden; empty.hidden = emptyHidden;
  return out;
})()`;

test('T3 (UI-F7): 두 모드 모두 패널·머리 글자와 바탕의 대비가 4.5:1 이상이다', async () => {
  app = await launch();
  for (const mode of ['light', 'dark'] as const) {
    await pick(mode);
    await waitFor(async () => (await ui<boolean>(`matchMedia('(prefers-color-scheme: dark)').matches`)) === (mode === 'dark'), `${mode} 모드`);
    const ratios = await ui<Record<string, number>>(CONTRAST);
    const low = Object.entries(ratios).filter(([, r]) => r < 4.5);
    expect(low, `${mode}: ${JSON.stringify(ratios)}`).toEqual([]);
  }
});
