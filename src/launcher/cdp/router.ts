import type { CdpMessage, CdpPipe } from '../cdpPipe';
import type { Connection } from './connection';
import { SessionScope } from './scope';
import type { TargetInfo } from './types';

interface Pending {
  conn: Connection;
  /** 클라이언트 요청이면 원래 id. 내부 요청이면 undefined */
  clientId?: number;
  /** 응답을 클라이언트에 주기 전에 볼 함수(예: attach 응답에서 sessionId 등록) */
  onResponse?(message: CdpMessage): void;
  /** 내부 요청이면 결과를 받는 곳 */
  internal?: { resolve(r: Record<string, unknown>): void; reject(e: Error): void };
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
  private readonly scopes = new Map<string, SessionScope>();

  constructor(readonly pipe: CdpPipe) {
    pipe.on('message', (m: CdpMessage) => this.onMessage(m));
  }

  async start(): Promise<void> {
    await this.pipe.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await this.pipe.send('Target.getTargets');
    for (const t of targetInfos as TargetInfo[]) this.targetInfos.set(t.targetId, t);
  }

  addScope(id: string): SessionScope {
    const scope = new SessionScope(id);
    this.scopes.set(id, scope);
    return scope;
  }

  scope(id: string): SessionScope | undefined { return this.scopes.get(id); }

  removeScope(id: string): void { this.scopes.delete(id); }

  /** 소유권 알림을 받아 범위에 탭을 더한다. 정보가 아직 없으면 먼저 가져온다 */
  async addTarget(scopeId: string, targetId: string): Promise<void> {
    if (!this.targetInfos.has(targetId)) {
      const r = await this.pipe.send('Target.getTargetInfo', { targetId }).catch(() => undefined);
      if (r) this.targetInfos.set(targetId, r.targetInfo as TargetInfo);
    }
    this.scopes.get(scopeId)?.addTarget(targetId);
  }

  removeTarget(scopeId: string, targetId: string): void {
    this.scopes.get(scopeId)?.removeTarget(targetId);
  }

  /** 클라이언트 요청을 전역 id로 넘긴다 */
  forward(conn: Connection, request: { id: number; method: string; params?: Record<string, unknown>; sessionId?: string }, onResponse?: (m: CdpMessage) => void): void {
    const id = this.nextId++;
    this.pending.set(id, { conn, clientId: request.id, onResponse });
    if (request.method === 'Target.attachToTarget') this.expectAttach(conn, String(request.params?.targetId));
    this.pipe.sendRaw({ ...request, id });
  }

  /** 연결을 대신해 보내는 내부 요청. 응답은 클라이언트에 가지 않는다 */
  call(conn: Connection, method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { conn, internal: { resolve, reject } });
      if (method === 'Target.attachToTarget') this.expectAttach(conn, String(params.targetId));
      this.pipe.sendRaw({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    });
  }

  /** CDP 세션의 주인을 정한다 */
  own(sessionId: string, conn: Connection): void {
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
    for (const [id, p] of this.pending) if (p.conn === conn && !p.internal) this.pending.delete(id);
    for (const [targetId, list] of this.pendingAttach) {
      const rest = list.filter((c) => c !== conn);
      if (rest.length) this.pendingAttach.set(targetId, rest); else this.pendingAttach.delete(targetId);
    }
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
      this.own(attached, p.conn);
      for (const [targetId, list] of this.pendingAttach) if (list.includes(p.conn)) { this.takeAttach(targetId, p.conn); break; }
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
