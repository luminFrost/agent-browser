import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'chrome-devtools-mcp');

/** chrome-devtools-mcp를 stdio MCP 서버로 띄워 도구를 부르는 작은 클라이언트(테스트용) */
export class McpClient {
  private nextId = 1;
  private buffer = '';
  private readonly waiters = new Map<number, (m: { result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message: string } }) => void>();

  private constructor(readonly proc: ChildProcess) {
    proc.stdout!.on('data', (d: Buffer) => {
      this.buffer += d.toString();
      let i: number;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i);
        this.buffer = this.buffer.slice(i + 1);
        try { const m = JSON.parse(line); if (m.id !== undefined) this.waiters.get(m.id)?.(m); } catch { /* 로그 줄 */ }
      }
    });
  }

  static async start(browserUrl: string): Promise<McpClient> {
    // 외부 전송(사용 통계, CrUX)을 끈다
    return McpClient.over(spawn(BIN, ['--browserUrl', browserUrl, '--no-usage-statistics', '--no-performance-crux'], { stdio: ['pipe', 'pipe', 'ignore'] }));
  }

  /** stdio MCP 서버 프로세스(붙이기 명령 등)에 붙어 initialize까지 한다 */
  static async over(proc: ChildProcess): Promise<McpClient> {
    const client = new McpClient(proc);
    await client.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agent-browser-e2e', version: '0' } });
    proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return client;
  }

  rpc(method: string, params: Record<string, unknown>) {
    const id = this.nextId++;
    return new Promise<{ result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message: string } }>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error(`MCP ${method} 응답 없음`)), 30_000);
      this.waiters.set(id, (m) => { clearTimeout(timer); ok(m); });
      this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  /** 도구를 부르고 출력 글자를 돌려준다. 도구 오류면 던진다 */
  async tool(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const r = await this.rpc('tools/call', { name, arguments: args });
    const text = (r.result?.content ?? []).map((c) => c.text ?? '').join('\n');
    if (r.error || r.result?.isError) throw new Error(`${name}: ${r.error?.message ?? text}`);
    return text;
  }

  stop(): void { this.proc.kill(); }
}
