import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_ROTATE_BYTES, rotateLogIfLarge } from './logRotate';

const logIn = () => join(mkdtempSync(join(tmpdir(), 'ab-log-')), 'launcher.log');

describe('launcher.log 크기 제한(spec-cleanup-five C2)', () => {
  it('한도는 1MB(1,048,576바이트)다', () => {
    expect(LOG_ROTATE_BYTES).toBe(1_048_576);
  });

  it('1MB를 넘으면 .1로 옮기고(이전 .1은 덮어씀) 원래 파일은 없앤다', () => {
    const log = logIn();
    writeFileSync(`${log}.1`, 'old');
    const big = 'x'.repeat(LOG_ROTATE_BYTES + 1);
    writeFileSync(log, big);
    rotateLogIfLarge(log);
    expect(existsSync(log)).toBe(false);
    expect(statSync(`${log}.1`).size).toBe(big.length);
  });

  it('1MB 이하면 그대로 둔다', () => {
    const log = logIn();
    writeFileSync(log, 'x'.repeat(LOG_ROTATE_BYTES));
    rotateLogIfLarge(log);
    expect(statSync(log).size).toBe(LOG_ROTATE_BYTES);
    expect(existsSync(`${log}.1`)).toBe(false);
  });

  it('교체(이름 바꾸기)가 실패해도 오류 없이 지나가고 기존 파일은 그대로다(spec-start-fixes D4)', () => {
    const log = logIn();
    mkdirSync(`${log}.1`);
    writeFileSync(join(`${log}.1`, 'x'), 'x'); // .1 자리에 비지 않은 폴더 → rename 실패
    const big = 'x'.repeat(LOG_ROTATE_BYTES + 1);
    writeFileSync(log, big);
    expect(() => rotateLogIfLarge(log)).not.toThrow();
    expect(statSync(log).size).toBe(big.length);
  });

  it('파일이 없어도 오류가 나지 않는다', () => {
    const log = logIn();
    expect(() => rotateLogIfLarge(log)).not.toThrow();
    expect(existsSync(log)).toBe(false);
  });
});
