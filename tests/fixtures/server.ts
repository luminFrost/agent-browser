import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  base: string;
  /** 서버가 받은 요청 기록 ("METHOD /path") */
  hits: string[];
  close(): Promise<void>;
}

const html = (title: string, body: string) => `<!doctype html><title>${title}</title><body>${body}</body>`;

const readBody = (req: IncomingMessage) => new Promise<string>((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });

/** 로컬 테스트 서버. 127.0.0.1의 빈 포트에 뜬다. */
export async function startTestServer(): Promise<TestServer> {
  const hits: string[] = [];
  const server: Server = createServer(async (req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const cookies = req.headers.cookie ?? '';
    switch (url.pathname) {
      case '/a': return res.end(html('Page A', '<h1>A</h1><a id="to-b" href="/b">b</a>'));
      case '/b': return res.end(html('Page B', '<h1>B</h1>'));
      case '/slow': return setTimeout(() => res.end(html('Slow', 'done')), Number(url.searchParams.get('ms') ?? 1500));
      case '/login': {
        if (req.method === 'POST') {
          await readBody(req);
          res.setHeader('set-cookie', 'sid=ok; Path=/; Max-Age=86400; HttpOnly');
          res.writeHead(303, { location: '/me' });
          return res.end();
        }
        return res.end(html('Login', '<form method="post" action="/login"><button id="go">login</button></form>'));
      }
      case '/me': return res.end(html('Me', cookies.includes('sid=ok') ? '<p id="state">logged-in</p>' : '<p id="state">anonymous</p>'));
      case '/form': return res.end(html('Form', '<form method="post" action="/submit"><input name="a" value="1"><button id="submit">go</button></form>'));
      case '/submit': await readBody(req); return res.end(html('Submitted', 'received'));
      case '/slowfile': {
        // 응답 헤더를 늦게 보내는 다운로드(응답 전에 탭을 닫는 경우)
        return setTimeout(() => {
          res.setHeader('content-type', 'application/octet-stream');
          res.setHeader('content-disposition', 'attachment; filename="sneaky.bin"');
          res.end(Buffer.alloc(1000, 2));
        }, Number(url.searchParams.get('ms') ?? 1500));
      }
      case '/frameform': return res.end(html('Frame form', '<iframe name="x"></iframe><form method="post" action="/submit" target="x"><input name="a" value="1"><button id="submit">go</button></form>'));
      case '/file': {
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-disposition', 'attachment; filename="data.bin"');
        return res.end(Buffer.alloc(200_000, 1));
      }
      default: res.statusCode = 404; return res.end(html('404', 'not found'));
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()); }),
  };
}
