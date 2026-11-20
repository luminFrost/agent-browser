import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { request as httpRequest } from 'node:http';
import { launch, sessionIds } from './helpers';
import type { RunningApp } from '../../src/launcher/app';

let app: RunningApp;
test.beforeEach(async () => { app = await launch(); });
test.afterEach(async () => { await app.stop(); });

const control = () => JSON.parse(readFileSync(app.controlFile, 'utf8')) as { port: number; token: string };
const post = (path: string, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${control().port}${path}`, { method: 'POST', headers });
const windows = async () => (await app.request({ type: 'listWindows' }, 'windows')).windows;

test('R3: 제어 파일은 권한 0600이고 포트와 토큰이 들어 있다', async () => {
  expect(statSync(app.controlFile).mode & 0o777).toBe(0o600);
  const c = control();
  expect(c.port).toBeGreaterThan(0);
  expect(c.token.length).toBeGreaterThanOrEqual(43);
});

test('R1·R3·E1: 토큰을 붙여 POST /sessions → 201 {id}, 새 창 없이 세션이 1개 생긴다', async () => {
  const res = await post('/sessions', { authorization: `Bearer ${control().token}` });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  expect(body.id).toMatch(/^[A-Za-z0-9_-]{8,}$/);
  expect(await windows()).toEqual([{ kind: 'human' }]);
  expect(await sessionIds(app)).toEqual([body.id]);
  const res2 = await post('/sessions', { authorization: `Bearer ${control().token}` });
  const body2 = (await res2.json()) as { id: string };
  expect(body2.id).not.toBe(body.id);
  expect(await windows()).toEqual([{ kind: 'human' }]);
  expect(await sessionIds(app)).toHaveLength(2);
});

test('R10: 토큰이 없거나 틀리면 401이고 세션이 생기지 않는다', async () => {
  expect((await post('/sessions')).status).toBe(401);
  expect((await post('/sessions', { authorization: 'Bearer wrong' })).status).toBe(401);
  const token = control().token;
  const oneCharOff = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'); // 마지막 한 글자만 다른 토큰
  expect((await post('/sessions', { authorization: `Bearer ${oneCharOff}` })).status).toBe(401);
  expect(await windows()).toEqual([{ kind: 'human' }]);
  expect(await sessionIds(app)).toEqual([]);
});

test('R10: 제어 포트는 127.0.0.1에만 열려 외부 인터페이스 IP로는 연결되지 않는다', async () => {
  const external = Object.values(networkInterfaces()).flat().filter((i) => i && !i.internal && i.family === 'IPv4').map((i) => i!.address);
  // 외부 인터페이스가 없는 기기에서는 시도할 주소가 없다. 그 경우에도 아래 localhost 확인은 한다.
  for (const host of external) {
    const outcome = await new Promise<string>((resolve) => {
      const req = httpRequest({ host, port: control().port, path: '/sessions', method: 'POST', timeout: 2000 }, (res) => resolve(`status ${res.statusCode}`));
      req.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
      req.on('timeout', () => { req.destroy(); resolve('timeout'); });
      req.end();
    });
    expect(outcome, `${host}로 접속`).toMatch(/ECONNREFUSED|timeout|EHOSTUNREACH|ENETUNREACH/);
  }
  expect((await post('/sessions')).status).toBe(401); // 127.0.0.1로는 응답한다
});

test('GET /sessions: 살아 있는 세션 id 목록이 브라우저의 세션과 같다(만들기·닫기를 따라간다)', async () => {
  const auth = { authorization: `Bearer ${control().token}` };
  const list = async () => ((await (await fetch(`http://127.0.0.1:${control().port}/sessions`, { headers: auth })).json()) as { sessions: { id: string }[] }).sessions.map((s) => s.id).sort();
  expect(await list()).toEqual([]);
  const a = ((await (await post('/sessions', auth)).json()) as { id: string }).id;
  const b = ((await (await post('/sessions', auth)).json()) as { id: string }).id;
  expect(await list()).toEqual([a, b].sort());
  expect(await list()).toEqual((await sessionIds(app)).sort());
  await fetch(`http://127.0.0.1:${control().port}/sessions/${a}`, { method: 'DELETE', headers: auth });
  expect(await list()).toEqual([b]);
});

test('없는 경로·잘못된 메서드는 404/405', async () => {
  const auth = { authorization: `Bearer ${control().token}` };
  expect((await post('/nope', auth)).status).toBe(404);
  expect((await fetch(`http://127.0.0.1:${control().port}/sessions`, { method: 'PUT', headers: auth })).status).toBe(405);
});
