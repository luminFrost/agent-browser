import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ackedSince, claimLock, isOurLauncher, lockHolder, markAck, recordLauncher, releaseLock, STALE_EMPTY_MS } from './launcherLock';

const LOCK_MODULE = join(__dirname, 'launcherLock.ts');
/** 별도 프로세스 n개가 같은 순간에 claimLock을 부른다. 적힌 pid는 이 앱의 런처가 아니라고 본다(낡은 자물쇠) */
const raceClaims = (lock: string, n: number): Promise<boolean[]> => {
  const at = Date.now() + 400;
  const code = `import { claimLock } from ${JSON.stringify(LOCK_MODULE)};
    while (Date.now() < ${at}) {}
    process.stdout.write(String(claimLock(${JSON.stringify(lock)}, () => false)));`;
  return Promise.all(Array.from({ length: n }, () => new Promise<boolean>((resolve, reject) => {
    const child = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('exit', (c) => (c === 0 ? resolve(out === 'true') : reject(new Error(`exit ${c}`))));
  })));
};

const lockIn = () => join(mkdtempSync(join(tmpdir(), 'ab-lock-')), 'launcher.lock');
const ours = () => true;
const notOurs = () => false;

describe('런처 자물쇠(묶은 앱의 한 프로필 한 런처, ADR-0008)', () => {
  it('처음 시작하면 자물쇠를 잡는다', () => {
    const l = lockIn();
    expect(claimLock(l, ours)).toBe(true);
    expect(existsSync(l)).toBe(true);
  });

  it('이 앱의 런처가 살아서 잡고 있으면 잡지 못한다', () => {
    const l = lockIn();
    claimLock(l, ours);
    recordLauncher(l, 4242);
    expect(claimLock(l, (pid) => pid === 4242)).toBe(false);
    expect(lockHolder(l)).toBe(4242);
  });

  it('적힌 pid가 이 앱의 런처가 아니면(죽음·재부팅 뒤 재사용) 낡은 것으로 보고 다시 잡는다', () => {
    const l = lockIn();
    claimLock(l, ours);
    recordLauncher(l, 4242);
    expect(claimLock(l, notOurs)).toBe(true);
    expect(lockHolder(l)).toBeUndefined(); // 새로 잡은 자물쇠는 아직 pid가 없다
  });

  it('pid를 아직 적지 않은 자물쇠는 새것이면 잡지 못하고, 오래되면 다시 잡는다', () => {
    const l = lockIn();
    claimLock(l, ours);
    expect(claimLock(l, ours)).toBe(false);
    const old = (Date.now() - STALE_EMPTY_MS * 2) / 1000;
    utimesSync(l, old, old);
    expect(claimLock(l, ours)).toBe(true);
  });

  it('런처는 자기 pid가 적힌 자물쇠만 지운다', () => {
    const l = lockIn();
    claimLock(l, ours);
    recordLauncher(l, 4242);
    releaseLock(l, 1111);
    expect(readFileSync(l, 'utf8')).toBe('4242');
    releaseLock(l, 4242);
    expect(existsSync(l)).toBe(false);
  });

  it('낡은 자물쇠를 16개 프로세스가 동시에 치워도 주인은 하나다(40번 반복)', async () => {
    for (let round = 0; round < 40; round++) {
      const l = lockIn();
      writeFileSync(l, '999999'); // 죽은 런처가 남긴 자물쇠
      const results = await raceClaims(l, 16);
      expect(results.filter(Boolean).length, `회차 ${round}`).toBe(1);
    }
  }, 120_000);

  it('적힌 pid가 살아 있는 런처라도 이 자물쇠를 쓴 뒤에 시작한 프로세스면(다른 프로필이 pid 재사용) 낡은 것이다', async () => {
    // 명령줄에 launcher/cli.js가 있는 살아 있는 프로세스
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)', 'launcher/cli.js'], { stdio: 'ignore' });
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const pid = child.pid!;
      const same = lockIn();
      recordLauncher(same, pid); // 런처가 시작한 뒤 적음 → 이 프로필의 런처
      expect(isOurLauncher(pid, same)).toBe(true);
      expect(claimLock(same, isOurLauncher)).toBe(false);

      const other = lockIn();
      recordLauncher(other, pid);
      const before = (Date.now() - 60_000) / 1000;
      utimesSync(other, before, before); // 그 프로세스가 시작하기 전에 적힌 자물쇠 → 다른 런처가 pid를 재사용
      expect(isOurLauncher(pid, other)).toBe(false);
      expect(claimLock(other, isOurLauncher)).toBe(true);
    } finally {
      child.kill();
    }
  });

  it('없는 pid를 확인해도 stderr에 아무것도 나오지 않는다', () => {
    const code = `import { isOurLauncher } from ${JSON.stringify(LOCK_MODULE)};
      process.stdout.write(String(isOurLauncher(2147483646, '/nonexistent/launcher.lock')) + String(isOurLauncher(99999999999, '/nonexistent/launcher.lock')));`;
    const r = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' });
    expect(r.stdout).toBe('falsefalse');
    expect(r.stderr).toBe('');
  });

  it('없는 자물쇠를 지우거나 읽어도 오류가 나지 않는다', () => {
    const l = lockIn();
    expect(() => releaseLock(l, 1)).not.toThrow();
    expect(lockHolder(l)).toBeUndefined();
    writeFileSync(l, 'x');
    expect(() => releaseLock(l, 1)).not.toThrow();
    expect(lockHolder(l)).toBeUndefined();
  });

  it('신호 받음 표시: 그 pid가 since 이후에 남긴 것만 인정하고, 런처가 끝나면 지운다(spec-start-fixes D2)', () => {
    const l = lockIn();
    claimLock(l, ours);
    recordLauncher(l, 4242);
    const before = Date.now();
    expect(ackedSince(l, 4242, before)).toBe(false); // 표시 없음
    markAck(l, 4242);
    expect(ackedSince(l, 4242, before)).toBe(true);
    expect(ackedSince(l, 1111, before)).toBe(false); // 다른 런처
    expect(ackedSince(l, 4242, Date.now() + 60_000)).toBe(false); // 이번 신호보다 이전 표시
    releaseLock(l, 4242);
    expect(existsSync(`${l}.ack`)).toBe(false);
  });
});
