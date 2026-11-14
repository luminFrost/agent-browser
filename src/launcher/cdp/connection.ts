import type WebSocket from 'ws';
import type { CdpMessage } from '../cdpPipe';
import { browserLevelAction, sessionLevelBlockReason } from './policy';
import type { Router } from './router';
import type { SessionScope } from './scope';
import { blockedError, type ClientRequest } from './types';

/** 정책 위반으로 끊을 때 쓰는 WebSocket 종료 코드 */
const WS_POLICY_VIOLATION = 1008;

const isRequest = (v: unknown): v is ClientRequest => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Number.isInteger(r.id) && typeof r.method === 'string'
    && (r.sessionId === undefined || typeof r.sessionId === 'string')
    && (r.params === undefined || (typeof r.params === 'object' && r.params !== null && !Array.isArray(r.params)));
};

/**
 * 에이전트 클라이언트의 WebSocket 연결 하나. 그 세션 범위 밖의 대상은 보이지도 닿지도 않게 한다.
 * pinnedTargetId가 있으면 페이지 WebSocket(/devtools/page/<id>)이다: 그 탭의 세션에 고정된다.
 */
export class Connection {
  closed = false;
  /** 이 연결이 가진 CDP sessionId들 */
  readonly sessions = new Set<string>();
  private pinnedSession?: string;
  private readonly queue: string[] = [];
  private ready: boolean;

  constructor(private readonly ws: WebSocket, readonly scope: SessionScope, private readonly router: Router, private readonly pinnedTargetId?: string) {
    this.ready = !pinnedTargetId;
    scope.connections.add(this);
    ws.on('message', (data) => (this.ready ? this.onClientMessage(data.toString()) : this.queue.push(data.toString())));
    ws.on('close', () => this.dispose());
    ws.on('error', () => this.dispose());
  }

  /** 페이지 WebSocket이면 그 탭에 먼저 붙는다 */
  async init(): Promise<void> {
    if (!this.pinnedTargetId) return;
    const { sessionId } = await this.router.call(this, 'Target.attachToTarget', { targetId: this.pinnedTargetId, flatten: true });
    this.pinnedSession = sessionId as string;
    this.ready = true;
    for (const raw of this.queue.splice(0)) this.onClientMessage(raw);
  }

  sendToClient(m: CdpMessage): void {
    if (this.closed) return;
    const out = this.pinnedSession && m.sessionId === this.pinnedSession ? { ...m, sessionId: undefined } : m;
    this.ws.send(JSON.stringify(out));
  }

  /** 라우터가 이 연결 몫이라고 정한 이벤트 */
  deliverEvent(m: CdpMessage): void {
    if (this.pinnedTargetId && !m.sessionId) return; // 페이지 WebSocket에는 브라우저 수준 이벤트를 주지 않는다
    this.sendToClient(m);
  }

  /** 범위에 탭이 생겼다(T5에서 discover·autoAttach 흉내) */
  onTargetAdded(_targetId: string): void { /* T5 */ }
  onTargetRemoved(_targetId: string): void { /* T5 */ }
  onTargetEvent(_m: CdpMessage): void { /* T5 */ }

  close(): void {
    this.ws.close();
    this.dispose();
  }

  private dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.scope.connections.delete(this);
    this.router.release(this);
  }

  private reply(req: ClientRequest, result: Record<string, unknown>): void {
    this.sendToClient({ id: req.id, result, ...(req.sessionId ? { sessionId: req.sessionId } : {}) });
  }

  private refuse(req: ClientRequest, reason: string): void {
    this.sendToClient({ id: req.id, error: blockedError(reason), ...(req.sessionId ? { sessionId: req.sessionId } : {}) });
  }

  private onClientMessage(raw: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    if (!isRequest(parsed)) {
      this.ws.close(WS_POLICY_VIOLATION, 'invalid CDP message');
      return this.dispose();
    }
    const req: ClientRequest = this.pinnedSession && !parsed.sessionId ? { ...parsed, sessionId: this.pinnedSession } : parsed;
    if (req.sessionId) this.handleSessionLevel(req);
    else this.handleBrowserLevel(req);
  }

  private handleSessionLevel(req: ClientRequest): void {
    if (this.router.ownerOf(req.sessionId as string) !== this) return this.refuse(req, '이 연결의 세션이 아니다');
    const reason = sessionLevelBlockReason(req.method, req.params);
    if (reason) return this.refuse(req, reason);
    this.router.forward(this, req);
  }

  private handleBrowserLevel(req: ClientRequest): void {
    const action = browserLevelAction(req.method);
    const params = req.params ?? {};
    switch (action) {
      case undefined:
        return this.refuse(req, `허용하지 않는 브라우저 수준 명령: ${req.method}`);
      case 'forward':
        return this.router.forward(this, req);
      case 'forwardOwnTarget':
        if (params.targetId !== undefined && !this.scope.owns(params.targetId)) return this.refuse(req, '이 세션의 탭이 아니다');
        return this.router.forward(this, req);
      case 'requireOwnTarget':
        if (!this.scope.owns(params.targetId)) return this.refuse(req, '이 세션의 탭이 아니다');
        return this.router.forward(this, req);
      case 'attach':
        if (!this.scope.owns(params.targetId)) return this.refuse(req, '이 세션의 탭이 아니다');
        if (params.flatten !== true) return this.refuse(req, 'flatten 모드(flatten: true)만 지원한다');
        return this.router.forward(this, req);
      case 'detach':
        if (typeof params.sessionId !== 'string' || this.router.ownerOf(params.sessionId) !== this) return this.refuse(req, '이 연결의 세션이 아니다');
        return this.router.forward(this, req);
      case 'getTargets':
        return this.reply(req, { targetInfos: this.ownTargetInfos() });
      case 'ignore':
        return this.reply(req, {});
    }
  }

  ownTargetInfos() {
    return [...this.scope.targets].map((id) => this.router.targetInfos.get(id)).filter((t) => t !== undefined);
  }
}
