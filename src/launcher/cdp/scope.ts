import type { Connection } from './connection';

/**
 * 에이전트 세션 하나가 볼 수 있는 범위: 그 세션 창의 탭(targetId)과 붙어 있는 연결들.
 * 탭은 브라우저 main의 tabAdded/tabRemoved로만 늘고 준다(design.md).
 */
export class SessionScope {
  readonly targets = new Set<string>();
  readonly connections = new Set<Connection>();

  constructor(readonly id: string) {}

  owns(targetId: unknown): boolean {
    return typeof targetId === 'string' && this.targets.has(targetId);
  }

  addTarget(targetId: string): void {
    if (this.targets.has(targetId)) return;
    this.targets.add(targetId);
    for (const c of this.connections) c.onTargetAdded(targetId);
  }

  removeTarget(targetId: string): void {
    if (!this.targets.delete(targetId)) return;
    for (const c of this.connections) c.onTargetRemoved(targetId);
  }
}
