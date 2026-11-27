// 카드 20261125-bookmarks: 사람 후기 4번 "북마크 or 즐겨 찾기 없음"
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launch, humanUi, evaluate, targets, waitFor, tempDir } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp | undefined;
let server: TestServer;
const savedEnv = { ...process.env };
test.beforeEach(async () => { server = await startTestServer(); });
test.afterEach(async () => { await app?.stop(); app = undefined; process.env = { ...savedEnv }; await server.close(); });

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

// 카드 20261125-bookmark-file: 사람이 고른 북마크 HTML 파일로 가져오기·내보내기. 시험은 파일 고르기 창 대신 AGENT_BROWSER_BOOKMARK_FILE을 쓴다
const toast = () => ui<string>(`document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent`);

test('F1: 북마크 HTML 파일을 폴더째 가져오고, 다시 가져와도 겹치지 않으며, 읽을 수 없으면 알린다', async () => {
  const file = join(tempDir(), 'bookmarks.html');
  writeFileSync(file, `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">북마크바</H3>
    <DL><p>
        <DT><A HREF="${server.base}/a">A</A>
        <DT><A HREF="javascript:alert(1)">JS</A>
        <DT><H3>일</H3>
        <DL><p>
            <DT><A HREF="${server.base}/b">B</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="${server.base}/widgets">W</A>
</DL><p>
`);
  process.env.AGENT_BROWSER_BOOKMARK_FILE = file;
  app = await launch();
  await menu('import-bookmarks-file');
  await waitFor(async () => (await toast()) === '3개를 가져왔습니다', '가져온 개수');
  expect((await bar()).items).toEqual([{ title: 'A', folder: false }, { title: '일', folder: true }, { title: 'W', folder: false }]);
  await waitFor(async () => (await toast()) === '', '알림 사라짐', 15_000);
  await menu('import-bookmarks-file');
  await waitFor(async () => (await toast()) === '0개를 가져왔습니다', '두 번째는 0개');
  expect((await bar()).items).toHaveLength(3);
  process.env.AGENT_BROWSER_BOOKMARK_FILE = join(tempDir(), 'none.html');
  await app.stop();
  app = await launch();
  await menu('import-bookmarks-file');
  await waitFor(async () => (await toast()) === '북마크 파일을 읽지 못했습니다', '읽을 수 없음');
});

test('F2: 파일로 내보내고, 그 파일을 다른 프로필에서 가져오면 같은 북마크가 된다', async () => {
  const out = join(tempDir(), 'out.html');
  process.env.AGENT_BROWSER_BOOKMARK_FILE = out;
  app = await launch();
  await go('/a');
  await menu('toggle-bookmark');
  await waitFor(async () => (await bar()).items.length === 1, '북마크 A');
  await menu('export-bookmarks-file');
  await waitFor(async () => (await toast()) === '1개를 내보냈습니다', '내보낸 개수');
  expect(existsSync(out)).toBe(true);
  expect(readFileSync(out, 'utf8')).toContain(`<A HREF="${server.base}/a">Page A</A>`);
  await app.stop();
  app = await launch({ userDataDir: tempDir() });
  expect((await bar()).items).toEqual([]);
  await menu('import-bookmarks-file');
  await waitFor(async () => (await bar()).items.length === 1, '다른 프로필로 가져옴');
  expect((await bar()).items).toEqual([{ title: 'Page A', folder: false }]);
});

// 카드 20261127-bookmark-folders: 사람 후기(11-27) "사이트명만 텍스트로만, 폴더 기능 없음, 마우스를 올려도 어떤 url인지 알 수 없음"
const items = () => ui<{ title: string; folder: boolean; icon: string; tip: string }[]>(`[...document.querySelectorAll('#bookmarks .bookmark')].map((b) => ({
  title: b.textContent.trim(), folder: b.classList.contains('folder'), tip: b.title,
  icon: b.querySelector('.favicon')?.getAttribute('src')?.slice(0, 15) ?? (b.querySelector('.favicon') ? 'default' : 'none'),
}))`);
const cmd = (c: Record<string, unknown>) => ui(`window.humanApi.command(${JSON.stringify(c)})`);

test('G1·G3: 사이트 아이콘과 이름으로 보이고(없으면 기본 아이콘), 마우스를 올리면 이름과 주소가 보인다', async () => {
  app = await launch();
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}/icon-page`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => ui<boolean>(`[...document.querySelectorAll('#tabs .tab.active .title')].some((t) => t.textContent === 'Icon Page')`), '아이콘 페이지');
  // 페이지가 아이콘을 알린 뒤 북마크한다(탭이 아이콘 주소를 안다)
  await waitFor(async () => ui<boolean>(`(document.querySelector('#tabs .tab.active')?.dataset.favicon ?? '').endsWith('/icon.png')`), '아이콘 알림');
  await menu('toggle-bookmark');
  await go('/a');
  await menu('toggle-bookmark');
  await waitFor(async () => (await items()).length === 2, '북마크 둘');
  const [withIcon, plain] = await items();
  expect(withIcon).toMatchObject({ title: 'Icon Page', icon: 'data:image/png;' });
  expect(plain).toMatchObject({ title: 'Page A', icon: 'default' });
  expect(plain.tip).toBe(`Page A\n${server.base}/a`);
});

test('G2: 새 폴더(이름 넣기), 폴더로 옮기기, 이름 바꾸기, 북마크 막대로 꺼내기', async () => {
  const profile = tempDir();
  app = await launch({ userDataDir: profile });
  await go('/a');
  await menu('toggle-bookmark');
  await waitFor(async () => (await items()).length === 1, '북마크 A');
  await menu('new-bookmark-folder');
  await waitFor(async () => ui<boolean>(`!document.querySelector('#bookmark-name').hidden && document.activeElement === document.querySelector('#bookmark-name')`), '이름 칸');
  await ui(`(() => { const i = document.querySelector('#bookmark-name'); i.value = '일'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await waitFor(async () => (await items()).some((i) => i.title === '일' && i.folder), '폴더 일');
  expect(await ui<boolean>(`document.querySelector('#bookmark-name').hidden`)).toBe(true);
  const ids = await ui<Record<string, string>>(`Object.fromEntries([...document.querySelectorAll('#bookmarks .bookmark')].map((b) => [b.textContent.trim(), b.dataset.id]))`);
  await cmd({ cmd: 'bookmarkMove', id: ids['Page A'], folderId: ids['일'] });
  await waitFor(async () => (await items()).map((i) => i.title).join() === '일', 'A가 폴더 안으로');
  await cmd({ cmd: 'bookmarkRename', id: ids['일'], title: '업무' });
  await waitFor(async () => (await items()).map((i) => i.title).join() === '업무', '이름 바꿈');
  const saved = JSON.parse(readFileSync(join(profile, 'bookmarks.json'), 'utf8')) as { title: string; children?: { url: string }[] }[];
  expect(saved).toEqual([expect.objectContaining({ title: '업무', children: [expect.objectContaining({ url: `${server.base}/a` })] })]);
  await cmd({ cmd: 'bookmarkMove', id: ids['Page A'], folderId: null });
  await waitFor(async () => (await items()).map((i) => i.title).join() === '업무,Page A', '막대로 꺼냄');
  // 이름 칸에서 Esc는 취소
  await menu('new-bookmark-folder');
  await waitFor(async () => ui<boolean>(`!document.querySelector('#bookmark-name').hidden`), '이름 칸');
  await ui(`document.querySelector('#bookmark-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(async () => ui<boolean>(`document.querySelector('#bookmark-name').hidden`), '취소');
  expect((await items()).length).toBe(2);
});

test('G1: 아이콘이 크기 상한(64KB)을 넘으면 받지 않고 기본 아이콘으로 북마크한다', async () => {
  app = await launch();
  await ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(`${server.base}/big-icon-page`)}; i.form.requestSubmit(); })()`);
  await waitFor(async () => ui<boolean>(`[...document.querySelectorAll('#tabs .tab.active .title')].some((t) => t.textContent === 'Big Icon')`), '큰 아이콘 페이지');
  // 페이지가 큰 아이콘을 알린 뒤 북마크한다. 앱이 그 아이콘을 받으러 가서(요청이 서버에 닿는다) 상한에서 멈추고 기본 아이콘
  await waitFor(async () => ui<boolean>(`(document.querySelector('#tabs .tab.active')?.dataset.favicon ?? '').endsWith('/big.png')`), '큰 아이콘 알림');
  const before = server.hits.filter((h) => h === 'GET /big.png').length;
  await menu('toggle-bookmark');
  await waitFor(async () => (await items()).length === 1, '북마크');
  expect(server.hits.filter((h) => h === 'GET /big.png').length).toBeGreaterThan(before);
  expect((await items())[0]).toMatchObject({ title: 'Big Icon', icon: 'default' });
});

test('G2: 오른쪽 클릭 메뉴로 폴더로 이동·이름 바꾸기(이름 칸), 빈 곳 오른쪽 클릭으로 새 폴더', async () => {
  app = await launch();
  await go('/a');
  await menu('toggle-bookmark');
  await waitFor(async () => (await items()).length === 1, '북마크 A');
  const popup = (path: string[]) => waitFor(async () => app!.request({ type: 'clickPopup', path }, 'done').then(() => true, () => false), path.join(' > '));
  const rightClick = (sel: string) => ui(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.right - 2, clientY: r.top + 4 })); })()`);
  const typeName = (name: string) => ui(`(() => { const i = document.querySelector('#bookmark-name'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  // 막대 빈 곳 오른쪽 클릭 > 새 폴더…
  await rightClick('#bookmark-items');
  await popup(['새 폴더…']);
  await waitFor(async () => ui<boolean>(`!document.querySelector('#bookmark-name').hidden`), '이름 칸');
  await typeName('일');
  await waitFor(async () => (await items()).some((i) => i.title === '일'), '폴더 일');
  // 북마크 오른쪽 클릭 > 폴더로 이동 > 일
  await rightClick('#bookmarks .bookmark:not(.folder)');
  await popup(['폴더로 이동', '일']);
  await waitFor(async () => (await items()).map((i) => i.title).join() === '일', 'A가 폴더 안으로');
  // 폴더 오른쪽 클릭 > 이름 바꾸기… → 지금 이름이 든 칸 → 새 이름
  await rightClick('#bookmarks .bookmark.folder');
  await popup(['이름 바꾸기…']);
  await waitFor(async () => ui<boolean>(`document.querySelector('#bookmark-name').value === '일' && !document.querySelector('#bookmark-name').hidden`), '지금 이름이 든 칸');
  await typeName('업무');
  await waitFor(async () => (await items()).map((i) => i.title).join() === '업무', '이름 바뀜');
});
