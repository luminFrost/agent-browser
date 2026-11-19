import { describe, expect, it } from 'vitest';
import { AGENT_BROWSER_GUIDE, APP_READY_WAIT_MS, connect, initializeId, mcpArgs, withGuide, type AttachDeps, type HeldSession } from './attach';

const CONTROL = { port: 1234, token: 't' };
const held = (id = 's1'): HeldSession => ({ id, browserUrl: `http://127.0.0.1:9/${id}/`, close: () => undefined, closed: new Promise(() => undefined) });

/** 흉내 낸 앱: 켜져 있는지, 켜라고 하면 언제 준비되는지. sleep만 시간을 흐르게 한다 */
function world(opts: { running?: boolean; staleFile?: boolean; readyAfterMs?: number } = {}) {
  const s = { t: 0, running: opts.running ?? false, started: 0, readyAt: undefined as number | undefined, opened: 0 };
  const tick = () => { if (s.readyAt !== undefined && s.t >= s.readyAt) s.running = true; };
  const deps: AttachDeps = {
    readControl: () => { tick(); return s.running || opts.staleFile ? CONTROL : undefined; },
    openSession: async () => { tick(); if (!s.running) return 'unreachable'; s.opened++; return held(); },
    startApp: () => { s.started++; if (opts.readyAfterMs !== undefined) s.readyAt = s.t + opts.readyAfterMs; },
    sleep: async (ms) => { s.t += ms; },
    now: () => s.t,
  };
  return { s, deps };
}

describe('붙이기: 앱 찾기·켜기 (spec-claude-attach A1·A5)', () => {
  it('앱이 켜져 있으면 켜지 않고 바로 붙잡은 세션을 연다', async () => {
    const w = world({ running: true });
    const h = await connect(w.deps);
    expect(h.id).toBe('s1');
    expect(w.s.started).toBe(0);
    expect(w.s.opened).toBe(1);
  });

  it('앱이 꺼져 있으면(제어 파일 없음) 한 번 켜고 준비되면 붙는다', async () => {
    const w = world({ readyAfterMs: 3_000 });
    await connect(w.deps);
    expect(w.s.started).toBe(1);
    expect(w.s.opened).toBe(1);
    expect(w.s.t).toBeLessThan(APP_READY_WAIT_MS);
  });

  it('제어 파일이 남아 있지만 앱이 죽었으면(연결 거부) 켜고 붙는다', async () => {
    const w = world({ staleFile: true, readyAfterMs: 1_000 });
    await connect(w.deps);
    expect(w.s.started).toBe(1);
    expect(w.s.opened).toBe(1);
  });

  it('15초 안에 준비되지 않으면 이유가 담긴 오류로 끝난다', async () => {
    const w = world({ readyAfterMs: APP_READY_WAIT_MS + 1_000 });
    await expect(connect(w.deps)).rejects.toThrow(/15초/);
    expect(w.s.started).toBe(1);
    expect(w.s.t).toBeGreaterThanOrEqual(APP_READY_WAIT_MS);
  });
});

describe('함께 넣은 chrome-devtools-mcp 인자 (spec-claude-attach A7)', () => {
  it('browserUrl을 주고, Google로 보내는 사용 통계와 CrUX 조회를 끈다', () => {
    const args = mcpArgs('http://127.0.0.1:5/x/');
    expect(args).toEqual(expect.arrayContaining(['--no-usage-statistics', '--no-performance-crux']));
    expect(args[args.indexOf('--browserUrl') + 1]).toBe('http://127.0.0.1:5/x/');
  });
});

describe('쓸 때 알 것을 initialize 응답에 덧붙임 (spec-company-setup B5)', () => {
  const init = (instructions?: string) => JSON.stringify({ jsonrpc: '2.0', id: 0, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'x', version: '1' }, ...(instructions ? { instructions } : {}) } });

  it('initialize 응답에 안내를 앞에 붙이고 원래 안내는 남긴다', () => {
    const out = JSON.parse(withGuide(init('원래 안내'), new Set([0]))) as { result: { instructions: string } };
    expect(out.result.instructions.startsWith(AGENT_BROWSER_GUIDE)).toBe(true);
    expect(out.result.instructions).toContain('원래 안내');
  });

  it('원래 안내가 없어도 안내가 들어간다', () => {
    const out = JSON.parse(withGuide(init(), new Set([0]))) as { result: { instructions: string } };
    expect(out.result.instructions).toBe(AGENT_BROWSER_GUIDE);
  });

  it('initialize가 아닌 응답·알림·JSON이 아닌 줄은 그대로 둔다', () => {
    const other = JSON.stringify({ jsonrpc: '2.0', id: 5, result: { content: [] } });
    expect(withGuide(other, new Set([0]))).toBe(other);
    expect(withGuide('not json', new Set([0]))).toBe('not json');
    const note = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/x' });
    expect(withGuide(note, new Set([0]))).toBe(note);
  });

  it('클라이언트가 보낸 initialize 요청의 id를 알아낸다', () => {
    expect(initializeId(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'initialize', params: {} }))).toBe(7);
    expect(initializeId(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' }))).toBeUndefined();
    expect(initializeId('garbage')).toBeUndefined();
  });

  it('안내에 이 브라우저를 쓸 때 알아야 할 것이 있다', () => {
    for (const must of ['agent-browser', '이 세션 전용 탭', '사람 창 안', '패널에서 이 세션을 멈췄거나', '사람', '허용', 'emulate', '/mcp', 'fetch', '스스로 판단']) expect(AGENT_BROWSER_GUIDE).toContain(must);
  });
});
