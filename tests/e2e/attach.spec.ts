import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createSession, launch, sessionIds, waitFor } from './helpers';
import { McpClient } from './mcpClient';
import { AGENT_BROWSER_GUIDE } from '../../src/attach/attach';
import { startTestServer, type TestServer } from '../fixtures/server';
import type { RunningApp } from '../../src/launcher/app';

// 붙이기 명령(spec-claude-attach)을 개발 빌드(dist/attach/cli.js)로 확인한다. 묶은 앱 확인은 tests/dist
const CLI = join(__dirname, '..', '..', 'dist', 'attach', 'cli.js');
/** 창이 닫히기를 기다리는 최대 시간(A3: 5초 안) */
const CLOSE_WITHIN_MS = 5_000;

let app: RunningApp;
let server: TestServer;
const running: ChildProcess[] = [];
test.beforeEach(async () => { server = await startTestServer(); app = await launch(); });
test.afterEach(async () => {
  for (const p of running.splice(0)) p.kill('SIGKILL');
  await app.stop();
  await server.close();
});

const profileOf = (a: RunningApp) => join(a.controlFile, '..');
const agentWindows = async () => (await sessionIds(app)).length; // 세션 수(E1: 세션마다 창을 띄우지 않는다)

async function attach(): Promise<McpClient> {
  const proc = spawn(process.execPath, [CLI], { env: { ...process.env, AGENT_BROWSER_PROFILE: profileOf(app) }, stdio: ['pipe', 'pipe', 'ignore'] });
  running.push(proc);
  return McpClient.over(proc);
}

const firstPageId = async (mcp: McpClient) => Number(/(\d+):/.exec(await mcp.tool('list_pages'))?.[1]);

test('A1: 붙이기 명령에 MCP로 navigate·snapshot을 보내면 새 세션에서 페이지가 열린다', async () => {
  expect(await agentWindows()).toBe(0);
  const mcp = await attach();
  const tools = await mcp.rpc('tools/list', {}) as { result?: { tools?: { name: string }[] } };
  expect(tools.result?.tools?.map((t) => t.name)).toEqual(expect.arrayContaining(['navigate_page', 'take_snapshot', 'list_pages']));
  expect(await agentWindows()).toBe(1);
  const pageId = await firstPageId(mcp);
  await mcp.tool('navigate_page', { pageId, type: 'url', url: `${server.base}/a` });
  expect(await mcp.tool('take_snapshot', { pageId })).toMatch(/heading "A"/);
});

test('A2: 붙이기 명령 2개는 세션이 따로 생기고 서로의 탭이 보이지 않는다', async () => {
  const [a, b] = await Promise.all([attach(), attach()]);
  expect(await agentWindows()).toBe(2);
  await a.tool('navigate_page', { pageId: await firstPageId(a), type: 'url', url: `${server.base}/a` });
  await b.tool('navigate_page', { pageId: await firstPageId(b), type: 'url', url: `${server.base}/b` });
  const [pagesA, pagesB] = [await a.tool('list_pages'), await b.tool('list_pages')];
  expect(pagesA).toContain(`${server.base}/a`);
  expect(pagesA).not.toContain(`${server.base}/b`);
  expect(pagesB).toContain(`${server.base}/b`);
  expect(pagesB).not.toContain(`${server.base}/a`);
  expect(pagesA).not.toContain('/renderer/'); // 사람 창·머리줄 UI도 안 보인다
});

for (const [name, end] of [
  ['(가) stdin이 닫히면', (p: ChildProcess) => p.stdin!.end()],
  ['(나) SIGTERM이면', (p: ChildProcess) => p.kill('SIGTERM')],
  ['(다) SIGKILL로 강제 종료되면', (p: ChildProcess) => p.kill('SIGKILL')],
] as const) {
  test(`A3 ${name} 그 세션이 5초 안에 끝나고 다른 세션은 그대로다`, async () => {
    const [a, b] = await Promise.all([attach(), attach()]);
    expect(await agentWindows()).toBe(2);
    end(a.proc);
    await waitFor(async () => (await agentWindows()) === 1, '끝난 세션이 사라짐', CLOSE_WITHIN_MS);
    const pageId = await firstPageId(b);
    await b.tool('navigate_page', { pageId, type: 'url', url: `${server.base}/a` });
    expect(await b.tool('take_snapshot', { pageId })).toMatch(/heading "A"/);
  });
}

test('A5(개발 실행): 앱이 꺼져 있으면 이유를 stderr에 쓰고 0이 아닌 코드로 끝난다', async () => {
  const proc = spawn(process.execPath, [CLI], { env: { ...process.env, AGENT_BROWSER_PROFILE: join(profileOf(app), 'nowhere') }, stdio: ['pipe', 'pipe', 'pipe'] });
  running.push(proc);
  let err = '';
  proc.stderr!.on('data', (d: Buffer) => { err += d.toString(); });
  const code = await new Promise<number | null>((ok) => proc.on('exit', (c) => ok(c)));
  expect(code).not.toBe(0);
  expect(err).toMatch(/꺼져 있다/);
});

test('B5(spec-company-setup): initialize 응답 안내에 agent-browser 사용 안내가 앞에 붙고 원래 안내는 남는다', async () => {
  const direct = await McpClient.start((await createSession(app)).browserUrl);
  const original = direct.initResult.instructions;
  direct.stop();
  const mcp = await attach();
  const instructions = mcp.initResult.instructions ?? '';
  expect(instructions.startsWith(AGENT_BROWSER_GUIDE)).toBe(true);
  if (original) expect(instructions).toContain(original);
  // 안내를 붙여도 도구는 그대로 쓴다
  expect(await mcp.tool('list_pages')).toContain('about:blank');
});
