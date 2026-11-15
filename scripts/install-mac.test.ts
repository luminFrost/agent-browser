// 설치 스크립트(spec-company-setup B2·B3·B4). 실제 Claude 설정·/Applications는 건드리지 않는다:
// 설치 위치(AB_INSTALL_DIR)·저장소(AB_REPO_DIR)를 임시 폴더로, claude·npm·node를 가짜로 바꾼다.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, 'install-mac.sh');
const APP = 'Agent Browser.app';
const ATTACH_REL = 'Contents/Resources/agent-browser-mcp';
const BASE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
/** dmg를 만들고 마운트하는 데 몇 초가 걸린다 */
const DMG_TEST_TIMEOUT_MS = 60_000;

const temps: string[] = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'ab-install-')); temps.push(d); return d; };
afterEach(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** 가짜 명령: 받은 인자를 log에 한 줄로 남기고 body를 실행한다 */
function fake(bin: string, name: string, log: string, body = '') {
  writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}

/** 앱 묶음 흉내(붙이기 명령 파일만 있는 .app) */
function fakeApp(dir: string) {
  const attach = join(dir, APP, ATTACH_REL);
  mkdirSync(join(attach, '..'), { recursive: true });
  writeFileSync(attach, '#!/bin/sh\n');
  chmodSync(attach, 0o755);
}

function setup(opts: { node?: string | null; claude?: boolean } = {}) {
  const root = temp();
  const bin = join(root, 'bin');
  const install = join(root, 'Applications');
  const repo = join(root, 'repo');
  const log = join(root, 'calls.log');
  mkdirSync(bin); mkdirSync(install); mkdirSync(repo);
  writeFileSync(log, '');
  if (opts.claude !== false) fake(bin, 'claude', log);
  if (opts.node !== null) fake(bin, 'node', log, `echo "${opts.node ?? 'v22.12.0'}"`);
  // 가짜 npm: run dist면 저장소의 release에 앱을 만든다
  fake(bin, 'npm', log, `if [ "$1" = run ] && [ "$2" = dist ]; then mkdir -p "${repo}/release/mac-arm64/${APP}/Contents/Resources" && printf '#!/bin/sh\\n' > "${repo}/release/mac-arm64/${APP}/${ATTACH_REL}" && chmod +x "${repo}/release/mac-arm64/${APP}/${ATTACH_REL}"; fi`);
  const run = (args: string[], extra: Record<string, string> = {}) => spawnSync('/bin/bash', [SCRIPT, ...args], {
    env: { HOME: root, PATH: `${bin}:${BASE_PATH}`, AB_INSTALL_DIR: install, AB_REPO_DIR: repo, ...extra },
    encoding: 'utf8',
  });
  const calls = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  return { root, install, repo, run, calls };
}

const registered = (install: string) => `claude mcp add --scope user agent-browser -- ${join(install, APP, ATTACH_REL)}`;

describe('설치 스크립트: 빌드 경로 (B2)', () => {
  it('npm ci → npm run dist → 앱 복사 → 같은 이름을 지우고 다시 등록, 0으로 끝난다', () => {
    const w = setup();
    const r = w.run([]);
    expect(r.status, r.stderr).toBe(0);
    const calls = w.calls();
    expect(calls).toContain('npm ci');
    expect(calls.indexOf('npm ci')).toBeLessThan(calls.indexOf('npm run dist'));
    expect(existsSync(join(w.install, APP, ATTACH_REL))).toBe(true);
    expect(calls).toContain('claude mcp remove --scope user agent-browser');
    expect(calls.indexOf('claude mcp remove --scope user agent-browser')).toBeLessThan(calls.indexOf(registered(w.install)));
    expect(r.stdout).toContain(join(w.install, APP)); // 설치 경로를 알려 준다
  });

  it('기존 앱이 있으면 새것으로 바꾼다', () => {
    const w = setup();
    mkdirSync(join(w.install, APP, 'old'), { recursive: true });
    expect(w.run([]).status).toBe(0);
    expect(existsSync(join(w.install, APP, 'old'))).toBe(false);
  });
});

describe('설치 스크립트: dmg 경로 (B3)', () => {
  it('Node 없이 dmg에서 앱을 복사해 등록하고, 마운트를 푼다', () => {
    const w = setup({ node: null });
    const src = temp();
    fakeApp(src);
    const dmg = join(temp(), 'ab.dmg');
    const made = spawnSync('hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', src, '-volname', 'AB Test', dmg], { encoding: 'utf8' });
    expect(made.status, made.stderr).toBe(0);
    const r = w.run(['--from-dmg', dmg]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(w.install, APP, ATTACH_REL))).toBe(true);
    expect(w.calls()).toContain(registered(w.install));
    expect(w.calls().some((c) => c.startsWith('npm') || c.startsWith('node'))).toBe(false);
    expect(spawnSync('hdiutil', ['info'], { encoding: 'utf8' }).stdout).not.toContain(dmg); // 마운트가 남지 않는다
  }, DMG_TEST_TIMEOUT_MS);

  it('dmg 파일이 없으면 실패하고 아무것도 설치하지 않는다', () => {
    const w = setup();
    const r = w.run(['--from-dmg', join(w.root, 'nope.dmg')]);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(w.install, APP))).toBe(false);
    expect(w.calls().filter((c) => c.startsWith('claude'))).toEqual([]);
  });
});

describe('설치 스크립트: 사전 확인 실패 (B4)', () => {
  const nothingInstalled = (w: ReturnType<typeof setup>) => {
    expect(existsSync(join(w.install, APP))).toBe(false);
    expect(w.calls().filter((c) => c.startsWith('claude') || c.startsWith('npm'))).toEqual([]);
  };

  it('arm64가 아니면 이유를 쓰고 실패한다', () => {
    const w = setup();
    const r = w.run([], { AB_ARCH: 'x86_64' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/arm64/);
    nothingInstalled(w);
  });

  it('claude가 없으면 이유를 쓰고 실패한다', () => {
    const w = setup({ claude: false });
    const r = w.run([]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/claude/);
    nothingInstalled(w);
  });

  it.each([['Node가 없으면', null], ['Node 20이면', 'v20.19.0']])('빌드 경로에서 %s Release dmg(--from-dmg)를 안내하고 실패한다', (_n, node) => {
    const w = setup({ node });
    const r = w.run([]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--from-dmg/);
    nothingInstalled(w);
  });
});
