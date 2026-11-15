// spec-cleanup-five C4: 브라우저가 준비 전에 끝나면 startApp이 실패하고, 그 프로세스가 대기 타이머 때문에 남지 않는다
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP_MODULE = resolve(__dirname, '..', '..', 'dist', 'launcher', 'app.js');
const EXIT_LIMIT_MS = 3_000;

test('C4: 브라우저가 준비 전에 끝나면 startApp을 부른 프로세스가 3초 안에 스스로 끝난다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-readyfail-'));
  const browserMain = join(dir, 'exit.js');
  writeFileSync(browserMain, 'process.exit(3);\n'); // 준비를 알리기 전에 끝나는 브라우저
  // 실패 뒤 process.exit를 부르지 않는다: 남은 타이머가 있으면 프로세스가 끝나지 않는다
  const code = `require(${JSON.stringify(APP_MODULE)}).startApp({ userDataDir: ${JSON.stringify(join(dir, 'profile'))}, hidden: true, browserMain: ${JSON.stringify(browserMain)} })
    .then(() => { console.log('UNEXPECTED_READY'); process.exit(9); }, (e) => console.log('FAILED:' + e.message));`;
  const started = Date.now();
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
  const exitedIn = await new Promise<number>((ok) => {
    const kill = setTimeout(() => { child.kill(); ok(Infinity); }, 40_000);
    child.on('exit', () => { clearTimeout(kill); ok(Date.now() - started); });
  });
  expect(out).toContain('FAILED:브라우저가 준비되기 전에 끝났다');
  expect(exitedIn).toBeLessThan(EXIT_LIMIT_MS);
});
