# Progress
갱신: 2026-11-15 · 단계: 전달 끝 · 작업: 20261115-company-setup · 브랜치: feat/company-setup (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- main에 합친 것: Mac 앱 묶기, 런처 자물쇠, 정리 5건, 앱 시작 결함 4건, Claude Code 붙이기(0859ad2).
- 회사 PC에서 Claude가 설치하고 쓰기(20261115-company-setup):
  - 회사 PC 절차: GitHub에서 저장소를 받고 Claude에게 "docs/setup.md대로 설치해 줘"라고 한다. Claude가 `scripts/install-mac.sh`로 빌드(안 되면 Release dmg `--from-dmg`), 앱 복사, `claude mcp add --scope user`, 확인까지 한다.
  - 붙이기 명령이 MCP initialize 안내에 "쓸 때 알 것"을 덧붙인다(`AGENT_BROWSER_GUIDE`).
  - dmg 이름을 `Agent-Browser-<버전>-arm64.dmg`로 바꿨다. GitHub Release 자산 이름에는 공백을 쓸 수 없다.
  - `.gitignore`에 `.aif/tasks/`와 `.DS_Store`를 넣었다.
  - 검증 2회차 PASS(723bf82). 1회차 FAIL은 Release 받기 명령의 dmg 이름 때문이었다. 보고는 `docs/verify/20261115-company-setup.md`, 사람용은 `docs/verify/company-setup-report.html`.
  - 전달 2026-11-15, 사람 승인 "승인, 합치기는 직접". 원격 저장소는 아직 없다.
- 빌드 산출물: `release/Agent-Browser-0.1.0-arm64.dmg`. 버전 0.1.0, Apple Silicon, 서명 없음, 123,060,157바이트, SHA-256 `fecd2a54b1c865ab1ede4f84636aca4999dec2ffd273438cc30c348940fb2ba7`.
- 되돌리기: main을 0859ad2로 되돌린다. 설치한 PC에서는 `claude mcp remove --scope user agent-browser`를 실행한다.

## 다음 할 일
- 사람: `git checkout main && git merge --ff-only feat/company-setup`으로 합친다.
- 사람: GitHub에 비공개 저장소를 만들고 main만 push한다. `docs/install-guide` 브랜치(개인 경로가 든 옛 안내)는 올리지 않는다. 지워도 된다.
- 사람(회사 PC): clone → `claude` → "docs/setup.md대로 agent-browser를 설치해 줘" → 앱 첫 실행 허용 → 회사 계정 로그인.
- 빌드가 막히면 개발 Mac에서 `docs/setup.md` "Release 올리기"를 실행한다.
- 후속: `docs/verify/20261115-company-setup.md` "후속" 7건, `docs/verify/20261115-claude-attach.md` "후속".

## 막힌 것 · 결정 필요
- 없음.
