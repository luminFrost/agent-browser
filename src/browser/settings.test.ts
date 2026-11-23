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
    writeSettings(d, { followAgents: false, theme: 'system', updateCheck: true });
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
    expect(() => writeSettings(join(dir(), '없는', '폴더'), { followAgents: false, theme: 'system', updateCheck: true })).not.toThrow();
  });
});

describe('settings 화면 모드 (카드 20261123-theme-mode T1)', () => {
  it('파일이 없으면 기기(system)를 따른다', () => {
    expect(readSettings(dir()).theme).toBe('system');
  });
  it('쓴 모드를 다시 읽고, 따라 보기 값과 함께 남는다', () => {
    const d = dir();
    writeSettings(d, { followAgents: false, theme: 'dark', updateCheck: true });
    expect(readSettings(d)).toEqual({ followAgents: false, theme: 'dark', updateCheck: true });
    writeSettings(d, { followAgents: true, theme: 'light', updateCheck: true });
    expect(readSettings(d).theme).toBe('light');
  });
  it('모르는 모드 값이면 기기(system)', () => {
    const d = dir();
    for (const theme of ['night', 1, null, 'Dark']) {
      writeFileSync(join(d, SETTINGS_FILE_NAME), JSON.stringify({ followAgents: false, theme }));
      expect(readSettings(d)).toEqual({ followAgents: false, theme: 'system', updateCheck: true });
    }
  });
});

describe('settings 업데이트 확인 끄기 (카드 20261123-update-notice 검증 2회차)', () => {
  it('파일이 없으면 켜져 있다', () => {
    expect(readSettings(dir()).updateCheck).toBe(true);
  });
  it('"updateCheck": false를 읽고, 다른 설정을 쓸 때도 지켜진다', () => {
    const d = dir();
    writeFileSync(join(d, SETTINGS_FILE_NAME), JSON.stringify({ updateCheck: false }));
    const s = readSettings(d);
    expect(s.updateCheck).toBe(false);
    writeSettings(d, { ...s, theme: 'dark' });
    expect(readSettings(d)).toEqual({ followAgents: true, theme: 'dark', updateCheck: false });
  });
  it('불리언이 아니면 켜짐', () => {
    const d = dir();
    writeFileSync(join(d, SETTINGS_FILE_NAME), JSON.stringify({ updateCheck: 'no' }));
    expect(readSettings(d).updateCheck).toBe(true);
  });
});
