import type { Session } from 'electron';
import type { ApprovalQueue } from './approvals';

/** 묻지 않는 POST 종류: fetch·XHR(xhr)과 sendBeacon(ping). spec의 알려진 한계(ADR-0005). 나머지 POST는 모두 묻는다 */
const NOT_ASKED = new Set(['xhr', 'ping']);

/**
 * R12: 에이전트 탭의 POST(페이지·iframe·object 이동 등)를 서버에 보내기 전에 붙잡고 사람에게 묻는다(ADR-0003~0005).
 * fetch·XHR·sendBeacon은 묻지 않는다(spec에 적힌 한계).
 */
export function installFormGate(session: Session, sessionOf: (contentsId: number) => string | undefined, queue: ApprovalQueue): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    const sessionId = details.webContentsId === undefined ? undefined : sessionOf(details.webContentsId);
    if (!sessionId || NOT_ASKED.has(details.resourceType) || details.method !== 'POST') return callback({});
    queue
      .ask({ sessionId, host: new URL(details.url).host, kind: 'form' }, details.webContentsId as number)
      .then((allowed) => callback(allowed ? {} : { cancel: true }));
  });
}
