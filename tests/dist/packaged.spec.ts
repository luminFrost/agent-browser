import { test, expect, chromium } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { McpClient } from '../e2e/mcpClient';
import { AGENT_BROWSER_GUIDE } from '../../src/attach/attach';
import { startTestServer } from '../fixtures/server';
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

/** 이 프로필 환경으로 도는 앱 실행 파일의 모든 프로세스(시작 프로세스 포함). 시작 프로세스는 명령줄에 프로필이 없어 환경 변수로 찾는다 */
const envProcessesOf = (profile: string): number[] =>
  execFileSync('ps', ['-axwwE', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n')
    .filter((l) => l.includes(BINARY) && new RegExp(`AGENT_BROWSER_PROFILE=${profile}(\\s|$)`).test(l))
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
  expect(dmgs).toContain(`Agent-Browser-${VERSION}-arm64.dmg`); // GitHub Release 자산 이름에 공백을 쓸 수 없다(spec-company-setup B6)
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
    // 런처가 신호를 받아 창을 앞으로 가져온 뒤 받음 표시를 남긴다(spec-start-fixes D2)
    expect(readFileSync(join(profile, 'launcher.lock.ack'), 'utf8')).toBe(String(launcherPid));
    // CI(GitHub macOS 15 러너)에서는 창이 다른 앱 앞으로 오지 않아 이 확인만 뺀다(사람 승인 2026-11-20, 카드 20261119-release-ci).
    // 추론: macOS 14부터 다른 앱이 쓰는 중에는 포커스를 강제로 가져오지 못한다. 실제 Mac에서는 이 확인을 그대로 한다
    if (process.env.AB_DIST_SKIP_FRONTMOST !== '1') await waitFor(() => frontmostPid() === browserPid, '기존 앱이 앞으로 옴');
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

test('C5 잘못된 환경 값이면 시작 프로세스를 포함해 아무것도 남지 않고 실패로 끝난다', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  try {
    const code = await Promise.race([
      openApp(profile, { AGENT_BROWSER_CONTROL_PORT: 'abc' }),
      new Promise<'hang'>((ok) => setTimeout(() => ok('hang'), 10_000)),
    ]);
    expect(envProcessesOf(profile), '이 프로필로 남은 앱 프로세스(시작 프로세스 포함)').toEqual([]);
    expect(code).not.toBe('hang');
    expect(code).not.toBe(0);
    expect(leftovers(profile)).toEqual([]);
  } finally {
    for (const pid of envProcessesOf(profile)) process.kill(pid, 'SIGKILL');
  }
});

/** spec-cleanup-five C1: 끄기 시작한 직후 다시 열어도 앱이 다시 켜진다 */
const REOPEN_GAPS_MS = [0, 20, 50, 100, 300];
const REOPEN_REPEAT = 2;

test(`C1 끄는 중 다시 열기(${REOPEN_GAPS_MS.join('·')}ms 뒤, 간격마다 ${REOPEN_REPEAT}번): 매번 앱이 다시 켜진다`, async () => {
  test.setTimeout(600_000);
  const profile = mkdtempSync(join(tmpdir(), 'ab-dist-'));
  const running = async () => waitFor(() => {
    const p = appProcesses(profile);
    return p.browser && p.launcher && launchersOf(profile).length === 1
      && processes().filter((q) => isBrowser(q, profile)).length === 1 ? p : undefined;
  }, '런처·브라우저 하나씩', 30_000);
  expect(await openApp(profile)).toBe(0);
  let { browser, launcher } = await running();
  try {
    for (const gap of REOPEN_GAPS_MS) {
      for (let n = 0; n < REOPEN_REPEAT; n++) {
        const oldLauncher = launcher!.pid;
        process.kill(oldLauncher, 'SIGTERM'); // 끄기 시작
        await new Promise((r) => setTimeout(r, gap));
        expect(await openApp(profile)).toBe(0);
        ({ browser, launcher } = await waitFor(async () => {
          const p = await running().catch(() => undefined);
          return p && p.launcher!.pid !== oldLauncher ? p : undefined;
        }, `${gap}ms 뒤 다시 열어 새 런처가 뜸(${n + 1}번째)`, 30_000));
        await waitFor(() => onScreenWindowOwners().includes(browser!.pid), `${gap}ms: 사람 창이 화면에 뜸`);
      }
    }
  } finally {
    const p = appProcesses(profile);
    if (p.browser) process.kill(p.browser.pid, 'SIGTERM');
    await waitFor(() => envProcessesOf(profile).length === 0, '정리').catch(() => undefined);
  }
});

// ── 붙이기 명령(spec-claude-attach A1·A2·A3·A5·A6) ──
/** Claude Code에 등록하는 붙이기 명령(README) */
const ATTACH = join(APP, 'Contents', 'Resources', 'agent-browser-mcp');
/** A3: 붙이기 명령이 끝나면 그 세션이 이 시간 안에 끝난다 */
const ATTACH_CLOSE_WITHIN_MS = 5_000;
/** A5: 앱이 꺼져 있을 때 붙이기 명령이 15초 안에 붙는다(MCP initialize 응답까지) */
const ATTACH_START_WITHIN_MS = 15_000 + 5_000;
const ATTACH_COUNT = 3;

test('A5·A6·A1·A2·A3·E1 붙이기 명령: 앱이 꺼져 있어도 Node 없이 동시에 3개를 띄우면 앱이 1번 켜지고 각자 자기 세션에 붙으며(창은 사람 창 1개뿐), 끝나면 그 세션이 끝난다', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'ab-attach-'));
  const server = await startTestServer();
  const procs: ChildProcess[] = [];
  try {
    expect(existsSync(ATTACH)).toBe(true);
    expect(statSync(ATTACH).mode & 0o111).not.toBe(0); // 실행할 수 있다
    expect(existsSync(controlFileOf(profile))).toBe(false); // 앱이 꺼져 있다

    // A5·A6: node가 없는 PATH, 앱 꺼짐, 거의 동시에 3개
    const started = Date.now();
    const clients = await Promise.all(Array.from({ length: ATTACH_COUNT }, () => {
      const proc = spawn(ATTACH, [], { env: { HOME: process.env.HOME, PATH: NO_NODE_PATH, AGENT_BROWSER_PROFILE: profile }, stdio: ['pipe', 'pipe', 'ignore'] });
      procs.push(proc);
      return McpClient.over(proc);
    }));
    expect(Date.now() - started).toBeLessThan(ATTACH_START_WITHIN_MS);
    expect(launchersOf(profile)).toHaveLength(1); // ADR-0008: 런처는 1개
    // B5(spec-company-setup): 쓸 때 알 것이 MCP 안내로 온다
    for (const mcp of clients) expect(mcp.initResult.instructions?.startsWith(AGENT_BROWSER_GUIDE)).toBe(true);

    // A1·A2: 각자 자기 세션에서 다른 페이지를 열고, 서로의 탭이 보이지 않는다
    const paths = ['/a?n=1', '/b?n=2', '/a?n=3']; // 서로의 부분 문자열이 아니다
    for (const [i, mcp] of clients.entries()) {
      const pageId = Number(/(\d+):/.exec(await mcp.tool('list_pages'))?.[1]);
      await mcp.tool('navigate_page', { pageId, type: 'url', url: `${server.base}${paths[i]}` });
    }
    expect(await clients[0].tool('take_snapshot', { pageId: Number(/(\d+):/.exec(await clients[0].tool('list_pages'))?.[1]) })).toMatch(/heading "A"/);
    for (const [i, mcp] of clients.entries()) {
      const pages = await mcp.tool('list_pages');
      expect(pages).toContain(`${server.base}${paths[i]}`);
      for (const [j, other] of paths.entries()) if (j !== i) expect(pages).not.toContain(`${server.base}${other}`);
      expect(pages).not.toContain('/renderer/');
    }

    // E1(spec-embedded-sessions): 세션이 3개여도 창은 사람 창 1개다. 세션 탭은 사람 창 안에 있다
    const { browser } = await waitFor(() => { const p = appProcesses(profile); return p.browser ? p : undefined; }, '브라우저');
    const windows = () => onScreenWindowOwners().filter((pid) => pid === browser!.pid).length;
    await waitFor(() => windows() === 1, '사람 창 1개');
    // A3: 붙이기 명령이 끝날 때마다 그 세션이 끝난다(그 browserUrl이 더 응답하지 않는다). 나머지는 그대로다.
    // browserUrl은 붙이기 명령이 띄운 chrome-devtools-mcp의 인자(--browserUrl)에서 읽는다. (다) 강제 종료 → (나) SIGTERM → (가) stdin 닫힘
    const urls = procs.map((p) => /--browserUrl (\S+)/.exec(processes().find((c) => c.ppid === p.pid && c.command.includes('--browserUrl'))?.command ?? '')?.[1]);
    expect(urls.every((u) => u !== undefined)).toBe(true);
    const responds = (url: string) => fetch(`${url}json/version`).then((r) => r.ok, () => false);
    const ends: ((p: ChildProcess) => void)[] = [(p) => p.kill('SIGKILL'), (p) => p.kill('SIGTERM'), (p) => p.stdin!.end()];
    for (const [i, end] of ends.entries()) {
      end(procs[i]);
      await waitFor(async () => !(await responds(urls[i]!)), `붙이기 명령 ${i + 1}이 끝나 그 세션이 끝남`, ATTACH_CLOSE_WITHIN_MS);
      for (const url of urls.slice(i + 1)) expect(await responds(url!)).toBe(true);
      expect(windows()).toBe(1);
    }
  } finally {
    for (const p of procs) p.kill('SIGKILL');
    const { browser } = appProcesses(profile);
    if (browser) process.kill(browser.pid, 'SIGTERM');
    await waitFor(() => leftovers(profile).length === 0, '정리').catch(() => undefined);
    await server.close();
  }
});
