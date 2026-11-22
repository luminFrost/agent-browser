import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentInputGate } from './agentInput';

describe('에이전트 입력 허용 (카드 20261122-agent-input-lock A4)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('시작하면 그 세션만 허용하고, 끝나면 막는다', () => {
    const g = new AgentInputGate(5000);
    expect(g.allows('a')).toBe(false);
    g.begin('a', 1);
    expect(g.allows('a')).toBe(true);
    expect(g.allows('b')).toBe(false);
    g.end('a', 1);
    expect(g.allows('a')).toBe(false);
  });

  it('겹친 입력은 모두 끝나야 막는다', () => {
    const g = new AgentInputGate(5000);
    g.begin('a', 1); g.begin('a', 2);
    g.end('a', 1);
    expect(g.allows('a')).toBe(true);
    g.end('a', 2);
    expect(g.allows('a')).toBe(false);
  });

  it('끝 알림이 오지 않아도 정한 시간 뒤 막는다', () => {
    const g = new AgentInputGate(5000);
    g.begin('a', 1);
    vi.advanceTimersByTime(4999);
    expect(g.allows('a')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(g.allows('a')).toBe(false);
  });

  it('세션을 지우면 남은 허용도 지운다. 모르는 끝 알림은 무시한다', () => {
    const g = new AgentInputGate(5000);
    g.begin('a', 1);
    g.clear('a');
    expect(g.allows('a')).toBe(false);
    expect(() => g.end('a', 9)).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(g.allows('a')).toBe(false);
  });
});
