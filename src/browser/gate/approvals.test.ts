import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalQueue, approvalNotice, approvalTimeoutMs, DEFAULT_APPROVAL_TIMEOUT_MS } from './approvals';
import type { ApprovalView } from '../../shared/approval';

const req = { sessionId: 's1', host: 'example.test:443', kind: 'form' as const };

describe('승인 요청 시간 제한·알림 (카드 20261122-approval-attention)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('P4: 정한 시간 동안 답이 없으면 거부로 끝나고 줄에서 빠진다. 줄에 끝나는 시각이 있다', async () => {
    const changes: ApprovalView[][] = [];
    const q = new ApprovalQueue((v) => changes.push(v), { timeoutMs: 60_000 });
    const result = q.ask(req, 7);
    expect(q.views()[0].expiresAt).toBe(1_000_000 + 60_000);
    vi.advanceTimersByTime(59_999);
    expect(q.views()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await expect(result).resolves.toBe(false);
    expect(q.views()).toEqual([]);
  });

  it('P4: 먼저 답하면 시간이 지나도 다시 끝나지 않는다', async () => {
    const q = new ApprovalQueue(() => undefined, { timeoutMs: 60_000 });
    const result = q.ask(req, 7);
    q.decide(q.views()[0].id, true);
    await expect(result).resolves.toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('P1: 새 요청마다 한 번 알린다(결정·취소로는 알리지 않는다)', () => {
    const added: ApprovalView[] = [];
    const q = new ApprovalQueue(() => undefined, { timeoutMs: 60_000, onAdded: (v) => added.push(v) });
    void q.ask(req, 7);
    void q.ask({ ...req, kind: 'download', detail: 'a.zip' }, 8);
    q.cancelContents(7);
    expect(added.map((v) => v.kind)).toEqual(['form', 'download']);
  });

  it('P1: 알림 문구에 세션 이름(없으면 id)·호스트·종류가 들어간다', () => {
    const view: ApprovalView = { id: '1', sessionId: 's1', host: 'shop.test', kind: 'download', detail: '주문.xlsx', expiresAt: 0 };
    expect(approvalNotice(view, '주문 관리')).toEqual({ title: '승인 요청 · 주문 관리', body: 'shop.test · 다운로드 (주문.xlsx)' });
    expect(approvalNotice({ ...view, kind: 'form', detail: undefined }, undefined)).toEqual({ title: '승인 요청 · s1', body: 'shop.test · 폼 제출' });
  });

  it('P4: 시간은 AGENT_BROWSER_APPROVAL_TIMEOUT_MS로 바꾸고, 없거나 잘못되면 기본 10분', () => {
    expect(DEFAULT_APPROVAL_TIMEOUT_MS).toBe(10 * 60_000);
    expect(approvalTimeoutMs({})).toBe(DEFAULT_APPROVAL_TIMEOUT_MS);
    expect(approvalTimeoutMs({ AGENT_BROWSER_APPROVAL_TIMEOUT_MS: '3000' })).toBe(3000);
    expect(approvalTimeoutMs({ AGENT_BROWSER_APPROVAL_TIMEOUT_MS: '0' })).toBe(DEFAULT_APPROVAL_TIMEOUT_MS);
    expect(approvalTimeoutMs({ AGENT_BROWSER_APPROVAL_TIMEOUT_MS: 'x' })).toBe(DEFAULT_APPROVAL_TIMEOUT_MS);
  });
});
