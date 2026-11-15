import { describe, expect, it } from 'vitest';
import { decideStart, runStart, SIGNAL_RECHECK_MS, STOP_WAIT_MS, TIMEOUT_MESSAGE, type StartDeps } from './startDecision';

/** 신호부터 런처가 받음 표시를 남기기까지(브라우저의 focus 응답) */
const ACK_DELAY_MS = 5;

/**
 * 흉내 낸 자물쇠·프로세스·시계. sleep만 시간을 흐르게 한다.
 * at(t, fn): 시계가 t를 지나면 fn으로 세계를 바꾼다(런처가 끝남 등).
 */
function world() {
  const s = {
    t: 0,
    lock: false as boolean,
    holder: undefined as number | undefined,
    stopping: undefined as number | undefined,
    alive: new Set<number>(),
    launched: 0,
    signals: [] as number[],
    slept: 0,
    /** 신호를 받은 런처가 "받음" 표시를 남기는가(끄는 중이 아닐 때만) */
    acks: true,
    ackAt: undefined as { pid: number; t: number } | undefined,
    events: [] as { at: number; fn: () => void }[],
    /** 그 함수가 처음 불리기 직전에 한 번 세계를 바꾼다(호출 사이 경쟁 재현) */
    before: {} as Partial<Record<keyof StartDeps, () => void>>,
  };
  const hook = (name: keyof StartDeps) => { const fn = s.before[name]; if (fn) { delete s.before[name]; fn(); } };
  const tick = () => {
    for (const e of s.events.filter((x) => x.at <= s.t)) e.fn();
    s.events = s.events.filter((x) => x.at > s.t);
  };
  /** 런처 pid가 자물쇠를 쥐고 있다 */
  const running = (pid: number) => { s.lock = true; s.holder = pid; s.alive.add(pid); };
  /** 런처가 끝나 자물쇠와 끄는 중 표시를 지웠다 */
  const exited = (pid: number) => { s.alive.delete(pid); if (s.holder === pid) { s.lock = false; s.holder = undefined; } if (s.stopping === pid) s.stopping = undefined; };
  const deps: StartDeps = {
    claim: () => {
      tick();
      // 낡은 자물쇠(적힌 pid가 죽음)는 치우고 잡는다
      if (s.lock && !(s.holder !== undefined && !s.alive.has(s.holder))) return false;
      s.lock = true; s.holder = undefined; return true;
    },
    holder: () => { tick(); hook('holder'); return s.holder; },
    stopping: () => { tick(); return s.stopping; },
    lockExists: () => { tick(); return s.lock; },
    signal: (pid) => {
      tick();
      hook('signal');
      if (!s.alive.has(pid)) return false; // 프로세스가 없다(ESRCH)
      s.signals.push(pid);
      // 런처는 브라우저가 창을 앞으로 가져왔다고 답한 뒤(잠시 뒤) 표시를 남긴다. 그 사이 끄기 시작했으면 남기지 않는다
      if (s.acks) s.events.push({ at: s.t + ACK_DELAY_MS, fn: () => { if (s.stopping !== pid && s.alive.has(pid)) s.ackAt = { pid, t: s.t }; } });
      return true;
    },
    acked: (pid, since) => { tick(); return s.ackAt !== undefined && s.ackAt.t <= s.t && s.ackAt.pid === pid && s.ackAt.t >= since; },
    launch: () => { s.launched++; },
    sleep: (ms) => { s.t += ms; s.slept += ms; tick(); },
    now: () => s.t,
  };
  return { s, deps, running, exited, at: (at: number, fn: () => void) => s.events.push({ at, fn }) };
}

describe('시작 판단(ADR-0008, 지금 동작)', () => {
  it('자물쇠가 없으면 잡고 새 런처를 띄운다', () => {
    const w = world();
    expect(decideStart(w.deps)).toBe('started');
    expect(w.s.launched).toBe(1);
  });

  it('켜진 런처가 있으면 신호를 보내고 새로 띄우지 않는다', () => {
    const w = world();
    w.running(100);
    expect(decideStart(w.deps)).toBe('focused');
    expect(w.s.signals).toEqual([100]);
    expect(w.s.launched).toBe(0);
  });

  it('런처가 막 뜨는 중(자물쇠에 pid 없음)이면 아무것도 하지 않는다', () => {
    const w = world();
    w.s.lock = true;
    expect(decideStart(w.deps)).toBe('starting');
    expect(w.s.launched).toBe(0);
  });

  it('끄는 중이면 끝나기를 기다렸다가 새로 띄운다', () => {
    const w = world();
    w.running(100);
    w.s.stopping = 100;
    w.at(1_000, () => w.exited(100));
    expect(decideStart(w.deps)).toBe('started');
    expect(w.s.launched).toBe(1);
    expect(w.s.signals).toEqual([]);
  });

  it('신호를 보낸 뒤 끄기 시작했으면 기다렸다가 새로 띄운다', () => {
    const w = world();
    w.running(100);
    w.at(1, () => { w.s.stopping = 100; });
    w.at(2_000, () => w.exited(100));
    expect(decideStart(w.deps)).toBe('started');
    expect(w.s.launched).toBe(1);
  });

  it('기다리는 사이 다른 시작 프로세스가 새 런처를 띄웠으면 물러난다', () => {
    const w = world();
    w.running(100);
    w.s.stopping = 100;
    w.at(500, () => { w.exited(100); w.running(200); });
    expect(decideStart(w.deps)).toBe('yielded');
    expect(w.s.launched).toBe(0);
  });

  it('끄는 중인 런처가 15초 넘게 안 끝나면 timeout', () => {
    const w = world();
    w.running(100);
    w.s.stopping = 100;
    expect(decideStart(w.deps)).toBe('timeout');
    expect(w.s.t).toBeGreaterThanOrEqual(STOP_WAIT_MS);
    expect(w.s.launched).toBe(0);
  });

  it('받음 표시가 오지 않으면 다시 보기까지(300ms) 기다린 뒤 끝낸다', () => {
    const w = world();
    w.running(100);
    w.s.acks = false;
    expect(decideStart(w.deps)).toBe('focused');
    expect(w.s.slept).toBeGreaterThanOrEqual(SIGNAL_RECHECK_MS);
  });
});

describe('꺼지는 순간 다시 열기(spec-start-fixes D1)', () => {
  it('(가) 잡기가 실패한 뒤 pid를 읽기 전에 자물쇠가 사라지면 다시 잡고 새 런처를 띄운다', () => {
    const w = world();
    w.running(100);
    w.s.before.holder = () => w.exited(100);
    expect(decideStart(w.deps)).toBe('started');
    expect(w.s.launched).toBe(1);
  });

  it('(나) 신호를 보낼 때 런처가 이미 없으면(ESRCH) 오류 없이 기다렸다가 새 런처를 띄운다', () => {
    const w = world();
    w.running(100);
    w.s.before.signal = () => { w.s.alive.delete(100); }; // 자물쇠는 아직 남았다(지우기 직전 또는 강제 종료)
    expect(() => decideStart(w.deps)).not.toThrow();
    expect(w.s.launched).toBe(1);
  });

  it('(나) 신호 직전 런처가 끝나며 자물쇠까지 지웠어도 새 런처를 띄운다', () => {
    const w = world();
    w.running(100);
    w.s.before.signal = () => w.exited(100);
    expect(decideStart(w.deps)).toBe('started');
    expect(w.s.launched).toBe(1);
  });
});

describe('다시 열 때 고정 대기 없앰(spec-start-fixes D2)', () => {
  it('켜진 런처가 받음 표시를 남기면 시작 프로세스는 50ms 안에 끝난다', () => {
    const w = world();
    w.running(100);
    expect(decideStart(w.deps)).toBe('focused');
    expect(w.s.slept).toBeLessThan(50);
  });

  it('이전 신호의 받음 표시는 이번 것으로 치지 않는다', () => {
    const w = world();
    w.running(100);
    w.s.t = 1_000;
    w.s.acks = false;
    w.s.ackAt = { pid: 100, t: 10 }; // 지난번 다시 열기 때 남은 표시
    decideStart(w.deps);
    expect(w.s.slept).toBeGreaterThanOrEqual(SIGNAL_RECHECK_MS);
  });

  it('끄는 중이라 받음 표시가 없으면 지금처럼 끄는 중인지 보고 기다렸다가 새로 띄운다', () => {
    const w = world();
    w.running(100);
    w.s.before.signal = () => { w.s.stopping = 100; }; // 신호와 거의 같은 때 끄기 시작
    w.at(1_000, () => w.exited(100));
    expect(decideStart(w.deps)).toBe('started');
    expect(w.s.launched).toBe(1);
  });
});

describe('15초 실패 알림(spec-start-fixes D3)', () => {
  const reporter = () => {
    const r = { logs: [] as string[], alerts: [] as string[] };
    return { r, out: { log: (l: string) => r.logs.push(l), alert: (m: string) => r.alerts.push(m) } };
  };

  it('끄는 중인 런처를 15초 기다려도 못 띄우면 오류 창을 띄우고 기록을 남기고 종료 코드 1', () => {
    const w = world();
    w.running(100);
    w.s.stopping = 100; // 끝나지 않는다
    const { r, out } = reporter();
    expect(runStart(w.deps, out)).toBe(1);
    expect(w.s.t).toBeGreaterThanOrEqual(STOP_WAIT_MS);
    expect(r.alerts).toEqual([TIMEOUT_MESSAGE]);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toContain(TIMEOUT_MESSAGE);
    expect(TIMEOUT_MESSAGE).toContain('끄는 중');
  });

  it('정상으로 끝나면 알리지 않고 종료 코드 0', () => {
    for (const setup of [(w: ReturnType<typeof world>) => w, (w: ReturnType<typeof world>) => { w.running(100); return w; }]) {
      const w = setup(world());
      const { r, out } = reporter();
      expect(runStart(w.deps, out)).toBe(0);
      expect(r.alerts).toEqual([]);
      expect(r.logs).toEqual([]);
    }
  });
});
