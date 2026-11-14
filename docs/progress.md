# Progress
갱신: 2026-11-14 · 단계: 전달 끝 · 작업: 20261114-agent-browser · 브랜치: main (feat/agent-browser와 같음)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- T0~T13 완료. 검증 5회차 PASS(68dbfd1, `docs/verify/20261114-agent-browser.md`, 사람용 `docs/verify/report.html`).
- 전달(2026-11-14): 원격 저장소가 없어 PR 없이 로컬 `main` 브랜치를 작업 브랜치에서 만들었다(사람 결정). 배포 없음.
- 빌드 산출물: `npm run build` → `dist/{launcher,browser,shared}` (exit 0). 앱 버전 0.1.0, Electron 45.3.2.
- 실행: `npm start` 또는 `node dist/launcher/cli.js [--profile <dir>] [--control-port <n>] [--hidden] [--log-blocked]`. 에이전트는 `<프로필>/control.json`의 port·token으로 `POST /sessions` → `browserUrl`을 chrome-devtools-mcp `--browserUrl`이나 Playwright `connectOverCDP`에 넣는다.
- 결정: ADR-0001~0007. 파일 올리기·서비스 워커는 한계로 기록(ADR-0007).

## 다음 할 일
- 사람: `npm start`로 실제 화면과 회사 계정 로그인을 한 번 확인한다(검사는 창을 숨긴 채 돌았다).
- 후속 Minor는 검증 보고의 "후속" 표에 있다. 고칠지는 사람이 정한다.

## 막힌 것 · 결정 필요
- 없음.
- 정리할 것: `spike/`(gitignore, 커밋 안 됨)는 지워도 된다.
