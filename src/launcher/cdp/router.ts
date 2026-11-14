import type { CdpMessage, CdpPipe } from '../cdpPipe';
import type { Connection } from './connection';
import { SessionScope, type TabActions } from './scope';
import type { TargetInfo } from './types';

interface Pending {
  conn: Connection;
  /** 클라이언트 요청이면 원래 id. 내부 요청이면 undefined */
  clientId?: number;
  /** 응답을 클라이언트에 주기 전에 볼 함수(예: attach 응답에서 sessionId 등록) */
  onResponse?(message: CdpMessage): void;
  /** 내부 요청이면 결과를 받는 곳 */
  internal?: { resolve(r: Record<string, unknown>): void; reject(e: Error): void };
  /** attachToTarget 요청이면 붙으려는 targetId */
  attachTarget?: string;
}

/**
 * 원본 파이프 하나를 여러 세션·연결이 나눠 쓰게 한다.
 * - 클라이언트 id → 전역 id(양수) 바꾸기와 되돌리기
 * - CDP sessionId의 주인 연결 기록과 이벤트 경로
 * - 모든 대상의 정보(targetInfo)를 들고 있는다(launcher가 브라우저 수준 discover를 한 번 켠다)
 */
export class Router {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly sessionOwners = new Map<string, Connection>();
  /** attach 응답·이벤트보다 먼저 온 attach 요청들(targetId별, 먼저 온 순서) */
  private readonly pendingAttach = new Map<string, Connection[]>();
  readonly targetInfos = new Map<string, TargetInfo>();
  /** 범위에 더하는 중에 닫힌 탭(scopeId/pageId). 더하기가 끝나도 넣지 않는다 */
  private readonly removedWhileAdding = new Set<string>();
  /** 지금 범위에 더하는 중인 탭(scopeId/pageId) */
  private readonly adding = new Set<string>();
  private readonly scopes = new Map<string, SessionScope>();
  /** 런처 자신이 잠깐 붙은 세션의 이벤트를 받는 곳(어떤 연결에도 주지 않는다) */
  private readonly internalSessions = new Map<string, (m: CdpMessage) => void>();
  /** tab 대상 → 그 안의 page 대상. puppeteer는 tab에 붙어 page를 받는다(design.md) */
  private readonly pageOfTab = new Map<string, Promise<string | undefined>>();

  constructor(readonly pipe: CdpPipe) {
    pipe.on('message', (m: CdpMessage) => this.onMessage(m));
  }

  async start(): Promise<void> {
    await this.pipe.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await this.pipe.send('Target.getTargets');
    for (const t of targetInfos as TargetInfo[]) this.targetInfos.set(t.targetId, t);
  }

  addScope(id: string, actions: TabActions): SessionScope {
    const scope = new SessionScope(id, actions);
    this.scopes.set(id, scope);
    return scope;
  }

  scope(id: string): SessionScope | undefined { return this.scopes.get(id); }

  removeScope(id: string): void { this.scopes.delete(id); }

  /**
   * 소유권 알림(page targetId)을 받아 범위에 더한다. 짝이 되는 tab 대상을 먼저 더한다:
   * tab을 쓰는 클라이언트(puppeteer)는 tab에 붙은 뒤 page를 받는다.
   */
  async addTarget(scopeId: string, pageId: string): Promise<void> {
    const scope = this.scopes.get(scopeId);
    if (!scope) return;
    const key = `${scopeId}/${pageId}`;
    this.removedWhileAdding.delete(key);
    this.adding.add(key);
    try {
      await this.ensureInfo(pageId);
      const tabId = await this.tabOf(pageId);
      if (this.removedWhileAdding.has(key)) return; // 찾는 동안 닫혔다
      if (tabId) {
        scope.pairTab(pageId, tabId);
        await scope.addTarget(tabId);
      }
      await scope.addTarget(pageId);
    } finally {
      this.adding.delete(key);
      this.removedWhileAdding.delete(key);
    }
  }

  removeTarget(scopeId: string, pageId: string): void {
    const scope = this.scopes.get(scopeId);
    if (!scope) return;
    const key = `${scopeId}/${pageId}`;
    if (this.adding.has(key)) this.removedWhileAdding.add(key);
    const tabId = scope.tabOfPage(pageId);
    scope.removeTarget(pageId);
    if (tabId) {
      scope.removeTarget(tabId);
      this.pageOfTab.delete(tabId);
    }
  }

  private async ensureInfo(targetId: string): Promise<void> {
    if (this.targetInfos.has(targetId)) return;
    const r = await this.pipe.send('Target.getTargetInfo', { targetId }).catch(() => undefined);
    if (r) this.targetInfos.set(targetId, r.targetInfo as TargetInfo);
  }

  /** page를 담은 tab 대상을 찾는다. 아직 모르는 tab마다 한 번씩 잠깐 붙어 자식 page를 확인하고 기억한다 */
  private async tabOf(pageId: string): Promise<string | undefined> {
    const { targetInfos } = await this.pipe.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    for (const t of targetInfos as TargetInfo[]) {
      this.targetInfos.set(t.targetId, t);
      if (!this.pageOfTab.has(t.targetId)) this.pageOfTab.set(t.targetId, this.probeTab(t.targetId));
    }
    for (const [tabId, page] of this.pageOfTab) if ((await page) === pageId) return tabId;
    return undefined;
  }

  private async probeTab(tabId: string): Promise<string | undefined> {
    const attached = await this.pipe.send('Target.attachToTarget', { targetId: tabId, flatten: true }).catch(() => undefined);
    const sessionId = attached?.sessionId as string | undefined;
    if (!sessionId) return undefined;
    let pageId: string | undefined;
    this.internalSessions.set(sessionId, (m) => {
      const info = m.params?.targetInfo as TargetInfo | undefined;
      if (m.method === 'Target.attachedToTarget' && info?.type === 'page') pageId = info.targetId;
    });
    try {
      // 이미 있는 자식은 응답 전에 attachedToTarget으로 온다
      await this.pipe.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
    } finally {
      this.internalSessions.delete(sessionId);
      await this.pipe.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
    }
    return pageId;
  }

  /** 클라이언트 요청을 전역 id로 넘긴다 */
  forward(conn: Connection, request: { id: number; method: string; params?: Record<string, unknown>; sessionId?: string }, onResponse?: (m: CdpMessage) => void): void {
    const id = this.nextId++;
    const attachTarget = request.method === 'Target.attachToTarget' ? String(request.params?.targetId) : undefined;
    this.pending.set(id, { conn, clientId: request.id, onResponse, attachTarget });
    if (attachTarget) this.expectAttach(conn, attachTarget);
    this.pipe.sendRaw({ ...request, id });
  }

  /** 연결을 대신해 보내는 내부 요청. 응답은 클라이언트에 가지 않는다 */
  call(conn: Connection, method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const attachTarget = method === 'Target.attachToTarget' ? String(params.targetId) : undefined;
      this.pending.set(id, { conn, internal: { resolve, reject }, attachTarget });
      if (attachTarget) this.expectAttach(conn, attachTarget);
      this.pipe.sendRaw({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    });
  }

  /** CDP 세션의 주인을 정한다. 이미 끊긴 연결이면 주인으로 삼지 않고 바로 뗀다(세션이 새지 않게) */
  own(sessionId: string, conn: Connection): void {
    if (conn.closed) {
      this.pipe.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
      return;
    }
    this.sessionOwners.set(sessionId, conn);
    conn.sessions.add(sessionId);
  }

  ownerOf(sessionId: string): Connection | undefined { return this.sessionOwners.get(sessionId); }

  /** 연결이 끊겼다: 그 연결의 세션을 떼고 기록을 지운다 */
  release(conn: Connection): void {
    for (const sessionId of conn.sessions) {
      this.sessionOwners.delete(sessionId);
      this.pipe.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
    }
    conn.sessions.clear();
    // 응답이 아직 안 온 요청은 남겨 둔다: attach 응답이 오면 own()이 닫힌 연결을 보고 세션을 뗀다
    // 대기 중인 attach 항목도 남겨 둔다: 브라우저는 요청 순서대로 attachedToTarget을 보내므로,
    // 이 연결 몫의 이벤트가 같은 탭을 기다리는 다른 연결로 넘어가지 않게 순서를 지킨다(own()이 바로 뗀다)
  }

  private expectAttach(conn: Connection, targetId: string): void {
    const list = this.pendingAttach.get(targetId) ?? [];
    list.push(conn);
    this.pendingAttach.set(targetId, list);
  }

  private takeAttach(targetId: string, conn?: Connection): Connection | undefined {
    const list = this.pendingAttach.get(targetId);
    if (!list?.length) return undefined;
    const index = conn ? list.indexOf(conn) : 0;
    if (index < 0) return undefined;
    const [taken] = list.splice(index, 1);
    if (!list.length) this.pendingAttach.delete(targetId);
    return taken;
  }

  private onMessage(m: CdpMessage): void {
    if (m.id !== undefined) return this.onResponse(m);
    if (m.sessionId) return this.onSessionEvent(m);
    this.onBrowserEvent(m);
  }

  private onResponse(m: CdpMessage): void {
    const p = this.pending.get(m.id as number);
    if (!p) return;
    this.pending.delete(m.id as number);
    // attach 응답: 이벤트가 먼저 와서 주인이 정해지지 않았다면 여기서 정한다
    const attached = m.result?.sessionId;
    if (typeof attached === 'string' && !this.sessionOwners.has(attached)) {
      if (p.attachTarget) this.takeAttach(p.attachTarget, p.conn); // 이 요청의 대기 항목만 지운다
      this.own(attached, p.conn);
    } else if (p.attachTarget && m.error) {
      this.takeAttach(p.attachTarget, p.conn); // 실패한 attach의 대기 항목이 남지 않게
    }
    if (p.internal) {
      if (m.error) p.internal.reject(new Error(m.error.message));
      else p.internal.resolve(m.result ?? {});
      return;
    }
    p.onResponse?.(m);
    if (p.conn.closed) return;
    p.conn.sendToClient({ ...m, id: p.clientId });
  }

  private onSessionEvent(m: CdpMessage): void {
    const internal = this.internalSessions.get(m.sessionId as string);
    if (internal) return internal(m);
    const owner = this.sessionOwners.get(m.sessionId as string);
    if (!owner) return;
    // 자식 세션(iframe·worker)은 부모 세션의 주인 것이다
    if (m.method === 'Target.attachedToTarget' && typeof m.params?.sessionId === 'string') this.own(m.params.sessionId, owner);
    if (m.method === 'Target.detachedFromTarget' && typeof m.params?.sessionId === 'string') {
      this.sessionOwners.delete(m.params.sessionId);
      owner.sessions.delete(m.params.sessionId);
    }
    owner.deliverEvent(m);
  }

  private onBrowserEvent(m: CdpMessage): void {
    const params = (m.params ?? {}) as Record<string, unknown>;
    switch (m.method) {
      case 'Target.targetCreated':
      case 'Target.targetInfoChanged': {
        const info = params.targetInfo as TargetInfo;
        this.targetInfos.set(info.targetId, info);
        for (const s of this.scopes.values()) if (s.owns(info.targetId)) for (const c of s.connections) c.onTargetEvent(m);
        return;
      }
      case 'Target.targetDestroyed': {
        const targetId = params.targetId as string;
        for (const s of this.scopes.values()) if (s.owns(targetId)) for (const c of s.connections) c.onTargetEvent(m);
        this.targetInfos.delete(targetId);
        return;
      }
      case 'Target.attachedToTarget': {
        const sessionId = params.sessionId as string;
        const targetId = (params.targetInfo as TargetInfo).targetId;
        let owner = this.sessionOwners.get(sessionId);
        if (!owner) {
          owner = this.takeAttach(targetId);
          if (owner) this.own(sessionId, owner);
        }
        owner?.deliverEvent(m);
        return;
      }
      case 'Target.detachedFromTarget': {
        const sessionId = params.sessionId as string;
        const owner = this.sessionOwners.get(sessionId);
        this.sessionOwners.delete(sessionId);
        owner?.sessions.delete(sessionId);
        owner?.deliverEvent(m);
        return;
      }
      default:
        return; // 그 밖의 브라우저 수준 이벤트는 어떤 연결에도 주지 않는다
    }
  }
}
