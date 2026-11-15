// 묶은 앱의 런처 자물쇠(ADR-0008, spec-mac-app.md P5).
// 프로필마다 런처는 하나다. 자물쇠 파일을 원자적으로(O_EXCL) 만든 쪽만 런처가 되고,
// 런처가 살아 있는 동안 내내 쥐고 있다가 끝날 때 지운다.
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

/** pid를 아직 적지 않은 자물쇠(또는 치우기 표시)를 낡은 것으로 보는 시간. 만든 프로세스가 바로 죽은 경우 */
export const STALE_EMPTY_MS = 10_000;
/** 런처 명령줄에 있는 스크립트. pid가 재사용된 다른 프로세스와 구분한다 */
const LAUNCHER_SCRIPT = 'launcher/cli.js';

const errCode = (e: unknown) => (e as NodeJS.ErrnoException).code;

/** 자물쇠에 적힌 런처 pid. 없거나 아직 적지 않았으면 undefined */
export function lockHolder(lock: string): number | undefined {
  try {
    const pid = Number(readFileSync(lock, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch (e) {
    if (errCode(e) === 'ENOENT') return undefined;
    throw e;
  }
}

const olderThan = (path: string, ms: number) => Date.now() - statSync(path).mtimeMs > ms;

const isStale = (lock: string, isOurLauncher: (pid: number, lock: string) => boolean): boolean => {
  const pid = lockHolder(lock);
  if (pid !== undefined) return !isOurLauncher(pid, lock);
  return olderThan(lock, STALE_EMPTY_MS);
};

/** 만들면 true, 이미 있으면 false */
const createExclusive = (path: string): boolean => {
  try {
    closeSync(openSync(path, 'wx', 0o600));
    return true;
  } catch (e) {
    if (errCode(e) === 'EEXIST') return false;
    throw e;
  }
};

const unlinkIfExists = (path: string): void => {
  try {
    unlinkSync(path);
  } catch (e) {
    if (errCode(e) !== 'ENOENT') throw e;
  }
};

/**
 * 낡은 자물쇠는 "치우기 표시"(`<자물쇠>.clearing`)를 O_EXCL로 잡은 한 프로세스만 치운다.
 * 표시를 잡은 뒤 다시 낡았는지 보고 지운 다음 새로 잡는다. 동시에 치우던 다른 프로세스가
 * 방금 잡힌 새 자물쇠를 지우는 일이 없다. 표시를 못 잡으면 치우는 쪽이 곧 주인이 되므로 물러난다.
 */
const claimStale = (lock: string, isOurLauncher: (pid: number, lock: string) => boolean): boolean => {
  const clearing = `${lock}.clearing`;
  if (!createExclusive(clearing)) {
    // 치우던 프로세스가 표시를 남기고 죽었으면 표시를 치우고 한 번 더 해 본다
    try {
      if (!olderThan(clearing, STALE_EMPTY_MS)) return false;
    } catch (e) {
      if (errCode(e) !== 'ENOENT') throw e;
    }
    unlinkIfExists(clearing);
    if (!createExclusive(clearing)) return false;
  }
  try {
    try {
      if (!isStale(lock, isOurLauncher)) return false;
    } catch (e) {
      if (errCode(e) !== 'ENOENT') throw e; // 주인이 그 사이 지웠다 → 아래에서 잡아 본다
    }
    unlinkIfExists(lock);
    return createExclusive(lock);
  } finally {
    unlinkIfExists(clearing);
  }
};

/** 자물쇠를 잡으면 true. 이 앱의 런처가 살아서 쥐고 있거나, 다른 프로세스가 지금 잡는 중이면 false */
export function claimLock(lock: string, isOurLauncher: (pid: number, lock: string) => boolean): boolean {
  if (createExclusive(lock)) return true;
  return claimStale(lock, isOurLauncher);
}

/** 자물쇠에 런처 pid를 적는다 */
export function recordLauncher(lock: string, pid: number): void {
  writeFileSync(lock, String(pid));
}

/** 끄는 중 표시. 런처가 끄기 시작할 때 자기 pid를 적는다(spec-cleanup-five C1) */
const stoppingMark = (lock: string) => `${lock}.stopping`;

/** 런처가 끄기 시작했음을 적는다. 이때 다시 연 시작 프로세스는 창을 앞으로 가져오라는 신호 대신 런처가 끝나기를 기다렸다가 새로 띄운다 */
export function markStopping(lock: string, pid: number): void {
  writeFileSync(stoppingMark(lock), String(pid), { mode: 0o600 });
}

/** 끄는 중인 런처 pid. 표시가 없으면 undefined */
export function stoppingLauncher(lock: string): number | undefined {
  return lockHolder(stoppingMark(lock));
}

/** 신호 받음 표시(spec-start-fixes D2) */
const ackMark = (lock: string) => `${lock}.ack`;

/** 런처가 "창을 앞으로" 신호를 받았음을 적는다. 끄는 중에는 부르지 않는다 */
export function markAck(lock: string, pid: number): void {
  writeFileSync(ackMark(lock), String(pid), { mode: 0o600 });
}

/** 런처 pid가 since(ms) 이후에 받음 표시를 남겼는가 */
export function ackedSince(lock: string, pid: number, since: number): boolean {
  try {
    return lockHolder(ackMark(lock)) === pid && statSync(ackMark(lock)).mtimeMs >= since;
  } catch {
    return false;
  }
}

/** 런처가 끝날 때 자기 자물쇠와 끄는 중 표시를 지운다. 남의 것은 건드리지 않고, 실패해도 던지지 않는다(다음 실행이 낡은 것으로 치운다) */
export function releaseLock(lock: string, pid: number): void {
  for (const path of [stoppingMark(lock), ackMark(lock), lock]) {
    try {
      if (lockHolder(path) === pid) unlinkSync(path);
    } catch { /* 최선 노력 */ }
  }
}

/**
 * 이 pid가 이 자물쇠를 쓴 살아 있는 런처인가.
 * - 명령줄에 launcher/cli.js가 있어야 한다(재부팅 뒤 다른 프로그램이 pid를 재사용한 경우).
 * - 자물쇠에 pid를 적기 전에 시작한 프로세스여야 한다. 런처는 시작한 뒤에 자기 pid를 적으므로,
 *   자물쇠보다 늦게 시작한 프로세스는 다른 런처(다른 프로필)가 pid를 재사용한 것이다.
 */
export function isOurLauncher(pid: number, lock: string): boolean {
  let out: string;
  try {
    // 없는 pid면 ps는 1로 끝나고 stderr에 오류를 쓴다 → 버린다
    out = execFileSync('ps', ['-p', String(pid), '-o', 'lstart=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, LC_ALL: 'C' }, // lstart를 Date.parse가 읽는 영어 형식으로
    });
  } catch {
    return false;
  }
  if (!out.includes(LAUNCHER_SCRIPT)) return false;
  // lstart는 "Sun Nov 15 09:47:17 2026"처럼 단어 5개다
  const started = Date.parse(out.trim().split(/\s+/).slice(0, 5).join(' '));
  let written: number;
  try {
    written = statSync(lock).mtimeMs;
  } catch {
    return false;
  }
  // ps의 시작 시각은 초 단위로 잘려 실제보다 이르다 → 자기 런처를 낡은 것으로 잘못 보지 않는다
  return Number.isFinite(started) && started <= written;
}
