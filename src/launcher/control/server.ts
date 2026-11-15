import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAuthorized } from './auth';

/** 제어 서버와 세션 엔드포인트는 이 주소에만 연다(spec 보안 제약, R10) */
export const LOOPBACK = '127.0.0.1';

export interface ControlHandlers {
  createSession(): Promise<{ id: string; browserUrl?: string }>;
  /** 세션을 닫는다. 없는 세션이면 false */
  closeSession(id: string): Promise<boolean>;
}

const SESSION_PATH = /^\/sessions\/([^/]+)$/;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export interface ControlServer {
  port: number;
  close(): Promise<void>;
}

export async function startControlServer(token: string, port: number, handlers: ControlHandlers): Promise<ControlServer> {
  /**
   * 붙잡은 세션(spec-claude-attach A3): 첫 줄로 세션 정보를 주고 응답을 열어 둔다.
   * 연결이 어떻게 끊기든(프로세스 강제 종료 포함) 세션을 닫는다. 만드는 중에 끊겨도 다 만든 뒤 닫는다
   */
  const hold = async (req: IncomingMessage, res: ServerResponse) => {
    const state: { gone: boolean; id?: string } = { gone: false };
    res.on('close', () => { state.gone = true; if (state.id) handlers.closeSession(state.id).catch(() => undefined); });
    const session = await handlers.createSession();
    state.id = session.id;
    if (state.gone) { await handlers.closeSession(session.id).catch(() => undefined); return; }
    res.writeHead(201, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify(session) + '\n');
    req.socket.setKeepAlive(true);
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    if (!isAuthorized(req.headers.authorization, token)) return json(res, 401, { error: 'unauthorized' });
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/sessions') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      if (new URL(req.url ?? '/', 'http://localhost').searchParams.get('hold') === '1') return hold(req, res);
      return json(res, 201, await handlers.createSession());
    }
    const one = SESSION_PATH.exec(path);
    if (one) {
      if (req.method !== 'DELETE') return json(res, 405, { error: 'method not allowed' });
      if (!(await handlers.closeSession(decodeURIComponent(one[1])))) return json(res, 404, { error: 'no such session' });
      res.writeHead(204).end();
      return;
    }
    return json(res, 404, { error: 'not found' });
  };

  const server: Server = createServer((req, res) => {
    route(req, res).catch((e: unknown) => json(res, 500, { error: e instanceof Error ? e.message : String(e) }));
  });
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(port, LOOPBACK, ok); });
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()); }),
  };
}
