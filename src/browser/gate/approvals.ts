import type { ApprovalView } from '../../shared/approval';

interface Pending {
  view: ApprovalView;
  /** 요청을 낸 탭(webContents id). 탭이 닫히면 취소한다 */
  contentsId: number;
  settle(allowed: boolean): void;
}

/**
 * 사람 창에 띄우는 승인 요청 줄. 결정·취소되면 줄에서 빠진다.
 * 취소(세션 멈춤, 탭 닫힘)는 거부와 같다.
 */
export class ApprovalQueue {
  private nextId = 1;
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly onChange: (views: ApprovalView[]) => void) {}

  ask(request: Omit<ApprovalView, 'id'>, contentsId: number): Promise<boolean> {
    const id = String(this.nextId++);
    return new Promise((resolve) => {
      this.pending.set(id, { view: { ...request, id }, contentsId, settle: resolve });
      this.emit();
    });
  }

  decide(id: string, allowed: boolean): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    p.settle(allowed);
    this.emit();
  }

  /** 탭이 닫혔다: 그 탭의 요청을 거부로 끝낸다 */
  cancelContents(contentsId: number): void {
    for (const [id, p] of this.pending) if (p.contentsId === contentsId) this.decide(id, false);
  }

  views(): ApprovalView[] { return [...this.pending.values()].map((p) => p.view); }

  private emit(): void { this.onChange(this.views()); }
}
