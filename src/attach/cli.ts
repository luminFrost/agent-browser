// 붙이기 명령(spec-claude-attach). Claude Code가 MCP stdio 서버로 띄운다:
//   claude mcp add agent-browser -- "/Applications/Agent Browser.app/Contents/Resources/agent-browser-mcp"
// 켜진 앱에 붙잡은 세션(에이전트 창 1개)을 열고, 함께 넣은 chrome-devtools-mcp를 그 세션에 붙여 stdio를 넘긴다.
// 이 프로세스가 어떻게 끝나든 붙잡은 연결이 끊겨 런처가 그 창을 닫는다(A3).
// 묶은 앱에서는 앱 실행 파일을 Node 모드(ELECTRON_RUN_AS_NODE)로 돌린다. 시스템 Node가 필요 없다(A6).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { CONTROL_FILE_NAME } from '../shared/constants';
import { parseCliArgs } from '../launcher/cliArgs';
import { connect, mcpArgs, type ControlInfo, type HeldSession } from './attach';

/** stdin이 닫힌 뒤 chrome-devtools-mcp가 스스로 끝나기를 기다리는 시간 */
const CHILD_EXIT_GRACE_MS = 2_000;

/** 함께 넣은 chrome-devtools-mcp의 실행 스크립트(package.json의 bin) */
function mcpBin(): string {
  const dir = join(__dirname, '..', '..', 'node_modules', 'chrome-devtools-mcp');
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  return join(dir, pkg.bin['chrome-devtools-mcp']);
}

function readControl(file: string): ControlInfo | undefined {
  try {
    const c = JSON.parse(readFileSync(file, 'utf8')) as ControlInfo;
    return typeof c.port === 'number' && typeof c.token === 'string' ? c : undefined;
  } catch {
    return undefined;
  }
}

/** POST /sessions?hold=1: 첫 줄로 세션 정보를 받고 연결을 열어 둔다 */
function openSession(control: ControlInfo): Promise<HeldSession | 'unreachable'> {
  return new Promise((ok, fail) => {
    let settled = false;
    const req = request({
      host: '127.0.0.1', port: control.port, path: '/sessions?hold=1', method: 'POST',
      headers: { authorization: `Bearer ${control.token}` },
    }, (res) => {
      if (res.statusCode !== 201) { settled = true; res.resume(); fail(new Error(`세션을 만들지 못했다(HTTP ${res.statusCode})`)); return; }
      let buf = '';
      let endClosed: () => void = () => undefined;
      const closed = new Promise<void>((r) => { endClosed = r; });
      res.on('close', () => endClosed());
      res.on('error', () => endClosed());
      res.on('data', (d: Buffer) => {
        if (settled) return;
        buf += d.toString();
        const i = buf.indexOf('\n');
        if (i < 0) return;
        settled = true;
        const info = JSON.parse(buf.slice(0, i)) as { id: string; browserUrl: string };
        ok({ ...info, close: () => req.destroy(), closed });
      });
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      // 제어 파일이 남았지만 앱이 없다 → 켜 봐야 한다
      if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') ok('unreachable');
      else fail(e);
    });
    req.end();
  });
}

/** 더블클릭과 같은 시작 프로세스를 띄운다(묶은 앱에서만). 앱 실행 파일을 Node 모드 없이 돌린다 */
function startApp(): void {
  if (!process.versions.electron) throw new Error('Agent Browser가 꺼져 있다(개발 실행에서는 자동으로 켜지 않는다)');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, [], { env, detached: true, stdio: 'ignore' }).unref();
}

async function main(): Promise<void> {
  const { profile } = parseCliArgs([], process.env);
  const controlFile = join(profile, CONTROL_FILE_NAME);
  const held = await connect({
    readControl: () => readControl(controlFile),
    openSession,
    startApp,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
  });

  const child = spawn(process.execPath, [mcpBin(), ...mcpArgs(held.browserUrl)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  child.stdin.on('error', () => undefined); // 자식이 먼저 끝나면 쓰기가 실패할 수 있다
  process.stdin.pipe(child.stdin);
  // Claude Code가 stdin을 닫으면(가) 자식에게도 닫고, 스스로 끝나지 않으면 끝낸다
  process.stdin.on('end', () => setTimeout(() => child.kill('SIGTERM'), CHILD_EXIT_GRACE_MS).unref());
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(sig, () => { held.close(); child.kill(sig); });
  }
  // 런처 쪽에서 끊었다(사람이 창을 닫음·앱 종료) → 더 할 일이 없다
  held.closed.then(() => {
    if (child.exitCode === null) {
      process.stderr.write('agent-browser: 세션이 닫혔다(에이전트 창을 닫았거나 앱이 끝났다)\n');
      child.kill('SIGTERM');
    }
  }).catch(() => undefined);
  child.on('exit', (code, signal) => {
    held.close();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((e: unknown) => {
  process.stderr.write(`agent-browser: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
