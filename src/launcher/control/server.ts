import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAuthorized } from './auth';

/** 제어 서버와 세션 엔드포인트는 이 주소에만 연다(spec 보안 제약, R10) */
export const LOOPBACK = '127.0.0.1';

export interface ControlHandlers {
  createSession(): Promise<{ id: string; browserUrl?: string }>;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export interface ControlServer {
  port: number;
  close(): Promise<void>;
}

export async function startControlServer(token: string, port: number, handlers: ControlHandlers): Promise<ControlServer> {
  const route = async (req: IncomingMessage, res: ServerResponse) => {
    if (!isAuthorized(req.headers.authorization, token)) return json(res, 401, { error: 'unauthorized' });
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/sessions') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      return json(res, 201, await handlers.createSession());
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
