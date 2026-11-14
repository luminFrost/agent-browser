import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { tempDir, waitFor } from './helpers';

test('실행 진입점: 프로필에 제어 파일을 만들고, 세션을 열 수 있고, Ctrl+C로 끝내면 제어 파일을 지운다', async () => {
  const profile = join(tempDir(), 'profile'); // 없는 폴더도 만든다
  const proc = spawn(process.execPath, ['dist/launcher/cli.js', '--profile', profile, '--hidden'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const controlFile = join(profile, 'control.json');
  try {
    await waitFor(async () => existsSync(controlFile), '제어 파일', 30_000);
    expect(statSync(profile).mode & 0o777).toBe(0o700);
    const { port, token } = JSON.parse(readFileSync(controlFile, 'utf8')) as { port: number; token: string };
    const res = await fetch(`http://127.0.0.1:${port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(201);
  } finally {
    proc.kill('SIGINT');
    const [code] = await once(proc, 'exit');
    expect(code).toBe(0);
  }
  expect(existsSync(controlFile)).toBe(false);
});
