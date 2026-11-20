import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, writeSettings, SETTINGS_FILE_NAME } from './settings';

const dir = () => mkdtempSync(join(tmpdir(), 'ab-settings-'));

describe('settings (카드 20261120-follow-agents F1·F5)', () => {
  it('파일이 없으면 따라 보기는 켜져 있다', () => {
    expect(readSettings(dir()).followAgents).toBe(true);
  });
  it('쓴 값을 다시 읽는다', () => {
    const d = dir();
    writeSettings(d, { followAgents: false });
    expect(readSettings(d).followAgents).toBe(false);
  });
  it('깨진 파일이나 잘못된 값이면 기본값', () => {
    const d = dir();
    writeFileSync(join(d, SETTINGS_FILE_NAME), '{ 깨짐');
    expect(readSettings(d).followAgents).toBe(true);
    writeFileSync(join(d, SETTINGS_FILE_NAME), JSON.stringify({ followAgents: 'no' }));
    expect(readSettings(d).followAgents).toBe(true);
  });
  it('쓸 수 없는 폴더여도 예외를 던지지 않는다', () => {
    expect(() => writeSettings(join(dir(), '없는', '폴더'), { followAgents: false })).not.toThrow();
  });
});
