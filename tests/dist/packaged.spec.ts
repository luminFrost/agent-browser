import { test, expect, chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// 묶은 앱(spec-mac-app.md P1~P6)을 Node 없이 띄워 확인한다. `npm run test:dist`가 먼저 `npm run dist`를 한다.
const ROOT = resolve(__dirname, '..', '..');
const VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const RELEASE = join(ROOT, 'release');
const APP = join(RELEASE, 'mac-arm64', 'Agent Browser.app');
const BINARY = join(APP, 'Contents', 'MacOS', 'Agent Browser');
/** node·npm이 없는 PATH. 다른 Mac에 Node가 없는 상황 */
const NO_NODE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

interface Proc { pid: number; ppid: number; command: string }

const processes = (): Proc[] =>
  execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }));

const isBrowser = (p: Proc, profile: string) =>
  p.command.startsWith(BINARY) && p.command.includes(`--ab-user-data=${profile}`) && !p.command.includes('--type=');

/** 이 프로필로 돌고 있는 앱 프로세스: 브라우저(사람 창을 띄우는 쪽)와 그 부모인 런처 */
const appProcesses = (profile: string) => {
  const all = processes();
  const browser = all.find((p) => isBrowser(p, profile));
  const launcher = browser ? all.find((p) => p.pid === browser.ppid) : undefined;
  return { browser, launcher, all };
};

/** 프로필 경로가 명령줄에 있는 모든 프로세스(브라우저·도우미)와 런처 */
const leftovers = (profile: string, launcherPid?: number) =>
  processes().filter((p) => p.command.includes(profile) || p.pid === launcherPid);

const onScreenWindowOwners = (): number[] =>
  execFileSync('swift', [join(__dirname, 'windows.swift')], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number);

const frontmostPid = (): number | undefined => {
  const asn = execFileSync('lsappinfo', ['front'], { encoding: 'utf8' }).trim();
  const m = execFileSync('lsappinfo', ['info', '-only', 'pid', asn], { encoding: 'utf8' }).match(/pid\s*=\s*(\d+)/);
  return m ? Number(m[1]) : undefined;
};

async function waitFor<T>(fn: () => T | undefined | false | Promise<T | undefined | false>, what: string, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`기다렸지만 안 됨: ${what}`);
}

/** 더블클릭과 같이 앱 실행 파일을 인자 없이 띄운다. 처음 뜬 프로세스는 런처를 띄우고 끝난다 */
async function openApp(profile: string, extraEnv: Record<string, string> = {}): Promise<number | null> {
  const starter = spawn(BINARY, [], {
    env: { HOME: process.env.HOME, PATH: NO_NODE_PATH, AGENT_BROWSER_PROFILE: profile, ...extraEnv },
    stdio: 'ignore',
  });
  return new Promise((ok) => starter.on('exit', (code) => ok(code)));
}

/** 런처: 같은 앱 실행 파일로 cli.js를 도는 프로세스. 명령줄에 프로필이 없어 환경 변수(ps -E)로 찾는다 */
const launchersOf = (profile: string): number[] =>
  execFileSync('ps', ['-axwwE', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n')
    .filter((l) => l.includes(BINARY) && l.includes('dist/launcher/cli.js') && new RegExp(`AGENT_BROWSER_PROFILE=${profile}(\\s|$)`).test(l))
    .map((l) => Number(l.trim().split(/\s+/)[0]));

const controlFileOf = (profile: string) => join(profile, 'control.json');
const readControl = (profile: string) => JSON.parse(readFileSync(controlFileOf(profile), 'utf8')) as { port: number; token: string };

async function createSession(profile: string): Promise<string> {
  const { port, token } = readControl(profile);
  const res = await fetch(`http://127.0.0.1:${port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { browserUrl: string }).browserUrl;
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('P1 묶기: arm64 dmg와 app이 있고 이름에 버전이 있다', () => {
  expect(existsSync(BINARY)).toBe(true);
  const dmgs = readdirSync(RELEASE).filter((f) => f.endsWith('.dmg'));
  expect(dmgs).toContain(`Agent Browser-${VERSION}-arm64.dmg`);
  const arch = execFileSync('lipo', ['-archs', BINARY], { encoding: 'utf8' }).trim();
  expect(arch).toBe('arm64');
});

test.describe('한 번 띄운 앱', () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  let browserPid = 0;
  let launcherPid = 0;

  test.afterAll(async () => {
    const { browser } = appProcesses(profile);
    if (browser) process.kill(browser.pid, 'SIGTERM');
    await waitFor(() => leftovers(profile, launcherPid).length === 0, '정리').catch(() => undefined);
  });

  test('P2 Node 없이 실행: 사람 창이 뜨고 control.json으로 세션을 열어 페이지를 다룬다', async () => {
    expect(await openApp(profile)).toBe(0);
    await waitFor(() => existsSync(controlFileOf(profile)), 'control.json');
    expect(statSync(controlFileOf(profile)).mode & 0o777).toBe(0o600);

    const { browser, launcher } = await waitFor(() => { const p = appProcesses(profile); return p.browser && p.launcher ? p : undefined; }, '런처·브라우저');
    browserPid = browser!.pid;
    launcherPid = launcher!.pid;
    // 런처는 같은 앱 실행 파일을 Node 모드로 돌린다(시스템 node가 아님)
    expect(launcher!.command.startsWith(BINARY)).toBe(true);
    await waitFor(() => onScreenWindowOwners().includes(browserPid), '사람 창이 화면에 뜸');

    const browserUrl = await createSession(profile);
    const cdp = await chromium.connectOverCDP(browserUrl);
    try {
      const page = cdp.contexts()[0].pages()[0] ?? await cdp.contexts()[0].newPage();
      await page.goto('data:text/html,<h1 id="t">packaged</h1>');
      await expect(page.locator('#t')).toHaveText('packaged');
      await page.screenshot({ path: test.info().outputPath('P2-agent-tab.png') });
    } finally {
      await cdp.close();
    }
  });

  test('P3 보안: 127.0.0.1 밖에서 듣지 않고, 브라우저는 TCP를 열지 않으며, 토큰 없으면 401', async () => {
    const pids = leftovers(profile, launcherPid).map((p) => p.pid);
    let listening = '';
    try {
      listening = execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')], { encoding: 'utf8' });
    } catch { /* LISTEN이 하나도 없으면 lsof는 1로 끝난다 */ }
    await test.info().attach('lsof', { body: listening });
    const rows = listening.split('\n').slice(1).filter(Boolean).map((l) => l.split(/\s+/));
    expect(rows.length).toBeGreaterThan(0); // 제어 서버·세션 엔드포인트
    for (const r of rows) {
      expect(Number(r[1])).not.toBe(browserPid);
      expect(r[8]).toMatch(/^127\.0\.0\.1:\d+$/);
    }
    const { port } = readControl(profile);
    const res = await fetch(`http://127.0.0.1:${port}/sessions`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  test('런처 출력은 프로필의 launcher.log에 남는다', () => {
    expect(readFileSync(join(profile, 'launcher.log'), 'utf8')).toContain('agent-browser 실행 중');
  });

  test('P5 두 번 열기: 새로 띄우지 않고 control.json은 그대로, 기존 창이 앞으로 온다', async () => {
    const before = readFileSync(controlFileOf(profile), 'utf8');
    execFileSync('open', ['-a', 'Finder']); // 다른 앱을 앞에 둔다. 그래야 "앞으로 온다"를 볼 수 있다
    await waitFor(() => frontmostPid() !== browserPid, '다른 앱이 앞에 옴');
    expect(await openApp(profile)).toBe(0);
    await waitFor(() => frontmostPid() === browserPid, '기존 앱이 앞으로 옴');
    const { browser, launcher, all } = appProcesses(profile);
    expect(browser?.pid).toBe(browserPid);
    expect(launcher?.pid).toBe(launcherPid);
    expect(all.filter((p) => isBrowser(p, profile))).toHaveLength(1);
    expect(readFileSync(controlFileOf(profile), 'utf8')).toBe(before);
  });

  test('P4 끝내기: 앱을 종료하면 런처·브라우저·도우미가 모두 사라진다', async () => {
    process.kill(browserPid, 'SIGTERM'); // 앱 종료(Cmd+Q)와 같은 정상 종료 경로
    await waitFor(() => leftovers(profile, launcherPid).length === 0, '남는 프로세스 없음');
    expect(existsSync(controlFileOf(profile))).toBe(false);
  });
});

test('P6 브라우저가 강제로 죽으면 런처도 끝나고, 다음 실행은 정상이다', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  expect(await openApp(profile)).toBe(0);
  const first = await waitFor(() => { const p = appProcesses(profile); return p.browser && p.launcher ? p : undefined; }, '첫 실행');
  process.kill(first.browser!.pid, 'SIGKILL');
  await waitFor(() => leftovers(profile, first.launcher!.pid).length === 0, '남는 프로세스 없음');

  expect(await openApp(profile)).toBe(0);
  const second = await waitFor(() => { const p = appProcesses(profile); return p.browser && p.launcher ? p : undefined; }, '다시 실행');
  await waitFor(() => existsSync(controlFileOf(profile)), 'control.json');
  await createSession(profile);
  process.kill(second.browser!.pid, 'SIGTERM');
  await waitFor(() => leftovers(profile, second.launcher!.pid).length === 0, '정리');
});

/** 시작 직후 경쟁(검증 1회차): 첫 실행이 자물쇠를 놓은 뒤 브라우저가 잡기 전에 둘째가 들어오는 간격들 */
const RACE_GAPS_MS = [30, 80, 150, 300];
const RACE_WATCH_MS = 6_000;
const POLL_MS = 20;

for (const gap of RACE_GAPS_MS) {
  test(`P5 시작 중 두 번 열기(${gap}ms 간격): 런처·브라우저는 한 번도 둘이 되지 않는다`, async () => {
    const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
    let maxLaunchers = 0;
    let maxBrowsers = 0;
    const first = openApp(profile);
    await new Promise((r) => setTimeout(r, gap));
    const second = openApp(profile);
    const until = Date.now() + RACE_WATCH_MS;
    while (Date.now() < until) {
      maxLaunchers = Math.max(maxLaunchers, launchersOf(profile).length);
      maxBrowsers = Math.max(maxBrowsers, processes().filter((p) => isBrowser(p, profile)).length);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    expect(await Promise.all([first, second])).toEqual([0, 0]);
    const { browser, launcher } = appProcesses(profile);
    expect(browser && launcher).toBeTruthy();
    expect({ maxLaunchers, maxBrowsers }).toEqual({ maxLaunchers: 1, maxBrowsers: 1 });
    process.kill(browser!.pid, 'SIGTERM');
    await waitFor(() => leftovers(profile, launcher!.pid).length === 0, '정리');
  });
}

/** 검증 2회차 반례: 짧은 간격으로 아주 여러 번 실행해도 런처·브라우저는 한 번도 둘이 되지 않는다 */
const BURST_COUNT = 120;
const BURST_GAP_MS = 8;

test(`P5 연속 실행(${BURST_GAP_MS}ms 간격 ${BURST_COUNT}회): 런처·브라우저는 한 번도 둘이 되지 않는다`, async () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  let maxLaunchers = 0;
  let maxBrowsers = 0;
  let watching = true;
  const watch = (async () => {
    while (watching) {
      maxLaunchers = Math.max(maxLaunchers, launchersOf(profile).length);
      maxBrowsers = Math.max(maxBrowsers, processes().filter((p) => isBrowser(p, profile)).length);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  })();
  const starters: Promise<number | null>[] = [];
  for (let i = 0; i < BURST_COUNT; i++) {
    starters.push(openApp(profile));
    await new Promise((r) => setTimeout(r, BURST_GAP_MS));
  }
  await Promise.all(starters);
  await new Promise((r) => setTimeout(r, RACE_WATCH_MS));
  watching = false;
  await watch;
  const { browser, launcher } = appProcesses(profile);
  expect(browser && launcher).toBeTruthy();
  expect({ maxLaunchers, maxBrowsers }).toEqual({ maxLaunchers: 1, maxBrowsers: 1 });
  process.kill(browser!.pid, 'SIGTERM');
  await waitFor(() => leftovers(profile, launcher!.pid).length === 0, '정리');
});

test('남은 자물쇠의 pid가 다른 프로세스에 재사용됐어도(재부팅 뒤) 앱이 열린다', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  const other = spawn('sleep', ['60'], { stdio: 'ignore' }); // 살아 있지만 이 앱의 런처가 아닌 프로세스
  try {
    writeFileSync(join(profile, 'launcher.lock'), String(other.pid));
    expect(await openApp(profile)).toBe(0);
    const { browser, launcher } = await waitFor(() => { const p = appProcesses(profile); return p.browser && p.launcher ? p : undefined; }, '앱이 열림');
    await waitFor(() => existsSync(controlFileOf(profile)), 'control.json');
    process.kill(browser!.pid, 'SIGTERM');
    await waitFor(() => leftovers(profile, launcher!.pid).length === 0, '정리');
  } finally {
    other.kill();
  }
});

test('잘못된 환경 값이면 시작 프로세스가 남지 않고 실패로 끝난다', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  const code = await Promise.race([
    openApp(profile, { AGENT_BROWSER_CONTROL_PORT: 'abc' }),
    new Promise<'hang'>((ok) => setTimeout(() => ok('hang'), 10_000)),
  ]);
  expect(code).not.toBe('hang');
  expect(code).not.toBe(0);
  expect(leftovers(profile)).toEqual([]);
});
