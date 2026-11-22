/**
 * 에이전트 입력 허용(카드 20261122-agent-input-lock).
 * 에이전트 탭의 마우스는 사람 입력이든 CDP Input.dispatchMouseEvent든 같은 before-mouse-event로 오고 구별되지 않는다.
 * 그래서 런처 프록시가 에이전트의 Input.* 명령을 보내기 직전에 begin, 응답을 받으면 end를 알린다. 그 사이에만 그 세션 탭의 마우스를 통과시킨다.
 * end가 오지 않아도(연결이 끊김 등) graceMs 뒤 스스로 끝난다.
 */
/** 에이전트 입력 허용이 끝 알림 없이 남아 있을 수 있는 가장 긴 시간. 명령을 보낸 뒤 페이지에 닿기까지면 충분하다 */
export const AGENT_INPUT_GRACE_MS = 5_000;

export class AgentInputGate {
  private readonly active = new Map<string, Map<number, ReturnType<typeof setTimeout>>>();

  constructor(private readonly graceMs: number) {}

  begin(sessionId: string, inputId: number): void {
    const inputs = this.active.get(sessionId) ?? new Map<number, ReturnType<typeof setTimeout>>();
    clearTimeout(inputs.get(inputId));
    const timer = setTimeout(() => this.end(sessionId, inputId), this.graceMs);
    timer.unref?.();
    inputs.set(inputId, timer);
    this.active.set(sessionId, inputs);
  }

  end(sessionId: string, inputId: number): void {
    const inputs = this.active.get(sessionId);
    if (!inputs) return;
    clearTimeout(inputs.get(inputId));
    inputs.delete(inputId);
    if (!inputs.size) this.active.delete(sessionId);
  }

  allows(sessionId: string): boolean {
    return (this.active.get(sessionId)?.size ?? 0) > 0;
  }

  clear(sessionId: string): void {
    for (const t of this.active.get(sessionId)?.values() ?? []) clearTimeout(t);
    this.active.delete(sessionId);
  }
}
