import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocketServer } from 'ws';
import { LOOPBACK } from '../control/server';
import { Connection } from './connection';
import type { Router } from './router';
import type { SessionScope } from './scope';

const SECRET_BYTES = 24;
/** DNS rebinding 방지: 이 이름으로 온 요청만 받는다 */
const ALLOWED_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

export interface BrowserVersion {
  product: string;
  protocolVersion: string;
  userAgent: string;
  jsVersion: string;
  revision: string;
}

export interface SessionEndpoint {
  browserUrl: string;
  close(): Promise<void>;
}

/**
 * 세션 하나의 CDP 엔드포인트: `http://127.0.0.1:<port>/<secret>/` (ADR-0003).
 * 비밀 경로가 맞지 않거나 Host가 이상하면 거부한다(R10).
 */
export async function startSessionEndpoint(scope: SessionScope, router: Router, version: BrowserVersion): Promise<SessionEndpoint> {
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const browserId = randomUUID();
  const prefix = `/${secret}/`;
  const wss = new WebSocketServer({ noServer: true });
  let port = 0;
  const wsBase = () => `ws://127.0.0.1:${port}/${secret}/devtools`;

  /** 비밀 경로 뒤의 경로(앞의 /<secret> 뺀 것). 맞지 않으면 undefined */
  const innerPath = (req: IncomingMessage): string | undefined => {
    if (!ALLOWED_HOST.test(req.headers.host ?? '')) return undefined;
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    return path.startsWith(prefix) ? path.slice(prefix.length - 1).replace(/\/+$/, '') : undefined;
  };

  const json = (res: ServerResponse, body: unknown) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    if (!ALLOWED_HOST.test(req.headers.host ?? '')) { res.writeHead(403); return res.end(); }
    const path = innerPath(req);
    if (path === '/json/version') {
      return json(res, {
        Browser: version.product,
        'Protocol-Version': version.protocolVersion,
        'User-Agent': version.userAgent,
        'V8-Version': version.jsVersion,
        'WebKit-Version': version.revision,
        webSocketDebuggerUrl: `${wsBase()}/browser/${browserId}`,
      });
    }
    if (path === '/json/list' || path === '/json') {
      const pages = [...scope.targets]
        .map((id) => router.targetInfos.get(id))
        .filter((t) => t?.type === 'page')
        .map((t) => ({ description: '', id: t!.targetId, title: t!.title, type: t!.type, url: t!.url, webSocketDebuggerUrl: `${wsBase()}/page/${t!.targetId}` }));
      return json(res, pages);
    }
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket: Socket, head) => {
    const path = innerPath(req);
    const pageTarget = path?.startsWith('/devtools/page/') ? path.slice('/devtools/page/'.length) : undefined;
    const isBrowser = path === `/devtools/browser/${browserId}`;
    if (!isBrowser && !(pageTarget && scope.owns(pageTarget))) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = new Connection(ws, scope, router, pageTarget);
      conn.init().catch(() => conn.close());
    });
  });

  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(0, LOOPBACK, ok); });
  port = (server.address() as AddressInfo).port;

  return {
    browserUrl: `http://127.0.0.1:${port}/${secret}/`,
    close: async () => {
      for (const c of [...scope.connections]) c.close();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
