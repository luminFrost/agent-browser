import { test, expect } from '@playwright/test';
import { launch, humanUi, evaluate, targets, waitFor } from './helpers';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
let server: TestServer;
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => { await app.stop(); await server.close(); });

const ui = async <T>(expr: string) => evaluate<T>(app, (await humanUi(app)).targetId, expr);
const go = async (url: string) => ui(`(() => { const i = document.querySelector('#address'); i.value = ${JSON.stringify(url)}; i.form.requestSubmit(); })()`);
const address = () => ui<string>(`document.querySelector('#address').value`);
const click = (selector: string) => ui(`document.querySelector(${JSON.stringify(selector)}).click()`);
const tabTitles = () => ui<string[]>(`[...document.querySelectorAll('#tabs .tab')].map(t => t.dataset.title)`);

test('R1: 앱을 실행하면 사람 창 1개만 있다', async () => {
  const { windows } = await app.request({ type: 'listWindows' }, 'windows');
  expect(windows).toEqual([{ kind: 'human' }]);
});

test('주소창으로 이동하고 뒤로·앞으로·새로고침이 된다', async () => {
  await go(`${server.base}/a`);
  await waitFor(async () => (await address()) === `${server.base}/a`, 'A로 이동');
  await go(`${server.base}/b`);
  await waitFor(async () => (await tabTitles())[0] === 'Page B', 'B 제목');
  await click('#back');
  await waitFor(async () => (await address()) === `${server.base}/a`, '뒤로 → A');
  await click('#forward');
  await waitFor(async () => (await address()) === `${server.base}/b`, '앞으로 → B');
  const before = server.hits.filter((h) => h === 'GET /b').length;
  await click('#reload');
  await waitFor(async () => server.hits.filter((h) => h === 'GET /b').length === before + 1, '새로고침 → B 다시 요청');
});

test('스킴 없이 입력하면 http(s)://를 붙인다', async () => {
  await go(server.base.replace('http://', '') + '/a');
  await waitFor(async () => (await address()) === `${server.base}/a`, 'http로 보정');
});

test('새 탭을 열고 전환할 수 있다', async () => {
  await go(`${server.base}/a`);
  await waitFor(async () => (await tabTitles())[0] === 'Page A', '첫 탭 A');
  await click('#new-tab');
  await waitFor(async () => (await tabTitles()).length === 2, '탭 2개');
  await go(`${server.base}/b`);
  await waitFor(async () => (await tabTitles())[1] === 'Page B', '둘째 탭 B');
  await ui(`document.querySelectorAll('#tabs .tab')[0].click()`);
  await waitFor(async () => (await address()) === `${server.base}/a`, '첫 탭으로 전환');
});

test('불러오는 동안 로딩 표시가 보이고, 끝나면 사라진다', async () => {
  await go(`${server.base}/slow?ms=2000`);
  await waitFor(() => ui<boolean>(`!document.querySelector('#loading').hidden`), '로딩 표시 보임');
  await waitFor(() => ui<boolean>(`document.querySelector('#loading').hidden`), '로딩 표시 사라짐', 8000);
});

test('불러오기 실패하면 오류 페이지가 뜨고 주소창은 실패한 주소를 보인다', async () => {
  const dead = 'http://127.0.0.1:9/nowhere'; // discard 포트: 연결 거부
  await go(dead);
  const errorPage = await waitFor(async () => (await targets(app)).find((t) => t.url.includes('/renderer/error.html')), '오류 페이지 대상');
  await waitFor(async () => (await evaluate<string>(app, errorPage.targetId, 'document.body.innerText')).includes('페이지를 열 수 없습니다'), '오류 문구');
  expect(await address()).toBe(dead);
});

test('사이트의 권한 요청(알림·위치·카메라)은 거부된다', async () => {
  await go(`${server.base}/a`);
  const page = await waitFor(async () => (await targets(app)).find((t) => t.url === `${server.base}/a`), '탭 대상');
  const run = (expr: string) => evaluate<string>(app, page.targetId, expr);
  expect(await run('Notification.requestPermission()')).toBe('denied');
  expect(await run(`navigator.mediaDevices.getUserMedia({ video: true }).then(() => 'granted', e => e.name)`)).toBe('NotAllowedError');
  // 위치: macOS의 Electron은 거부된 위치 요청에 오류 콜백을 부르지 않고 멈춘다(T2에서 확인).
  // 그래서 권한 상태가 denied이고, 위치가 끝내 전달되지 않는 것으로 확인한다.
  expect(await run(`navigator.permissions.query({ name: 'geolocation' }).then(s => s.state)`)).toBe('denied');
  expect(await run(`new Promise(r => { navigator.geolocation.getCurrentPosition(() => r('granted'), e => r('error:' + e.code)); setTimeout(() => r('no-position'), 3000); })`)).not.toBe('granted');
});
