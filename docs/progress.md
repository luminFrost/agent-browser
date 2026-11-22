# Progress
갱신: 2026-11-22 · 단계: 검증 끝, 머지·릴리스 대기 · 작업: 20261122-release-v022 외 · 브랜치: release/v0.2.2 (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- 배포: GitHub Release v0.2.1(2026-11-20, `Agent-Browser-0.2.1-arm64.dmg` + `install-mac.sh`). 다른 PC는 소스 없이 dmg로 설치하고 `claude mcp add` 한 줄로 붙인다(README 빠른 시작, `docs/setup.md`).
- main에 있는 것: 세션을 사람 창 안 탭 묶음으로(ADR-0009), Release CI, 따라 보기, 세션 이름, MCP 안내의 탭 쓰기, 업데이트 확인 안내.
- 머지 대기(검증 통과): #12 사람 창 UI 보호, #13 PR CI, #14 승인 알림·자동 거부, #15 v0.2.2(확인표, 11/15 후속 7건, aif 정리). #15에 앞의 셋이 합쳐져 있어 함께 시험했다.
- 확인(합친 상태, Linux): lint·build 0, Vitest Linux에서 macOS 전용 9건 빼고 통과, E2E 창 표시 전체 통과. PR CI는 macOS에서 단위 전부 통과.
- Mac에서만 볼 수 있는 것은 `docs/verify/20261122-company-pc-check.md` 확인표로 사람이 본다. 특히 macOS 알림은 Electron 42부터 서명된 앱에서만 보여서 ad-hoc 서명인 이 앱에서 막힐 수 있다. 그래서 Dock 아이콘을 함께 튀긴다.

## 다음 할 일
- 사람: #12 → #13 → #14 → #15 순서로 머지한다.
- Claude: 머지 뒤 release workflow를 dispatch해 v0.2.2를 올린다(태그 push는 이 환경에서 막혀 있다).
- 사람(회사 PC): v0.2.2로 업데이트하고 확인표를 따라 한다. 결과를 Claude에게 주면 반영한다.

## 막힌 것 · 결정 필요
- 20261119-embedded-sessions(표준 경로, 규모 M)의 검증 게이트가 4회 FAIL 뒤 열린 채다. 자동 수정 횟수를 넘어 사람 결정이 필요하다. 그 뒤 고친 내용은 #1로 머지됐고, 이후 작업들의 E2E가 그 동작을 계속 시험한다. 새 reviewer로 다시 검증할지, 머지로 전달된 것으로 닫을지 정한다.
- 세션을 보는 동안 페이지 입력 잠그기, 구석 1px 클릭, endpoint R3 가끔 실패: 고칠지 사람이 정한다.
- 저장소가 공개라 커밋 작성자 이메일이 보인다. 앞으로 noreply로 바꿀지 정한다.
