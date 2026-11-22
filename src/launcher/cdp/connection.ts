import type WebSocket from 'ws';
import type { CdpMessage } from '../cdpPipe';
import { browserLevelAction, matchesTargetFilter, sessionLevelBlockReason, type TargetFilterEntry } from './policy';
import type { Router } from './router';
import type { SessionScope } from './scope';
import { blockedError, type ClientRequest } from './types';
import { isAgentNavigable } from '../../shared/url';

/** 에이전트 입력 알림 번호(모든 연결에서 겹치지 않게) */
let nextInputId = 1;

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
  /** setDiscoverTargets 흉내 상태와, targetCreated를 이미 보낸 탭 */
  private discover?: { filter?: TargetFilterEntry[] };
  private readonly announced = new Set<string>();
  /** setAutoAttach 흉내 상태와, 이미 대신 붙은 탭 */
  private autoAttach?: { filter?: TargetFilterEntry[] };
  private readonly autoAttached = new Set<string>();
  private readonly queue: string[] = [];
  /** 클라이언트 메시지를 받은 순서대로 처리한다(입력 알림을 기다리는 동안 뒤 명령이 앞지르지 않게) */
  private chain: Promise<void> = Promise.resolve();
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

  /** 범위에 탭이 생겼다: discover면 targetCreated, autoAttach면 대신 붙는다 */
  async onTargetAdded(targetId: string): Promise<void> {
    this.announceCreated(targetId);
    await this.attachOnBehalf(targetId);
  }

  /** 범위에서 탭이 빠졌다 */
  onTargetRemoved(targetId: string): void {
    if (targetId === this.pinnedTargetId) return this.close(); // 페이지 WebSocket은 그 탭이 닫히면 끊는다(원래 Chrome처럼)
    this.autoAttached.delete(targetId);
    if (this.announced.delete(targetId)) this.sendToClient({ method: 'Target.targetDestroyed', params: { targetId } });
  }

  /** 자기 탭의 targetInfoChanged·targetDestroyed (targetCreated는 소유권이 정해질 때 따로 보낸다) */
  onTargetEvent(m: CdpMessage): void {
    if (!this.discover || this.pinnedTargetId) return;
    const targetId = (m.params?.targetInfo as { targetId?: string } | undefined)?.targetId ?? (m.params?.targetId as string | undefined);
    if (!targetId) return;
    if (m.method === 'Target.targetInfoChanged' && this.announced.has(targetId)) this.sendToClient(m);
    if (m.method === 'Target.targetDestroyed') this.onTargetRemoved(targetId);
  }

  private announceCreated(targetId: string): void {
    if (!this.discover || this.pinnedTargetId || this.announced.has(targetId)) return;
    const info = this.router.targetInfos.get(targetId);
    if (!info || !matchesTargetFilter(info.type, this.discover.filter)) return;
    this.announced.add(targetId);
    this.sendToClient({ method: 'Target.targetCreated', params: { targetInfo: info } });
  }

  /** autoAttach 흉내: 브라우저 수준 setAutoAttach를 넘기지 않고, 자기 탭에만 하나씩 붙는다(design.md) */
  private async attachOnBehalf(targetId: string): Promise<void> {
    if (!this.autoAttach || this.autoAttached.has(targetId) || this.closed) return;
    const info = this.router.targetInfos.get(targetId);
    if (!info || !matchesTargetFilter(info.type, this.autoAttach.filter)) return;
    this.autoAttached.add(targetId);
    // 브라우저가 attachedToTarget 이벤트를 보내고, 라우터가 그것을 이 연결로 보낸다
    await this.router.call(this, 'Target.attachToTarget', { targetId, flatten: true }).catch(() => this.autoAttached.delete(targetId));
  }

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

  /** 정책으로 막는다: 응답한 뒤 onBlocked로 알린다(알림이 실패해도 클라이언트는 응답을 받는다) */
  private refuse(req: ClientRequest, reason: string): void {
    this.fail(req, reason);
    try { this.scope.onBlocked?.(req.method, reason); } catch { /* 알림 쪽 오류는 무시 */ }
  }

  /** 실행 중 실패(정책 거부가 아님). onBlocked로 알리지 않는다 */
  private fail(req: ClientRequest, reason: string): void {
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
    this.chain = this.chain.then(() => (req.sessionId ? this.handleSessionLevel(req) : this.handleBrowserLevel(req))).catch(() => undefined);
  }

  private handleSessionLevel(req: ClientRequest): void | Promise<void> {
    if (this.router.ownerOf(req.sessionId as string) !== this) return this.refuse(req, '이 연결의 세션이 아니다');
    const reason = sessionLevelBlockReason(req.method, req.params);
    if (reason) return this.refuse(req, reason);
    const notify = this.scope.actions.agentInput?.bind(this.scope.actions);
    if (!req.method.startsWith('Input.') || !notify) return this.router.forward(this, req);
    // 에이전트 입력: 브라우저가 이 세션 탭의 마우스를 통과시킨 뒤 보내고, 응답이 오면 다시 막게 한다(카드 20261122-agent-input-lock)
    const inputId = nextInputId++;
    const off = () => { notify(inputId, false).catch(() => undefined); };
    return notify(inputId, true).catch(() => undefined).then(() => {
      if (this.closed) return off();
      this.router.forward(this, req, off);
    });
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
        return this.reply(req, { targetInfos: this.ownTargetInfos().filter((t) => matchesTargetFilter(t.type, params.filter as TargetFilterEntry[] | undefined)) });
      case 'ignore':
        return this.reply(req, {});
      case 'setDiscoverTargets':
        this.discover = params.discover === true ? { filter: params.filter as TargetFilterEntry[] | undefined } : undefined;
        if (!this.discover) this.announced.clear();
        this.reply(req, {});
        for (const id of this.scope.targets) this.announceCreated(id);
        return;
      case 'setAutoAttach':
        if (params.autoAttach === true && params.flatten !== true) return this.refuse(req, 'flatten 모드(flatten: true)만 지원한다');
        this.autoAttach = params.autoAttach === true ? { filter: params.filter as TargetFilterEntry[] | undefined } : undefined;
        // 붙이기를 마친 뒤 응답한다: Playwright는 응답 전에 기존 탭의 attachedToTarget을 받기를 기대한다
        Promise.all([...this.scope.targets].map((id) => this.attachOnBehalf(id))).then(() => this.reply(req, {}));
        return;
      case 'createTarget': {
        const url = typeof params.url === 'string' && params.url ? params.url : 'about:blank';
        if (!isAgentNavigable(url)) return this.refuse(req, '이 주소로는 이동할 수 없다(웹 주소만, ADR-0006)');
        this.scope.actions.newTab(url).then(
          (targetId) => this.reply(req, { targetId }),
          (e: unknown) => this.fail(req, `탭을 만들지 못했다: ${e instanceof Error ? e.message : String(e)}`),
        );
        return;
      }
      case 'closeTarget':
        if (!this.scope.owns(params.targetId)) return this.refuse(req, '이 세션의 탭이 아니다');
        this.scope.actions.closeTab(params.targetId as string).then(() => this.reply(req, { success: true }), () => this.fail(req, '탭을 닫지 못했다'));
        return;
      case 'activateTarget':
        if (!this.scope.owns(params.targetId)) return this.refuse(req, '이 세션의 탭이 아니다');
        this.scope.actions.activateTab(params.targetId as string).then(() => this.reply(req, {}), () => this.fail(req, '탭을 앞으로 가져오지 못했다'));
        return;
    }
  }

  ownTargetInfos() {
    return [...this.scope.targets].map((id) => this.router.targetInfos.get(id)).filter((t) => t !== undefined);
  }
}
