import type { Connection } from './connection';

/** 세션 창의 탭을 다루는 앱 쪽 동작(런처 → 브라우저 ipc) */
export interface TabActions {
  /** 세션 창에 새 탭을 만들고 targetId를 돌려준다. 소유권 알림(tabAdded)이 끝난 뒤에 풀린다 */
  newTab(url: string): Promise<string>;
  closeTab(targetId: string): Promise<void>;
  activateTab(targetId: string): Promise<void>;
}

/**
 * 에이전트 세션 하나가 볼 수 있는 범위: 그 세션 창의 탭(targetId)과 붙어 있는 연결들.
 * 탭은 브라우저 main의 tabAdded/tabRemoved로만 늘고 준다(design.md).
 */
export class SessionScope {
  readonly targets = new Set<string>();
  readonly connections = new Set<Connection>();
  /** page targetId → 짝 tab targetId */
  private readonly tabs = new Map<string, string>();

  constructor(readonly id: string, readonly actions: TabActions, readonly onBlocked?: (method: string, reason: string) => void) {}

  pairTab(pageId: string, tabId: string): void { this.tabs.set(pageId, tabId); }

  tabOfPage(pageId: string): string | undefined { return this.tabs.get(pageId); }

  owns(targetId: unknown): boolean {
    return typeof targetId === 'string' && this.targets.has(targetId);
  }

  /** 탭을 범위에 더하고, 연결들의 흉내(targetCreated·자동 붙기)가 끝날 때까지 기다린다 */
  async addTarget(targetId: string): Promise<void> {
    if (this.targets.has(targetId)) return;
    this.targets.add(targetId);
    await Promise.all([...this.connections].map((c) => c.onTargetAdded(targetId)));
  }

  removeTarget(targetId: string): void {
    this.tabs.delete(targetId);
    if (!this.targets.delete(targetId)) return;
    for (const c of this.connections) c.onTargetRemoved(targetId);
  }
}
