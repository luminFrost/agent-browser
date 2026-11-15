import { describe, expect, it } from 'vitest';
import { decideStart, SIGNAL_RECHECK_MS, STOP_WAIT_MS, type StartDeps } from './startDecision';

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
      return true;
    },
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

  it('신호 뒤 다시 보기까지 기다린다', () => {
    const w = world();
    w.running(100);
    decideStart(w.deps);
    expect(w.s.slept).toBe(SIGNAL_RECHECK_MS);
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
