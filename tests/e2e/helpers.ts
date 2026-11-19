import { mkdtempSync, readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp, type RunningApp, type StartOptions } from '../../src/launcher/app';

export const tempDir = (prefix = 'ab-') => mkdtempSync(join(tmpdir(), prefix));

/** AB_TEST_SHOW=1이면 창을 보이게 띄운다. 숨긴 창을 그리지 않는 환경(Linux Xvfb)에서 화면·스크린샷 확인용 */
export async function launch(options: Partial<StartOptions> = {}): Promise<RunningApp> {
  return startApp({ userDataDir: tempDir(), hidden: process.env.AB_TEST_SHOW !== '1', ...options });
}

/** 브라우저 main에 살아 있는 에이전트 세션 id (spec-embedded-sessions E1) */
export async function sessionIds(app: RunningApp): Promise<string[]> {
  return (await app.request({ type: 'listSessions' }, 'sessions')).sessionIds;
}

/** 사람 창 왼쪽 영역에 지금 보이는 탭: 사람 탭이면 view 'human', 세션 탭이면 그 세션 id와 targetId (E2) */
export async function shown(app: RunningApp) {
  return app.request({ type: 'shownTab' }, 'shownTab');
}

export interface TargetInfo { targetId: string; type: string; url: string; title: string }

export async function targets(app: RunningApp): Promise<TargetInfo[]> {
  const r = await app.rawCdp.send('Target.getTargets');
  return r.targetInfos as TargetInfo[];
}

/** 원본 CDP로 대상 페이지에 붙어 식을 평가한다(테스트 전용, ADR-0002). */
export async function evaluate<T = unknown>(app: RunningApp, targetId: string, expression: string): Promise<T> {
  const { sessionId } = await app.rawCdp.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    const r = await app.rawCdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId as string);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return (r.result as { value: T }).value;
  } finally {
    await app.rawCdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
  }
}

/** 조건이 참이 될 때까지 기다린다. */
export async function waitFor<T>(fn: () => Promise<T | undefined | false>, what: string, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < until) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`기다렸지만 안 됨: ${what}${last ? ` (마지막 오류: ${String(last)})` : ''}`);
}

/** 사람 창의 UI(주소창·탭 막대) 페이지 */
export async function humanUi(app: RunningApp): Promise<TargetInfo> {
  return waitFor(async () => {
    const t = (await targets(app)).find((x) => x.url.includes('/renderer/human/index.html'));
    return t && (await evaluate<boolean>(app, t.targetId, `!!document.querySelector('#address') && document.readyState === 'complete'`)) ? t : undefined;
  }, '사람 창 UI');
}

export interface SessionInfo { id: string; browserUrl: string }

/** 제어 파일의 토큰으로 세션을 만든다 */
export async function createSession(app: RunningApp): Promise<SessionInfo> {
  const { port, token } = JSON.parse(readFileSync(app.controlFile, 'utf8')) as { port: number; token: string };
  const res = await fetch(`http://127.0.0.1:${port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (res.status !== 201) throw new Error(`세션 생성 실패: ${res.status}`);
  return (await res.json()) as SessionInfo;
}

/** 아주 작은 CDP WebSocket 클라이언트(테스트용) */
export class CdpClient {
  private nextId = 1;
  private readonly waiters = new Map<number, (m: { result?: Record<string, unknown>; error?: { message: string } }) => void>();
  readonly events: { method: string; params: Record<string, unknown>; sessionId?: string }[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const m = JSON.parse(data.toString());
      if (m.id !== undefined) this.waiters.get(m.id)?.(m);
      else this.events.push(m);
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(url);
      ws.once('open', () => ok(new CdpClient(ws)));
      ws.once('error', fail);
      ws.once('unexpected-response', (_req, res) => fail(new Error(`HTTP ${res.statusCode}`)));
    });
  }

  /** 응답 전체(result 또는 error)를 돌려준다 */
  call(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const id = this.nextId++;
    return new Promise<{ result?: Record<string, unknown>; error?: { message: string } }>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error(`${method} 응답 없음`)), 10_000);
      this.waiters.set(id, (m) => { clearTimeout(timer); ok(m); });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** 성공을 기대하는 호출 */
  async send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const r = await this.call(method, params, sessionId);
    if (r.error) throw new Error(`${method}: ${r.error.message}`);
    return r.result ?? {};
  }

  close() { this.ws.close(); }
}

export interface ApprovalView { id: string; sessionId: string; host: string; kind: string; text: string }

/** 사람 창 패널의 승인 요청 목록(R12·R13) */
export async function approvals(app: RunningApp): Promise<ApprovalView[]> {
  return evaluate<ApprovalView[]>(app, (await humanUi(app)).targetId, `[...document.querySelectorAll('#approvals .approval')].map(a => ({ id: a.dataset.id, sessionId: a.dataset.sessionId, host: a.dataset.host, kind: a.dataset.kind, text: a.textContent }))`);
}

/** 승인 요청에 허용/거부를 누른다 */
export async function decide(app: RunningApp, id: string, choice: 'allow' | 'deny'): Promise<void> {
  await evaluate(app, (await humanUi(app)).targetId, `document.querySelector('#approvals .approval[data-id="${id}"] .${choice}').click()`);
}
