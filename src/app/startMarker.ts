// 묶은 앱의 "시작 중" 표시(spec-mac-app.md P5).
// 시작 프로세스가 런처를 띄우고 런처의 브라우저가 프로필 자물쇠를 잡기까지 몇 초가 걸린다.
// 그 사이 다시 열어도 런처를 또 띄우지 않도록, 표시 파일을 원자적으로(O_EXCL) 만든 쪽만 런처를 띄운다.
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

/** pid를 아직 적지 않은 표시를 낡은 것으로 보는 시간. 시작 프로세스가 표시를 만든 뒤 바로 죽은 경우 */
export const STALE_EMPTY_MS = 10_000;

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

const isStale = (marker: string, isAlive: (pid: number) => boolean): boolean => {
  const pid = Number(readFileSync(marker, 'utf8').trim());
  if (Number.isInteger(pid) && pid > 0) return !isAlive(pid);
  return Date.now() - statSync(marker).mtimeMs > STALE_EMPTY_MS;
};

/** 표시를 잡으면 true. 살아 있는 다른 시작이 잡고 있으면 false. 낡은 표시는 지우고 한 번 더 잡아 본다 */
export function claimStart(marker: string, isAlive: (pid: number) => boolean): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      closeSync(openSync(marker, 'wx', 0o600));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    try {
      if (!isStale(marker, isAlive)) return false;
      unlinkSync(marker);
    } catch (e) {
      if (!isMissing(e)) throw e; // 그 사이 다른 쪽이 지웠다 → 다시 잡아 본다
    }
  }
  return false;
}

/** 띄운 런처의 pid를 적는다. 런처가 죽으면 표시가 낡은 것이 된다 */
export function recordLauncher(marker: string, pid: number): void {
  writeFileSync(marker, String(pid));
}

/** 런처가 브라우저 준비(또는 실패) 뒤 자기 표시를 지운다. 남의 표시는 건드리지 않는다 */
export function releaseStart(marker: string, pid: number): void {
  try {
    if (readFileSync(marker, 'utf8').trim() === String(pid)) unlinkSync(marker);
  } catch (e) {
    if (!isMissing(e)) throw e;
  }
}

/** 프로세스가 살아 있는가(신호 0은 보내지 않고 존재만 본다) */
export const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};
