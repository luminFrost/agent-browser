# Progress
갱신: 2026-11-15 · 단계: 전달 끝 · 작업: 20261115-launcher-lock-race · 브랜치: feat/launcher-lock (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- Mac 앱 묶기 완료. 검증 3회차 PASS(6d31bfc, `docs/verify/20261114-mac-app-package.md`, 사람용 `docs/verify/mac-app-report.html`).
- 전달(2026-11-15, 사람 승인 "승인, 합치기는 직접"): 원격 저장소가 없어 PR 없음. 배포 없음.
- 빌드 산출물: `npm run dist` → `release/Agent Browser-0.1.0-arm64.dmg`
  - 버전 0.1.0, Apple Silicon, 서명 없음(ad-hoc), Electron 45.3.2
  - 크기 119,504,838 바이트, SHA-256 `675afb55ed4733c9331493045994e8cd9a0277834b2aae02b9d0f70147a3c641`
  - 코드 기준 커밋 6d31bfc (그 뒤는 문서만 바뀜)
- 되돌리기: 응용 프로그램에서 앱 삭제, 필요하면 `~/Library/Application Support/agent-browser` 삭제. main에 합친 뒤라면 main을 합치기 전 커밋 6a47ec8로 되돌린다.
- 결정: ADR-0001~0008. 한 프로필 한 런처는 런처 자물쇠 파일(ADR-0008).

- 런처 자물쇠 3건 고침(20261115-launcher-lock-race, f546108, 검증 카드 `.aif/tasks/20261115-launcher-lock-race/card.md`, 사람용 `docs/verify/launcher-lock-report.html`). 전달 2026-11-15 사람 승인 "승인, 합치기는 직접".
  - 산출물 다시 만듦: `release/Agent Browser-0.1.0-arm64.dmg` (버전 0.1.0 그대로), SHA-256 `f39fd7e09666203113b16ba84783e4d6c72594c35adcd524839b8b2b94585550`
  - 되돌리기: main을 be94538로 되돌리고 `npm run dist`.

## 다음 할 일
- 사람: `git checkout main && git merge --ff-only feat/launcher-lock`으로 main에 합친다.
- 사람: dmg를 직접 열어 본다(처음 한 번 우클릭 → 열기). 회사 PC에서 서명 없는 앱이 열리는지 확인한다.
- 나머지 후속 Minor는 검증 보고의 "후속" 표에 있다.

## 막힌 것 · 결정 필요
- 없음.
