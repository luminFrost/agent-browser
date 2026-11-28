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
      case '/csp':
        res.setHeader('content-security-policy', "img-src 'none'; report-uri /csp-report");
        return res.end(html('CSP', '<img src="/blocked.png">'));
      case '/csp-report': await readBody(req); res.statusCode = 204; return res.end();
      case '/widgets': return res.end(html('Widgets', `
        <label>name <input id="name"></label>
        <button id="go" onclick="document.getElementById('out').textContent = 'hello ' + document.getElementById('name').value">go</button>
        <button id="alert" onclick="document.getElementById('out').textContent = String(confirm('ok?'))">ask</button>
        <a id="to-b" href="/b">to b</a>
        <input id="file" type="file">
        <p id="out"></p>
        <script>console.log('widgets ready')</script>`));
      // 카드 20261122-agent-input-lock: 왼쪽 위(1px 점 자리)부터 덮는 입력 칸과 사건 기록
      case '/input': return res.end(html('Input', '<input id="i" style="position:fixed;left:0;top:0;width:100%;height:120px;margin:0;border:0"><script>window.ev = []; for (const t of ["mousedown", "keydown"]) addEventListener(t, () => ev.push(t), true);</script>'));
      // 카드 20261127-page-devtools: 오른쪽 클릭 메뉴 자리(링크 0,0~200,40 / 이미지 0,60~40,100 / 입력 칸 0,120~200,150 / 빈 곳 300,300). 받은 이벤트를 ev에 적는다
      case '/menu': return res.end(html('Menu', '<a id="l" href="/b" style="position:fixed;left:0;top:0;width:200px;height:40px;display:block">link</a><img id="img" src="/icon.png" style="position:fixed;left:0;top:60px;width:40px;height:40px"><input id="t" style="position:fixed;left:0;top:120px;width:200px;height:30px"><script>window.ev = []; for (const t of ["contextmenu", "mousedown"]) addEventListener(t, () => ev.push(t), true);</script>'));
      // 카드 20261128-find-zoom: 찾기용 글자(apple 3번, 대소문자 섞음)
      case '/find': return res.end(html('Find', '<p>apple banana Apple cherry</p><p>pineAPPLE grape</p>'));
      case '/a': return res.end(html('Page A', '<h1>A</h1><a id="to-b" href="/b">b</a>'));
      case '/b': return res.end(html('Page B', '<h1>B</h1>'));
      // 카드 20261127-bookmark-folders G1: 사이트 아이콘이 있는 페이지
      // <link rel=icon>은 head에 있어야 Chromium이 그 아이콘을 알린다(body에 두면 /favicon.ico를 알린다). /favicon.ico는 없다(404)
      case '/icon-page': return res.end('<!doctype html><title>Icon Page</title><link rel="icon" href="/icon.png"><body><h1>I</h1></body>');
      // 검토 Major: 아이콘 크기 상한(64KB)을 넘는 아이콘. 길이 머리 없이 조각으로 보낸다(받는 중에 멈춰야 한다)
      case '/big-icon-page': return res.end('<!doctype html><title>Big Icon</title><link rel="icon" href="/big.png"><body><h1>B</h1></body>');
      case '/big.png':
        res.setHeader('content-type', 'image/png');
        for (let i = 0; i < 20; i++) res.write(Buffer.alloc(16 * 1024));
        return res.end();
      case '/icon.png':
        res.setHeader('content-type', 'image/png');
        return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));
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
      case '/objform': return res.end(html('Object form', '<object name="o" data="about:blank" type="text/html"></object><form method="post" action="/submit" target="o"><input name="a" value="1"><button id="submit">go</button></form>'));
      case '/popupdownload': return res.end(html('Popup download', '<button id="go" onclick="const w = window.open(\'/file\'); setTimeout(() => w && w.close(), 50)">dl</button>'));
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
