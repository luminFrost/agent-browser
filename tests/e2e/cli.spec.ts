import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { tempDir, waitFor } from './helpers';
import { LAUNCHER_LOCK_NAME, USER_DATA_FLAG } from '../../src/shared/constants';

/** 이 프로필로 도는 브라우저 main 프로세스(도우미 제외) */
const browsersOf = (profile: string): number[] =>
  execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n')
    .filter((l) => l.includes(`${USER_DATA_FLAG}${profile}`) && !l.includes('--type='))
    .map((l) => Number(l.trim().split(/\s+/)[0]));

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

// 카드 20261122-start-signal: 앱이 다 뜨기 전에 끄라는 신호를 받아도 브라우저가 남지 않는다
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`S1: 시작 중 ${signal}이면 런처는 0으로 끝나고 브라우저가 남지 않으며 자물쇠를 푼다`, async () => {
    const profile = join(tempDir(), 'profile');
    const proc = spawn(process.execPath, ['dist/launcher/cli.js', '--profile', profile, '--hidden'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(proc, 'exit');
    try {
      await waitFor(async () => browsersOf(profile).length > 0, '브라우저 프로세스가 뜸', 30_000);
      expect(existsSync(join(profile, 'control.json'))).toBe(false); // 아직 준비 전
      proc.kill(signal);
      const [code] = await exited;
      expect(code).toBe(0);
      await waitFor(async () => browsersOf(profile).length === 0, '브라우저가 끝남', 10_000);
      expect(existsSync(join(profile, LAUNCHER_LOCK_NAME))).toBe(false);
    } finally {
      proc.kill('SIGKILL');
      for (const pid of browsersOf(profile)) process.kill(pid, 'SIGKILL');
    }
  });
}

test('S2: 준비 전에 런처가 강제로 죽어도 브라우저가 끝난다', async () => {
  const profile = join(tempDir(), 'profile');
  const proc = spawn(process.execPath, ['dist/launcher/cli.js', '--profile', profile, '--hidden'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(async () => browsersOf(profile).length > 0, '브라우저 프로세스가 뜸', 30_000);
    expect(existsSync(join(profile, 'control.json'))).toBe(false);
    proc.kill('SIGKILL');
    await waitFor(async () => browsersOf(profile).length === 0, '브라우저가 끝남', 10_000);
  } finally {
    for (const pid of browsersOf(profile)) process.kill(pid, 'SIGKILL');
  }
});
