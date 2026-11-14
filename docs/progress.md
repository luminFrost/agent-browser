# Progress
갱신: 2026-11-14 · 단계: 개발 · 작업: 20261114-agent-browser · 브랜치: feat/agent-browser
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- spec 승인, plan 게이트 통과. 결정: ADR-0001(프록시), ADR-0002(런처 + `--remote-debugging-pipe` + ipc), ADR-0003(비밀 경로·관문 방식).
- `docs/tasks.md` 기준 T0~T10 완료, 커밋됨: 스파이크, 뼈대, 사람 창, 제어 서버, 세션 CDP 엔드포인트, 탭 격리, 공유 상태 보호, 도구 호환(chrome-devtools-mcp·Playwright), 로그인 공유, 동시 세션, 종료.
- CDP 중계 설계: `docs/design.md`(브라우저 수준 명령은 흉내, 소유권은 브라우저 main의 tabAdded/tabRemoved, 허용 목록). 도구가 실제로 보내는 브라우저 수준 명령도 거기 표에 반영했다.
- 확인 명령은 모두 통과: `npm run lint`(오류 0), `npm test`(단위 68, E2E 37), `npm run build`.
- 구조: `src/launcher/`(런처: `startApp`, `CdpPipe`, `control/`, `cdp/` = policy·router·scope·connection·endpoint), `src/browser/`(Electron main, `TabStrip`, 사람 창, 렌더러), `src/shared/`(ipc 타입, 주소 보정, 상수). E2E 도우미는 `tests/e2e/helpers.ts`, 테스트 서버는 `tests/fixtures/server.ts`.

## 다음 할 일
- T11: 지켜보기. 사람 창에 세션 목록 패널(세션 id, 각 탭 URL, "멈추기" 버튼 → 런처 stopSession), 빈 상태 문구 "에이전트 세션 없음", 상태별 스크린샷. 브라우저 → 런처 ipc에 stopSession 요청 추가. 실행 진입점 `src/launcher/cli.ts`(package.json `start`가 가리킴)도 만든다.
- T12: 폼 제출 관문(ADR-0003: onBeforeRequest 보류, 에이전트 창 webContentsId로 판별, 사람 창에 허용/거부, 거부 시 차단 오류 페이지).
- T13: 다운로드 관문(ADR-0003: 격리 폴더 → 허용 시 다운로드 폴더로 이동, 거부 시 삭제).
- 끝나면 확인 명령 → progress 갱신 → `aif.mjs task gate work pass` → 새 세션에서 `/aif-verify`.

## 막힌 것 · 결정 필요
- 없음. 참고: puppeteer는 page의 짝 `tab` 대상에 붙는다(design.md). macOS 위치 요청은 거부되면 오류 없이 멈춘다(CLAUDE.md 함정). 테스트는 "권한 상태 denied + 위치 전달 안 됨"으로 확인한다.
