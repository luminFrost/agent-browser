// 묶은 앱의 런처 자물쇠(ADR-0008, spec-mac-app.md P5).
// 프로필마다 런처는 하나다. 자물쇠 파일을 원자적으로(O_EXCL) 만든 쪽만 런처가 되고,
// 런처가 살아 있는 동안 내내 쥐고 있다가 끝날 때 지운다.
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

/** pid를 아직 적지 않은 자물쇠를 낡은 것으로 보는 시간. 시작 프로세스가 자물쇠를 만든 뒤 바로 죽은 경우 */
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

const isStale = (lock: string, isOurLauncher: (pid: number) => boolean): boolean => {
  const pid = lockHolder(lock);
  if (pid !== undefined) return !isOurLauncher(pid);
  return Date.now() - statSync(lock).mtimeMs > STALE_EMPTY_MS;
};

/** 낡은 자물쇠를 치운다. 판정한 뒤 그 사이 다른 쪽이 새로 잡았다면(inode가 다름) 제자리로 돌려놓는다 */
const clearStale = (lock: string, seenIno: number): void => {
  const aside = `${lock}.stale-${process.pid}`;
  renameSync(lock, aside);
  if (statSync(aside).ino === seenIno) {
    unlinkSync(aside);
    return;
  }
  try {
    closeSync(openSync(lock, 'wx', 0o600)); // 빈자리를 막아 두고
    renameSync(aside, lock); // 남이 잡은 자물쇠를 되돌린다
  } catch {
    unlinkSync(aside); // 그 사이 또 다른 쪽이 잡았다 → 그쪽이 주인이다
  }
};

/** 자물쇠를 잡으면 true. 이 앱의 런처가 살아서 쥐고 있으면 false */
export function claimLock(lock: string, isOurLauncher: (pid: number) => boolean): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      closeSync(openSync(lock, 'wx', 0o600));
      return true;
    } catch (e) {
      if (errCode(e) !== 'EEXIST') throw e;
    }
    try {
      const ino = statSync(lock).ino;
      if (!isStale(lock, isOurLauncher)) return false;
      clearStale(lock, ino);
    } catch (e) {
      if (errCode(e) !== 'ENOENT') throw e; // 그 사이 주인이 지웠다 → 다시 잡아 본다
    }
  }
  return false;
}

/** 자물쇠에 런처 pid를 적는다 */
export function recordLauncher(lock: string, pid: number): void {
  writeFileSync(lock, String(pid));
}

/** 런처가 끝날 때 자기 자물쇠를 지운다. 남의 자물쇠는 건드리지 않고, 실패해도 던지지 않는다(다음 실행이 낡은 것으로 치운다) */
export function releaseLock(lock: string, pid: number): void {
  try {
    if (lockHolder(lock) === pid) unlinkSync(lock);
  } catch { /* 최선 노력 */ }
}

/** 이 pid가 살아 있는 이 앱의 런처인가. 재부팅 뒤 같은 pid를 다른 프로세스가 쓰는 경우를 가린다 */
export function isOurLauncher(pid: number): boolean {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).includes(LAUNCHER_SCRIPT);
  } catch {
    return false; // ps는 없는 pid면 1로 끝난다
  }
}
