import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimStart, recordLauncher, releaseStart, STALE_EMPTY_MS } from './startMarker';

const markerIn = () => join(mkdtempSync(join(tmpdir(), 'ab-marker-')), 'starting.pid');
const alive = () => true;
const dead = () => false;

describe('시작 표시(묶은 앱의 동시 실행 막기)', () => {
  it('처음 시작하면 표시를 잡는다', () => {
    const m = markerIn();
    expect(claimStart(m, alive)).toBe(true);
    expect(existsSync(m)).toBe(true);
  });

  it('다른 시작이 표시를 잡고 있고 그 런처가 살아 있으면 잡지 못한다', () => {
    const m = markerIn();
    expect(claimStart(m, alive)).toBe(true);
    recordLauncher(m, 4242);
    expect(claimStart(m, (pid) => pid === 4242)).toBe(false);
  });

  it('런처가 죽은 표시는 낡은 것으로 보고 다시 잡는다', () => {
    const m = markerIn();
    claimStart(m, alive);
    recordLauncher(m, 4242);
    expect(claimStart(m, dead)).toBe(true);
  });

  it('pid를 아직 쓰지 않은 표시는 새것이면 잡지 못하고, 오래되면 다시 잡는다', () => {
    const m = markerIn();
    claimStart(m, alive);
    expect(claimStart(m, alive)).toBe(false);
    const old = (Date.now() - STALE_EMPTY_MS * 2) / 1000;
    utimesSync(m, old, old);
    expect(claimStart(m, alive)).toBe(true);
  });

  it('런처는 자기 pid가 적힌 표시만 지운다', () => {
    const m = markerIn();
    claimStart(m, alive);
    recordLauncher(m, 4242);
    releaseStart(m, 1111);
    expect(readFileSync(m, 'utf8')).toBe('4242');
    releaseStart(m, 4242);
    expect(existsSync(m)).toBe(false);
  });

  it('없는 표시를 지워도 오류가 나지 않는다', () => {
    const m = markerIn();
    expect(() => releaseStart(m, 1)).not.toThrow();
    writeFileSync(m, 'x');
    expect(() => releaseStart(m, 1)).not.toThrow();
  });
});
