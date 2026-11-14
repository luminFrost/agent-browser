# Progress
갱신: 2026-11-14 · 단계: 검증 끝(PASS) → 전달 대기 · 작업: 20261114-agent-browser · 브랜치: feat/agent-browser
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- `docs/tasks.md`의 T0~T13 모두 완료, 커밋됨. spec 인수 사례 R1~R13마다 E2E가 있다.
- 마지막 확인(커밋 feacd8c): `npm run lint` 통과, `npm test` 통과(단위 73, E2E 47), `npm run build` 통과.
- 결정 기록: ADR-0001(프록시), ADR-0002(런처 + `--remote-debugging-pipe` + ipc), ADR-0003(비밀 경로·관문 방식), `docs/design.md`(브라우저 수준 명령 흉내, 소유권, page의 짝 tab 대상, R7 차단 범위).
- 실행: `npm start` 또는 `node dist/launcher/cli.js [--profile <dir>] [--control-port <n>]`. 에이전트는 `<프로필>/control.json`의 port·token으로 `POST /sessions` → `browserUrl`을 chrome-devtools-mcp `--browserUrl`이나 Playwright `connectOverCDP`에 넣는다.
- R11 상태별 스크린샷: `npm test` 뒤 `test-results/watch-*/R11-*.png`(3장: 빈 상태, 세션 2개, 멈춘 뒤).

## 다음 할 일
- `/aif-deliver`로 전달한다(사람 승인 지점).
- 검증 5회차 PASS(68dbfd1). 보고: `docs/verify/20261114-agent-browser.md`. 사람 확인 항목 4개(파일 올리기, 서비스 워커, 실제 화면, Electron 버전)와 후속 Minor가 그 보고에 있다.

## 막힌 것 · 결정 필요
- 없음.
- 알려진 한계(spec·design에 있음): `fetch`·XHR 전송은 폼 관문을 지나간다. 쿠키 설정(`Network.setCookie[s]`)은 막지 않는다. macOS 위치 요청은 거부 시 오류 없이 멈춘다.
- 정리할 것: `spike/`(gitignore, 커밋 안 됨)는 검증 뒤 지워도 된다.
