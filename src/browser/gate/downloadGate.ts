import type { DownloadItem, Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { safeFileName, uniqueName } from '../../shared/fileName';
import type { ApprovalQueue } from './approvals';

export interface DownloadGateOptions {
  /** 허용된 파일과 사람 창의 파일이 가는 곳 */
  downloadsDir: string;
  /** 에이전트 다운로드를 결정 전까지 두는 곳(앱 전용) */
  quarantineDir: string;
}

const finalPath = (dir: string, name: string) => join(dir, uniqueName(safeFileName(name), (n) => existsSync(join(dir, n))));

/** 다른 파일 시스템이면 rename이 실패하므로 복사 후 지운다 */
function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
    rmSync(from, { force: true });
  }
}

const finished = (item: DownloadItem) => new Promise<string>((resolve) => item.once('done', (_e, state) => resolve(state)));

/**
 * R13: 에이전트 탭의 다운로드는 격리 폴더에 받고 사람에게 묻는다(ADR-0003).
 * 허용 → 다운로드 폴더로 옮김. 거부 → 취소하고 격리 폴더의 파일을 지움. 사람 창의 다운로드는 묻지 않는다.
 */
export interface DownloadOwners {
  /** 에이전트 세션의 탭이면 세션 id */
  sessionOf(contentsId: number): string | undefined;
  /** 사람 창의 탭인가 */
  isHuman(contentsId: number): boolean;
}

export function installDownloadGate(session: Session, owners: DownloadOwners, queue: ApprovalQueue, options: DownloadGateOptions): void {
  session.on('will-download', (event, item, contents) => {
    const name = safeFileName(item.getFilename());
    const contentsId = contents && !contents.isDestroyed() ? contents.id : undefined;
    const sessionId = contentsId === undefined ? undefined : owners.sessionOf(contentsId);
    if (!sessionId) {
      // 사람 창 탭으로 확인된 것만 묻지 않고 저장한다. 출처를 모르면(이미 닫힌 탭 등) 막는다(검증 2회차 P1)
      if (contentsId === undefined || !owners.isHuman(contentsId)) return event.preventDefault();
      mkdirSync(options.downloadsDir, { recursive: true });
      item.setSavePath(finalPath(options.downloadsDir, name));
      return;
    }
    mkdirSync(options.quarantineDir, { recursive: true, mode: 0o700 });
    const quarantined = join(options.quarantineDir, `${randomUUID()}-${name}`);
    item.setSavePath(quarantined);
    const done = finished(item);
    const decision = queue.ask({ sessionId, host: new URL(item.getURL()).host, kind: 'download', detail: name }, contentsId as number);
    decision.then((allowed) => { if (!allowed && item.getState() === 'progressing') item.cancel(); });
    Promise.all([decision, done]).then(([allowed, state]) => {
      try {
        if (allowed && state === 'completed') {
          mkdirSync(options.downloadsDir, { recursive: true }); // 다운로드 폴더가 아직 없을 수 있다
          moveFile(quarantined, finalPath(options.downloadsDir, name));
        } else rmSync(quarantined, { force: true });
      } catch (e) {
        console.error(`agent-browser: 다운로드를 옮기지 못했다: ${e instanceof Error ? e.message : String(e)}`);
        rmSync(quarantined, { force: true });
      }
    });
  });
}
