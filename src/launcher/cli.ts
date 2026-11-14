import { mkdirSync } from 'node:fs';
import { startApp } from './app';
import { parseCliArgs } from './cliArgs';
import { releaseStart } from '../app/startMarker';
import { START_MARKER_ENV } from '../shared/constants';

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2), process.env);
  mkdirSync(options.profile, { recursive: true, mode: 0o700 });
  // 묶은 앱의 시작 표시는 브라우저가 프로필 자물쇠를 잡으면(준비) 또는 실패하면 지운다
  const marker = process.env[START_MARKER_ENV];
  const release = () => { if (marker) releaseStart(marker, process.pid); };
  const app = await startApp({
    userDataDir: options.profile,
    controlPort: options.controlPort,
    hidden: options.hidden,
    onBlocked: options.logBlocked ? (e) => console.error(`agent-browser: 막음 [세션 ${e.sessionId}] ${e.method} — ${e.reason}`) : undefined,
  }).finally(release);
  console.log(`agent-browser 실행 중. 제어 파일(포트·토큰): ${app.controlFile}`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  app.exited.then(stop); // 사람이 사람 창을 닫아 브라우저가 끝나면 런처도 끝낸다
}

main().catch((e: unknown) => {
  console.error(`agent-browser: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
