import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimLock, lockHolder, recordLauncher, releaseLock, STALE_EMPTY_MS } from './launcherLock';

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

  it('없는 자물쇠를 지우거나 읽어도 오류가 나지 않는다', () => {
    const l = lockIn();
    expect(() => releaseLock(l, 1)).not.toThrow();
    expect(lockHolder(l)).toBeUndefined();
    writeFileSync(l, 'x');
    expect(() => releaseLock(l, 1)).not.toThrow();
    expect(lockHolder(l)).toBeUndefined();
  });
});
