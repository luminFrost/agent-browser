import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from '../../src/launcher/app';

const listeningPorts = (pid: number): string => {
  try {
    const kids = execFileSync('pgrep', ['-P', String(pid)]).toString().trim().split('\n').filter(Boolean);
    return execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', [pid, ...kids].join(',')]).toString();
  } catch {
    return ''; // lsof는 결과가 없으면 1로 끝난다
  }
};

test('런처가 파이프로 브라우저를 띄우고, 브라우저는 TCP 포트를 열지 않으며, 끄면 끝난다 (ADR-0002)', async () => {
  const app = await startApp({ userDataDir: mkdtempSync(join(tmpdir(), 'ab-')) });
  try {
    const version = await app.rawCdp.send('Browser.getVersion');
    expect(String(version.userAgent)).toContain('Electron/');
    expect(listeningPorts(app.browserPid)).toBe('');
  } finally {
    await app.stop();
  }
  expect(() => process.kill(app.browserPid, 0)).toThrow();
});
