// 카드 20261123-update-notice U1·U2: 앱 안 업데이트 알림과 한 번 눌러 업데이트.
// 개발 실행은 GitHub에 묻지 않으므로 시험 서버(AGENT_BROWSER_UPDATE_URL)와 가짜 설치 스크립트(AGENT_BROWSER_UPDATE_INSTALLER)로 켠다(ADR-0010 4).
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launch, humanUi, evaluate, waitFor, tempDir } from './helpers';
import type { RunningApp } from '../../src/launcher/app';
import { UPDATE_FIRST_CHECK_DELAY_MS, appBundlePath } from '../../src/browser/update';
// 개발 실행의 브라우저 실행 파일(electron 패키지가 경로 문자열을 내보낸다)
import electronPath from 'electron';

const CURRENT = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;
const DMG_BODY = 'fake dmg bytes 9.9.9';

let app: RunningApp | undefined;
let server: Server;
let base: string;
let hits: string[];
/** 시험 서버가 /latest에 줄 응답 */
let latest: { status: number; body: string };
let dmgStatus = 200;
/** dmg 응답을 늦추는 시간(받는 중 문구를 보기 위해) */
let dmgDelayMs = 0;
const saved = { ...process.env };

test.beforeEach(async () => {
  hits = []; dmgStatus = 200; dmgDelayMs = 0;
  server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url === '/latest') { res.statusCode = latest.status; res.setHeader('content-type', 'application/json'); return res.end(latest.body); }
    if (req.url === '/dmg') { res.statusCode = dmgStatus; setTimeout(() => res.end(dmgStatus === 200 ? DMG_BODY : 'nope'), dmgDelayMs); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterEach(async () => {
  await app?.stop().catch(() => undefined); app = undefined;
  process.env = { ...saved };
  await new Promise<void>((r) => server.close(() => r()));
});

const release = (tag: string, dmg = `Agent-Browser-${tag.replace(/^v/, '')}-arm64.dmg`) => JSON.stringify({
  tag_name: tag, html_url: `${base}/page`, assets: [{ name: dmg, browser_download_url: `${base}/dmg` }, { name: 'install-mac.sh', browser_download_url: `${base}/sh` }],
});
/** 가짜 설치 스크립트: 받은 인자와 dmg 내용을 파일에 적는다 */
function fakeInstaller(): { path: string; out: string } {
  const dir = tempDir();
  const out = join(dir, 'installer.out');
  const path = join(dir, 'installer.sh');
  writeFileSync(path, `#!/bin/bash\n{ printf '%s\\n' "$@"; cat "$1"; } > "${out}"\n`);
  chmodSync(path, 0o755);
  return { path, out };
}
async function start(env: Record<string, string>) {
  Object.assign(process.env, { AGENT_BROWSER_UPDATE_URL: `${base}/latest` }, env);
  app = await launch();
  return app;
}
const ui = async <T>(expr: string) => evaluate<T>(app!, (await humanUi(app!)).targetId, expr);
const banner = () => ui<{ hidden: boolean; text: string }>(`(() => { const e = document.querySelector('#update'); return { hidden: !e || e.hidden, text: e ? e.textContent.replace(/\\s+/g, ' ').trim() : '' }; })()`);

test('U1: 최신 Release가 더 높으면 패널 맨 위에 새 버전과 업데이트 버튼이 보인다', async () => {
  latest = { status: 200, body: release('v9.9.9') };
  await start({});
  await waitFor(async () => !(await banner()).hidden, '업데이트 줄');
  const b = await banner();
  expect(b.text).toContain('새 버전 9.9.9');
  expect(await ui<string>(`document.querySelector('#update-install').textContent`)).toBe('업데이트');
  // 패널 맨 위(승인 줄·세션 목록보다 위)
  expect(await ui<boolean>(`document.querySelector('#panel').firstElementChild === document.querySelector('#update')`)).toBe(true);
  expect(hits).toContain('GET /latest');
});

for (const [name, resp] of [
  ['같은 버전', () => ({ status: 200, body: release(`v${CURRENT}`) })],
  ['낮은 버전', () => ({ status: 200, body: release('v0.0.1') })],
  ['HTTP 오류', () => ({ status: 500, body: '{}' })],
  ['JSON 아님', () => ({ status: 200, body: '<html>' })],
  ['그 버전 dmg 없음', () => ({ status: 200, body: release('v9.9.9', 'Agent-Browser-9.9.8-arm64.dmg') })],
] as const) {
  test(`U1: ${name}이면 아무것도 보이지 않고 앱은 그대로다`, async () => {
    latest = resp();
    await start({});
    await waitFor(async () => hits.includes('GET /latest'), '물음');
    await new Promise((r) => setTimeout(r, 500));
    expect((await banner()).hidden).toBe(true);
    expect((await app!.request({ type: 'update' }, 'update')).state).toBe('none');
  });
}

test('U1: AGENT_BROWSER_UPDATE_CHECK=off면 묻지 않는다', async () => {
  latest = { status: 200, body: release('v9.9.9') };
  await start({ AGENT_BROWSER_UPDATE_CHECK: 'off' });
  // 첫 묻기 시각을 넉넉히 넘겨 기다린다(off가 아니면 이 사이에 /latest를 묻는다: 위 U1 시험들)
  await new Promise((r) => setTimeout(r, UPDATE_FIRST_CHECK_DELAY_MS + 2000));
  expect(hits).toEqual([]);
  expect((await banner()).hidden).toBe(true);
});

test('U2: 업데이트를 누르면 dmg를 받아 설치 스크립트에 넘기고 앱이 끝난다', async () => {
  latest = { status: 200, body: release('v9.9.9') };
  const inst = fakeInstaller();
  await start({ AGENT_BROWSER_UPDATE_INSTALLER: inst.path });
  await waitFor(async () => !(await banner()).hidden, '업데이트 줄');
  const pid = app!.browserPid;
  dmgDelayMs = 1500;
  await ui(`document.querySelector('#update-install').click()`);
  await waitFor(async () => (await banner()).text.includes('새 버전 9.9.9 받는 중'), '받는 중 문구');
  await Promise.race([app!.exited, new Promise((_, no) => setTimeout(() => no(new Error('앱이 끝나지 않음')), 20_000))]);
  await waitFor(async () => existsSync(inst.out) && readFileSync(inst.out, 'utf8').includes(DMG_BODY), '설치 스크립트 실행');
  const [dmg, appPath, gotPid] = readFileSync(inst.out, 'utf8').split('\n');
  expect(dmg).toMatch(/Agent-Browser-9\.9\.9-arm64\.dmg$/);
  expect(appPath).toBe(appBundlePath(electronPath as unknown as string));
  expect(Number(gotPid)).toBe(pid);
  expect(hits).toContain('GET /dmg');
  app = undefined; // 이미 끝났다
});

test('U2: dmg 받기가 실패하면 실패 문구와 다시 누를 버튼이 보이고 앱은 계속 돈다', async () => {
  latest = { status: 200, body: release('v9.9.9') };
  dmgStatus = 404;
  const inst = fakeInstaller();
  await start({ AGENT_BROWSER_UPDATE_INSTALLER: inst.path });
  await waitFor(async () => !(await banner()).hidden, '업데이트 줄');
  await ui(`document.querySelector('#update-install').click()`);
  await waitFor(async () => (await banner()).text.includes('업데이트 실패'), '실패 문구');
  expect(await ui<boolean>(`!document.querySelector('#update-install').hidden && !document.querySelector('#update-install').disabled`)).toBe(true);
  expect(existsSync(inst.out)).toBe(false);
  expect((await app!.request({ type: 'listWindows' }, 'windows')).windows.length).toBe(1);
});
