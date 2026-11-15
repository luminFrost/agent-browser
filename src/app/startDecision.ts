// 묶은 앱 시작 프로세스의 판단(ADR-0008). 파일·신호·시계는 밖에서 받아 Electron 없이 시험한다.
// 실제 연결은 src/app/entry.ts가 한다.

/** 끄는 중인 런처가 끝나기를 기다리는 최대 시간. 브라우저를 닫고 정리하는 데 걸리는 시간보다 넉넉히 */
export const STOP_WAIT_MS = 15_000;
/** 기다리는 동안 자물쇠를 다시 보는 간격 */
export const STOP_POLL_MS = 100;
/** 신호를 보낸 뒤 런처가 그 사이 끄기 시작했는지 한 번 더 보기까지의 시간 */
export const SIGNAL_RECHECK_MS = 300;

export interface StartDeps {
  /** 자물쇠를 잡으면 true */
  claim(): boolean;
  /** 자물쇠에 적힌 런처 pid */
  holder(): number | undefined;
  /** 끄는 중 표시에 적힌 pid */
  stopping(): number | undefined;
  /** 런처에 "창을 앞으로" 신호를 보낸다 */
  signal(pid: number): void;
  /** 새 런처를 띄운다(자물쇠를 잡은 뒤에만 부른다) */
  launch(): void;
  sleep(ms: number): void;
  now(): number;
}

/**
 * - started: 새 런처를 띄웠다
 * - focused: 켜진 런처에 창을 앞으로 가져오라고 했다
 * - starting: 런처가 막 뜨는 중이다(창은 곧 뜬다)
 * - yielded: 기다리는 사이 다른 시작 프로세스가 새 런처를 띄웠다
 * - timeout: 끄는 중인 런처를 기다렸지만 새로 띄우지 못했다
 */
export type StartResult = 'started' | 'focused' | 'starting' | 'yielded' | 'timeout';

/**
 * 끄는 중인 런처(oldPid)가 끝나 자물쇠가 풀리면 잡고 새로 띄운다.
 * 그 사이 다른 시작 프로세스가 새 런처를 띄웠으면 그쪽 창이 뜨므로 물러난다.
 */
export function waitAndStart(deps: StartDeps, oldPid: number): StartResult {
  const until = deps.now() + STOP_WAIT_MS;
  while (deps.now() < until) {
    if (deps.claim()) {
      deps.launch();
      return 'started';
    }
    const holder = deps.holder();
    if (holder !== undefined && holder !== oldPid && deps.stopping() !== holder) return 'yielded';
    deps.sleep(STOP_POLL_MS);
  }
  return 'timeout';
}

export function decideStart(deps: StartDeps): StartResult {
  if (deps.claim()) {
    deps.launch();
    return 'started';
  }
  const pid = deps.holder();
  // 런처가 끄는 중이다: 끝나기를 기다렸다가 새로 띄운다(spec-cleanup-five C1)
  if (pid !== undefined && deps.stopping() === pid) return waitAndStart(deps, pid);
  // 이미 런처가 있다(P5): 사람 창을 앞으로 가져오게 한다. pid가 아직 없으면 런처가 막 뜨는 중이다 → 창은 곧 뜬다
  if (pid === undefined) return 'starting';
  deps.signal(pid);
  // 신호를 보내는 사이 런처가 끄기 시작했을 수 있다(이미 끝났을 수도 있다) → 한 번 더 보고, 그랬으면 기다렸다가 새로 띄운다
  deps.sleep(SIGNAL_RECHECK_MS);
  if (deps.stopping() === pid || deps.holder() !== pid) return waitAndStart(deps, pid);
  return 'focused';
}
