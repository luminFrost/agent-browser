// 카드 20261123-update-notice U3: 앱이 띄우는 설치 스크립트. hdiutil·ditto·open을 가짜 명령으로 바꿔 돌린다(Linux·macOS)
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '..', 'resources', 'update-mac.sh');

/** 가짜 명령: 받은 인자를 log에 적는다. hdiutil attach는 -mountpoint 자리에 새 .app을 만든다 */
function setup(opts: { dittoFails?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ab-update-'));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const log = join(dir, 'calls.log');
  const stub = (name: string, body: string) => { writeFileSync(join(bin, name), `#!/bin/bash\necho "${name} $*" >> "${log}"\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub('hdiutil', 'if [ "$1" = attach ]; then mp=""; while [ $# -gt 0 ]; do [ "$1" = -mountpoint ] && mp="$2"; shift; done; mkdir -p "$mp/Agent Browser.app/Contents"; echo new > "$mp/Agent Browser.app/Contents/version"; fi');
  stub('ditto', opts.dittoFails ? 'exit 1' : 'mkdir -p "$2" && cp -R "$1/." "$2/"');
  stub('open', '');
  const app = join(dir, 'Applications', 'Agent Browser.app');
  mkdirSync(join(app, 'Contents'), { recursive: true });
  writeFileSync(join(app, 'Contents', 'version'), 'old');
  const dmg = join(dir, 'Agent-Browser-9.9.9-arm64.dmg'); writeFileSync(dmg, 'dmg');
  const profile = join(dir, 'profile'); mkdirSync(profile);
  return { dir, bin, log, app, dmg, profile };
}
const run = (s: ReturnType<typeof setup>, pid: number) => spawnSync('bash', [SCRIPT, s.dmg, s.app, String(pid)], {
  env: { ...process.env, PATH: `${s.bin}:${process.env.PATH}`, AGENT_BROWSER_PROFILE: s.profile }, encoding: 'utf8', timeout: 20_000,
});
const deadPid = () => { const p = spawnSync('true'); return p.pid ?? 999999; };

describe('update-mac.sh (U3)', () => {
  it('앱이 끝난 뒤 dmg의 앱으로 같은 자리를 바꾸고, dmg를 떼고, 새 앱을 연다', () => {
    const s = setup();
    const r = run(s, deadPid());
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(s.app, 'Contents', 'version'), 'utf8').trim()).toBe('new');
    expect(existsSync(`${s.app}.old`)).toBe(false);
    const calls = readFileSync(s.log, 'utf8');
    expect(calls).toMatch(/^hdiutil attach .*-nobrowse/m);
    expect(calls).toMatch(/^hdiutil detach /m);
    expect(calls).toContain(`open ${s.app}`);
    expect(readFileSync(join(s.profile, 'update.log'), 'utf8')).toContain('업데이트 완료');
  });

  it('앱이 아직 돌면 끝날 때까지 기다린다', () => {
    const s = setup();
    const sleeper = execFileSync('bash', ['-c', 'sleep 1.5 & echo $!'], { encoding: 'utf8' }).trim();
    const t0 = Date.now();
    const r = run(s, Number(sleeper));
    expect(r.status, r.stderr).toBe(0);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  });

  it('복사가 실패하면 원래 앱을 되돌리고 0이 아닌 코드, dmg는 뗀다, 새 앱을 열지 않는다', () => {
    const s = setup({ dittoFails: true });
    const r = run(s, deadPid());
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(s.app, 'Contents', 'version'), 'utf8').trim()).toBe('old');
    const calls = readFileSync(s.log, 'utf8');
    expect(calls).toMatch(/^hdiutil detach /m);
    expect(calls).not.toMatch(/^open /m);
    expect(readFileSync(join(s.profile, 'update.log'), 'utf8')).toContain('업데이트 실패');
  });
});
