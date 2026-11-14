import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { CdpMessage, CdpPipe } from '../cdpPipe';
import type { Connection } from './connection';
import { Router } from './router';

/** 응답을 테스트가 직접 주는 가짜 파이프 */
class FakePipe extends EventEmitter {
  readonly raw: CdpMessage[] = [];
  readonly calls: { method: string; params: Record<string, unknown>; resolve(r: Record<string, unknown>): void }[] = [];
  sendRaw(m: CdpMessage) { this.raw.push(m); }
  send(method: string, params: Record<string, unknown> = {}) {
    return new Promise<Record<string, unknown>>((resolve) => this.calls.push({ method, params, resolve }));
  }
  /** 브라우저가 보낸 메시지 */
  emitBrowser(m: CdpMessage) { this.emit('message', m); }
  answer(method: string, result: Record<string, unknown>) {
    const i = this.calls.findIndex((c) => c.method === method);
    if (i < 0) throw new Error(`${method} 호출 없음`);
    const [c] = this.calls.splice(i, 1);
    c.resolve(result);
  }
}

const fakeConn = (name: string) => {
  const got: CdpMessage[] = [];
  const conn = { name, closed: false, sessions: new Set<string>(), deliverEvent: (m: CdpMessage) => got.push(m), sendToClient: (m: CdpMessage) => got.push(m) };
  return { conn: conn as unknown as Connection & { closed: boolean }, got };
};
const tick = () => new Promise((r) => setImmediate(r));
const attachedEvent = (sessionId: string, targetId: string): CdpMessage => ({ method: 'Target.attachedToTarget', params: { sessionId, targetInfo: { targetId, type: 'page', title: '', url: '' }, waitingForDebugger: false } });

describe('Router (검증 2회차 경쟁 상황)', () => {
  it('끊긴 연결의 attach 이벤트는 같은 탭을 기다리는 다른 연결에 가지 않고 바로 떼어진다', async () => {
    const pipe = new FakePipe();
    const router = new Router(pipe as unknown as CdpPipe);
    const a = fakeConn('A');
    const b = fakeConn('B');
    router.forward(a.conn, { id: 1, method: 'Target.attachToTarget', params: { targetId: 'T', flatten: true } });
    router.forward(b.conn, { id: 1, method: 'Target.attachToTarget', params: { targetId: 'T', flatten: true } });
    a.conn.closed = true;
    router.release(a.conn);
    pipe.emitBrowser(attachedEvent('S-A', 'T')); // 브라우저는 요청 순서대로 답한다: 먼저 A의 것
    pipe.emitBrowser(attachedEvent('S-B', 'T'));
    await tick();
    expect(b.got.map((m) => (m.params as { sessionId?: string })?.sessionId)).toEqual(['S-B']);
    expect(router.ownerOf('S-A')).toBeUndefined();
    expect(pipe.calls.some((c) => c.method === 'Target.detachFromTarget' && c.params.sessionId === 'S-A')).toBe(true);
  });

  it('범위에 더하는 중에 탭이 닫히면, 더하기가 끝나도 범위에 남지 않는다', async () => {
    const pipe = new FakePipe();
    const router = new Router(pipe as unknown as CdpPipe);
    const scope = router.addScope('s1', { newTab: async () => '', closeTab: async () => undefined, activateTab: async () => undefined });
    const adding = router.addTarget('s1', 'P');
    await tick();
    pipe.answer('Target.getTargetInfo', { targetInfo: { targetId: 'P', type: 'page', title: '', url: '' } });
    await tick();
    router.removeTarget('s1', 'P'); // 짝 tab을 찾는 중에 닫힘
    pipe.answer('Target.getTargets', { targetInfos: [] });
    await adding;
    expect(scope.owns('P')).toBe(false);
  });
});

describe('Router (검증 3회차)', () => {
  it('짝 tab을 더하는 동안(연결의 자동 붙기를 기다리는 동안) 닫혀도 page는 범위에 남지 않는다', async () => {
    const pipe = new FakePipe();
    const router = new Router(pipe as unknown as CdpPipe);
    const scope = router.addScope('s1', { newTab: async () => '', closeTab: async () => undefined, activateTab: async () => undefined });
    let releaseTabAdd!: () => void;
    const slowConn = { onTargetAdded: () => new Promise<void>((r) => { releaseTabAdd = r; }), onTargetRemoved: () => undefined };
    scope.connections.add(slowConn as unknown as Connection);
    const adding = router.addTarget('s1', 'P');
    await tick();
    pipe.answer('Target.getTargetInfo', { targetInfo: { targetId: 'P', type: 'page', title: '', url: '' } });
    await tick();
    pipe.answer('Target.getTargets', { targetInfos: [{ targetId: 'T', type: 'tab', title: '', url: '' }] });
    await tick();
    pipe.answer('Target.attachToTarget', { sessionId: 'TS' }); // probeTab
    await tick();
    pipe.emitBrowser({ sessionId: 'TS', method: 'Target.attachedToTarget', params: { sessionId: 'PS', targetInfo: { targetId: 'P', type: 'page', title: '', url: '' } } });
    pipe.answer('Target.setAutoAttach', {});
    await tick();
    pipe.answer('Target.detachFromTarget', {});
    await tick();
    expect(scope.owns('T')).toBe(true); // tab을 더하고 연결을 기다리는 중
    router.removeTarget('s1', 'P');
    releaseTabAdd();
    await adding;
    expect(scope.owns('P')).toBe(false);
  });
});
