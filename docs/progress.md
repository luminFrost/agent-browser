# Progress
갱신: 2026-11-14 · 단계: 개발 · 작업: 20261114-agent-browser · 브랜치: feat/agent-browser
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- spec 승인, plan 게이트 통과. 결정: ADR-0001(프록시), ADR-0002(런처 + `--remote-debugging-pipe` + ipc), ADR-0003(비밀 경로·관문 방식).
- `docs/tasks.md` 기준 T0(스파이크)·T1(뼈대)·T2(사람 창) 완료, 커밋됨.
- 확인 명령은 모두 통과: `npm run lint`(오류 0), `npm test`(단위 15, E2E 8), `npm run build`.
- 구조: `src/launcher/`(런처: `startApp`, `CdpPipe`), `src/browser/`(Electron main, `TabStrip`, 사람 창, 렌더러), `src/shared/`(ipc 타입, 주소 보정, 상수). E2E 도우미는 `tests/e2e/helpers.ts`, 테스트 서버는 `tests/fixtures/server.ts`.

## 다음 할 일
- T3: 제어 서버(토큰 파일 0600, `POST /sessions`, 127.0.0.1, 401) + 세션 생성 시 에이전트 창 1개(R1 뒷부분). 런처 → 브라우저 ipc에 `createSession` 추가.
- 이어서 T4(세션 CDP 엔드포인트) → T5·T6(필터) → T7~T13. 순서와 인수 사례는 `docs/tasks.md`.

## 막힌 것 · 결정 필요
- 없음. 참고: macOS 위치 요청은 거부되면 오류 없이 멈춘다(CLAUDE.md 함정). 테스트는 "권한 상태 denied + 위치 전달 안 됨"으로 확인한다.
