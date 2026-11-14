import { mkdirSync } from 'node:fs';
import { startApp } from './app';
import { parseCliArgs } from './cliArgs';

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2), process.env);
  mkdirSync(options.profile, { recursive: true, mode: 0o700 });
  const app = await startApp({ userDataDir: options.profile, controlPort: options.controlPort, hidden: options.hidden });
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
