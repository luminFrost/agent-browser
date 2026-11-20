import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { startControlServer, type ControlServer } from './server';

const TOKEN = 'test-token';

/** 흉내 낸 세션 저장소. 만들기를 늦출 수 있다 */
function fakeHandlers(createDelayMs = 0) {
  const live = new Set<string>();
  const labels = new Map<string, string>();
  const closed: string[] = [];
  let n = 0;
  return {
    live,
    closed,
    handlers: {
      async createSession(opts: { label?: string } = {}) {
        const id = `s${++n}`;
        await new Promise((r) => setTimeout(r, createDelayMs));
        live.add(id);
        if (opts.label !== undefined) labels.set(id, opts.label);
        return { id, browserUrl: `http://127.0.0.1:1/${id}/`, ...(opts.label !== undefined ? { label: opts.label } : {}) };
      },
      async closeSession(id: string) {
        if (!live.delete(id)) return false;
        closed.push(id);
        return true;
      },
      listSessions() { return [...live].map((id) => ({ id, ...(labels.has(id) ? { label: labels.get(id) } : {}) })); },
    },
  };
}

const waitUntil = async (fn: () => boolean, what: string) => {
  const until = Date.now() + 2_000;
  while (!fn()) {
    if (Date.now() > until) throw new Error(`기다렸지만 안 됨: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

let server: ControlServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

const call = (method: string, path: string, auth: string | null = `Bearer ${TOKEN}`) =>
  fetch(`http://127.0.0.1:${server!.port}${path}`, { method, headers: auth ? { authorization: auth } : {} });

describe('세션 닫기 API (spec-claude-attach A4)', () => {
  it('토큰과 함께 DELETE /sessions/<id> → 204, 그 세션을 닫는다', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    const { id } = (await (await call('POST', '/sessions')).json()) as { id: string };
    const res = await call('DELETE', `/sessions/${id}`);
    expect(res.status).toBe(204);
    expect(f.closed).toEqual([id]);
  });

  it('없는 id → 404', async () => {
    server = await startControlServer(TOKEN, 0, fakeHandlers().handlers);
    expect((await call('DELETE', '/sessions/nope')).status).toBe(404);
  });

  it('토큰이 없거나 틀리면 401이고 닫지 않는다', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    const { id } = (await (await call('POST', '/sessions')).json()) as { id: string };
    expect((await call('DELETE', `/sessions/${id}`, null)).status).toBe(401);
    expect((await call('DELETE', `/sessions/${id}`, 'Bearer wrong')).status).toBe(401);
    expect(f.closed).toEqual([]);
  });
});

describe('세션 목록 API (살아 있는 세션 확인, 묶은 앱 시험 A3)', () => {
  it('토큰과 함께 GET /sessions → 200, 살아 있는 세션 id 목록', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    expect(await (await call('GET', '/sessions')).json()).toEqual({ sessions: [] });
    const a = (await (await call('POST', '/sessions')).json()) as { id: string };
    const b = (await (await call('POST', '/sessions')).json()) as { id: string };
    await call('DELETE', `/sessions/${a.id}`);
    const res = await call('GET', '/sessions');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessions: [{ id: b.id }] });
  });

  it('토큰이 없으면 401, browserUrl은 주지 않는다', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    await call('POST', '/sessions');
    expect((await call('GET', '/sessions', null)).status).toBe(401);
    expect(JSON.stringify(await (await call('GET', '/sessions')).json())).not.toContain('browserUrl');
  });
});

describe('세션 이름 (카드 20261120-session-labels L2·L6)', () => {
  it('POST /sessions?label=… 은 정리한 이름으로 만들고, GET /sessions에 이름이 나온다', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    const made = (await (await call('POST', `/sessions?label=${encodeURIComponent('  주문\u0000 관리 ')}`)).json()) as { id: string; label?: string };
    expect(made.label).toBe('주문 관리');
    const plain = (await (await call('POST', '/sessions?label=%20%20')).json()) as { id: string; label?: string };
    expect(plain.label).toBeUndefined();
    expect(await (await call('GET', '/sessions')).json()).toEqual({ sessions: [{ id: made.id, label: '주문 관리' }, { id: plain.id }] });
  });
});

describe('붙잡은 세션 (spec-claude-attach A3 다)', () => {
  /** POST /sessions?hold=1을 열고 첫 줄(JSON)을 받는다. 연결은 열어 둔다 */
  const hold = () => new Promise<{ info: { id: string; browserUrl: string }; drop: () => void }>((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: server!.port, path: '/sessions?hold=1', method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } }, (res) => {
      if (res.statusCode !== 201) fail(new Error(`status ${res.statusCode}`));
      let buf = '';
      res.on('data', (d: Buffer) => {
        buf += d.toString();
        const i = buf.indexOf('\n');
        if (i >= 0) ok({ info: JSON.parse(buf.slice(0, i)), drop: () => req.destroy() });
      });
      res.on('error', () => undefined);
    });
    req.on('error', () => undefined);
    req.end();
  });

  it('첫 줄로 id·browserUrl을 주고, 연결이 열려 있는 동안 세션을 닫지 않는다', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    const h = await hold();
    expect(h.info.browserUrl).toContain(h.info.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(f.closed).toEqual([]);
    h.drop();
  });

  it('붙잡은 연결이 끊기면(프로세스 강제 종료 등) 세션을 닫는다', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    const h = await hold();
    h.drop();
    await waitUntil(() => f.closed.includes(h.info.id), '끊기면 닫힘');
  });

  it('만들어지는 중에 연결이 끊기면 다 만든 뒤 바로 닫는다', async () => {
    const f = fakeHandlers(200);
    server = await startControlServer(TOKEN, 0, f.handlers);
    const req = request({ host: '127.0.0.1', port: server.port, path: '/sessions?hold=1', method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } });
    req.on('error', () => undefined);
    req.end();
    await new Promise((r) => setTimeout(r, 50));
    req.destroy();
    await waitUntil(() => f.closed.length === 1 && f.live.size === 0, '만든 뒤 닫힘');
  });

  it('붙잡지 않은 POST는 응답이 끝나도 세션을 닫지 않는다(기존 동작)', async () => {
    const f = fakeHandlers();
    server = await startControlServer(TOKEN, 0, f.handlers);
    await (await call('POST', '/sessions')).json();
    await new Promise((r) => setTimeout(r, 100));
    expect(f.closed).toEqual([]);
  });
});
