# ADR-0003: 비밀 경로 URL, 폼 제출·다운로드 관문 방식
상태: 승인 · 날짜: 2026-11-14 · 작업: 20261114-agent-browser

## 스파이크 결과 (T0)
- **비밀 경로 URL (확인 필요 3번):** `http://127.0.0.1:<port>/<비밀>/`을 받은 두 도구가 경로를 지켰다.
  - Playwright `connectOverCDP` → `GET /<비밀>/json/version/`, `WS /<비밀>/devtools/browser/x`
  - chrome-devtools-mcp `--browserUrl` → `GET /<비밀>/json/version`, `WS /<비밀>/devtools/browser/x`, 이어서 `navigate_page`·`take_snapshot` 성공
- **폼 제출 (확인 필요 4번, R12):** `session.webRequest.onBeforeRequest`에서 `resourceType === 'mainFrame' && method === 'POST'`이고 `webContentsId`가 에이전트 창이면 콜백을 미뤄 보류할 수 있었다. 보류 동안 서버는 그 POST를 받지 않았고, `cancel: true` 뒤에도 받지 않았다. 같은 파티션의 사람 창 POST는 그대로 통과했다. 거부된 탭에는 차단 오류 페이지가 남는다.
- **다운로드 (R13):** `will-download`에서 `item.pause()`는 작은 파일이 다 받아진 뒤에야 걸려 막지 못했다.

## 결정
- 세션 엔드포인트는 `http://127.0.0.1:<세션 포트>/<세션 비밀>/` 형식으로 둔다(spec R3 그대로).
- 폼 제출 관문: 위 `onBeforeRequest` 보류 방식. 에이전트 창 판별은 런처가 아니라 브라우저 프로세스가 가진 "세션 창의 webContentsId 집합"으로 한다.
- 다운로드 관문: 에이전트 창의 다운로드는 앱 전용 격리 폴더에 저장한다. 허용하면 다운로드 폴더로 옮기고, 거부하면 격리 폴더의 파일을 지운다. 다시 요청하지 않으므로 POST 다운로드나 한 번만 쓸 수 있는 URL도 다룬다.

## 결과
- R13 "거부하면 파일이 생기지 않는다"는 "다운로드 폴더에 파일이 생기지 않고, 격리 폴더에도 남지 않는다"로 확인한다. 받는 동안에는 격리 폴더에 임시로 바이트가 있다.
- `fetch`·XHR 전송은 걸러내지 못한다(spec에 이미 적힌 한계 그대로).
