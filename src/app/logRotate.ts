// launcher.log 크기 제한(spec-cleanup-five C2). 앱을 켤 때 한 번 본다.
import { renameSync, statSync } from 'node:fs';

/** 이보다 크면 교체한다(사람 결정 2026-11-15: "1MB 넘으면 교체") */
export const LOG_ROTATE_BYTES = 1_048_576;

/**
 * 기록 파일이 한도를 넘으면 `<파일>.1`로 옮긴다(이전 .1은 덮어씀). 다음 쓰기는 새 파일에서 시작한다.
 * 어떤 이유로든 실패하면 그대로 둔다: 기록 교체 때문에 앱이 안 켜지면 안 된다(spec-start-fixes D4)
 */
export function rotateLogIfLarge(log: string): void {
  try {
    if (statSync(log).size > LOG_ROTATE_BYTES) renameSync(log, `${log}.1`);
  } catch { /* 없음·권한·.1 자리에 폴더 등: 기존 파일에 이어 쓴다 */ }
}
