// 묶은 앱 시작 프로세스의 판단(ADR-0008). 파일·신호·시계는 밖에서 받아 Electron 없이 시험한다.
// 실제 연결은 src/app/entry.ts가 한다.

/** 끄는 중인 런처가 끝나기를 기다리는 최대 시간. 브라우저를 닫고 정리하는 데 걸리는 시간보다 넉넉히 */
export const STOP_WAIT_MS = 15_000;
/** 기다리는 동안 자물쇠를 다시 보는 간격 */
export const STOP_POLL_MS = 100;
/** 신호를 보낸 뒤 받음 표시를 기다리는 최대 시간. 안 오면 런처가 그 사이 끄기 시작했는지 한 번 더 본다 */
export const SIGNAL_RECHECK_MS = 300;
/** 받음 표시를 보는 간격 */
export const ACK_POLL_MS = 10;
/** 잡기 실패와 pid 읽기 사이에 자물쇠가 사라졌을 때 다시 해 보는 횟수 */
export const CLAIM_RETRIES = 3;

export interface StartDeps {
  /** 자물쇠를 잡으면 true */
  claim(): boolean;
  /** 자물쇠에 적힌 런처 pid */
  holder(): number | undefined;
  /** 끄는 중 표시에 적힌 pid */
  stopping(): number | undefined;
  /** 자물쇠 파일이 있는가 */
  lockExists(): boolean;
  /** 런처에 "창을 앞으로" 신호를 보낸다. 그 프로세스가 없으면(ESRCH) false */
  signal(pid: number): boolean;
  /** 런처 pid가 since(이 프로세스 시계, ms) 이후에 신호를 받았다는 표시를 남겼는가 */
  acked(pid: number, since: number): boolean;
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
  let pid: number | undefined;
  for (let attempt = 0; ; attempt++) {
    if (deps.claim()) {
      deps.launch();
      return 'started';
    }
    pid = deps.holder();
    if (pid !== undefined) break;
    // pid가 없다: 자물쇠가 있으면 런처가 막 뜨는 중이다 → 창은 곧 뜬다.
    // 자물쇠가 사라졌으면 잡기와 읽기 사이에 런처가 끝났다 → 다시 잡아 본다(spec-start-fixes D1)
    if (deps.lockExists() || attempt >= CLAIM_RETRIES) return 'starting';
  }
  // 런처가 끄는 중이다: 끝나기를 기다렸다가 새로 띄운다(spec-cleanup-five C1)
  if (deps.stopping() === pid) return waitAndStart(deps, pid);
  // 이미 런처가 있다(P5): 사람 창을 앞으로 가져오게 한다.
  // 그 사이 런처가 끝났으면(ESRCH) 자물쇠가 풀리기를 기다렸다가 새로 띄운다(spec-start-fixes D1)
  const since = deps.now();
  if (!deps.signal(pid)) return waitAndStart(deps, pid);
  // 런처는 끄는 중이 아니면 받음 표시를 남긴다 → 보는 즉시 끝난다(spec-start-fixes D2).
  // 표시 없이 런처가 끄기 시작했거나 끝났으면 기다렸다가 새로 띄운다. 끝내 표시가 없으면 지금처럼 신호가 갔다고 본다
  const until = since + SIGNAL_RECHECK_MS;
  for (;;) {
    if (deps.acked(pid, since)) return 'focused';
    if (deps.stopping() === pid || deps.holder() !== pid) return waitAndStart(deps, pid);
    if (deps.now() >= until) return 'focused';
    deps.sleep(ACK_POLL_MS);
  }
}

/** 끄는 중인 런처를 기다리다 새로 띄우지 못했을 때 사람에게 보이는 말(spec-start-fixes D3) */
export const TIMEOUT_MESSAGE = '앱이 아직 끄는 중입니다. 잠시 뒤 다시 열어 주세요.';

export interface StartReporter {
  /** launcher.log에 한 줄 남긴다 */
  log(line: string): void;
  /** 사람에게 오류 창을 띄운다 */
  alert(message: string): void;
}

/** 시작 판단을 하고 종료 코드를 돌려준다. 새로 띄우지 못하고 끝나면 알리고 기록한다 */
export function runStart(deps: StartDeps, out: StartReporter): number {
  if (decideStart(deps) !== 'timeout') return 0;
  out.log(`${new Date(deps.now()).toISOString()} 시작 프로세스: ${STOP_WAIT_MS}ms 기다려도 끄는 중인 런처가 끝나지 않아 새로 띄우지 못했다. ${TIMEOUT_MESSAGE}`);
  out.alert(TIMEOUT_MESSAGE);
  return 1;
}
