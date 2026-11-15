# Progress
갱신: 2026-11-15 · 단계: 전달 끝 · 작업: 20261115-claude-attach · 브랜치: feat/claude-attach (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- main에 합친 것: Mac 앱 묶기, 런처 자물쇠 3건, 정리 5건, 앱 시작 결함 4건(501e8f4).
- Claude Code에서 바로 붙기(20261115-claude-attach):
  - 앱 안의 `Contents/Resources/agent-browser-mcp`를 `claude mcp add`로 한 번 등록하면 된다. 그 뒤로는 세션마다 에이전트 창이 생기고, 세션이 끝나면 닫히고, 앱이 꺼져 있으면 켠다.
  - chrome-devtools-mcp를 함께 넣었다. Google 사용 통계와 CrUX는 끈다.
  - 세션 닫기 API(`DELETE /sessions/<id>`)와 붙잡은 세션(`POST /sessions?hold=1`)을 넣었다.
  - 사용 안내는 `README.md`에 있다.
  - 검증 1회차 PASS(3a186aa). 보고는 `docs/verify/20261115-claude-attach.md`, 사람용은 `docs/verify/claude-attach-report.html`. 검사자가 실제 `claude -p`로 붙여 봤다.
  - 전달 2026-11-15. 사람 승인 "승인, 합치기는 직접". 원격 저장소가 없어 PR은 없고, 배포도 없다.
- 빌드 산출물: `npm run dist` → `release/Agent Browser-0.1.0-arm64.dmg`
  - 버전 0.1.0 그대로, Apple Silicon, 서명 없음(ad-hoc)
  - 크기 123,057,367바이트, SHA-256 `24decc45390e932cc768a3990de1290f1603e1e823fbcc00856cae8234368024`
  - 코드 기준 커밋 3a186aa(그 뒤로는 문서만 바뀌었다)
- 되돌리기: main을 501e8f4로 되돌리고 `npm run dist`를 실행한다. Claude Code 쪽은 `claude mcp remove --scope user agent-browser`.
- 결정: ADR-0001~0008.

## 다음 할 일
- 사람: `git checkout main && git merge --ff-only feat/claude-attach`로 main에 합친다.
- 사람(회사 PC):
  - dmg를 설치하고 처음 한 번은 우클릭 → 열기로 연다.
  - `claude mcp add --scope user agent-browser -- "/Applications/Agent Browser.app/Contents/Resources/agent-browser-mcp"`를 실행한다.
  - 서명 없는 앱이 열리는지 확인한다.
- 후속은 `docs/verify/20261115-claude-attach.md` "후속" 표에 있다. Minor 1건: 사람이 에이전트 창을 닫으면 그 Claude 세션은 `/mcp`로 다시 연결해야 한다.

## 막힌 것 · 결정 필요
- 없음.
