import type { ApprovalView } from '../../shared/approval';

/** 답이 없을 때 거부로 끝내기까지 기본 시간(카드 20261122-approval-attention). 회의 한 번 정도는 기다린다 */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60_000;

/** AGENT_BROWSER_APPROVAL_TIMEOUT_MS(밀리초)가 양수면 그것, 아니면 기본값 */
export function approvalTimeoutMs(env: Record<string, string | undefined>): number {
  const n = Number(env.AGENT_BROWSER_APPROVAL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_APPROVAL_TIMEOUT_MS;
}

const KIND_LABEL = { form: '폼 제출', download: '다운로드' } as const;

/** 승인 요청 알림 문구: 세션 이름(없으면 id)·호스트·종류 */
export function approvalNotice(view: ApprovalView, label: string | undefined): { title: string; body: string } {
  return {
    title: `승인 요청 · ${label ?? view.sessionId}`,
    body: `${view.host} · ${KIND_LABEL[view.kind]}${view.detail ? ` (${view.detail})` : ''}`,
  };
}

interface Pending {
  view: ApprovalView;
  /** 요청을 낸 탭(webContents id). 탭이 닫히면 취소한다 */
  contentsId: number;
  settle(allowed: boolean): void;
  /** 답이 없으면 거부로 끝내는 타이머 */
  timer: ReturnType<typeof setTimeout>;
}

export interface ApprovalQueueOptions {
  /** 답이 없을 때 거부로 끝내기까지 시간(기본 DEFAULT_APPROVAL_TIMEOUT_MS) */
  timeoutMs?: number;
  /** 새 요청이 생겼다(알림·배지·따라 보기) */
  onAdded?(view: ApprovalView): void;
}

/**
 * 사람 창에 띄우는 승인 요청 줄. 결정·취소되면 줄에서 빠진다.
 * 취소(세션 멈춤, 탭 닫힘)와 시간 초과는 거부와 같다.
 */
export class ApprovalQueue {
  private nextId = 1;
  private readonly pending = new Map<string, Pending>();

  private readonly timeoutMs: number;

  constructor(private readonly onChange: (views: ApprovalView[]) => void, private readonly options: ApprovalQueueOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  }

  ask(request: Omit<ApprovalView, 'id' | 'expiresAt'>, contentsId: number): Promise<boolean> {
    const id = String(this.nextId++);
    const view: ApprovalView = { ...request, id, expiresAt: Date.now() + this.timeoutMs };
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.decide(id, false), this.timeoutMs);
      this.pending.set(id, { view, contentsId, settle: resolve, timer });
      this.emit();
      this.options.onAdded?.(view);
    });
  }

  decide(id: string, allowed: boolean): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
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
