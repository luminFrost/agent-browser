import type { Session } from 'electron';
import type { ApprovalQueue } from './approvals';

/**
 * R12: 에이전트 탭의 최상위 폼 제출(POST로 페이지 이동)을 서버에 보내기 전에 붙잡고 사람에게 묻는다(ADR-0003).
 * fetch·XHR은 mainFrame이 아니라 걸러내지 못한다(spec에 적힌 한계).
 */
export function installFormGate(session: Session, sessionOf: (contentsId: number) => string | undefined, queue: ApprovalQueue): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    const sessionId = details.webContentsId === undefined ? undefined : sessionOf(details.webContentsId);
    if (!sessionId || details.resourceType !== 'mainFrame' || details.method !== 'POST') return callback({});
    queue
      .ask({ sessionId, host: new URL(details.url).host, kind: 'form' }, details.webContentsId as number)
      .then((allowed) => callback(allowed ? {} : { cancel: true }));
  });
}
