# Progress
갱신: 2026-11-22 · 단계: 검증 끝, 머지·릴리스 대기 · 작업: 20261122-release-v022 외 · 브랜치: release/v0.2.2 (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- 배포: GitHub Release v0.2.1(2026-11-20, `Agent-Browser-0.2.1-arm64.dmg` + `install-mac.sh`). 다른 PC는 소스 없이 dmg로 설치하고 `claude mcp add` 한 줄로 붙인다(README 빠른 시작, `docs/setup.md`).
- main에 있는 것: 세션을 사람 창 안 탭 묶음으로(ADR-0009), Release CI, 따라 보기, 세션 이름, MCP 안내의 탭 쓰기, 업데이트 확인 안내.
- 머지 대기(검증 통과): #12 사람 창 UI 보호, #13 PR CI, #14 승인 알림·자동 거부, #15 v0.2.2(확인표, 11/15 후속 7건, aif 정리), #16 에이전트 탭 사람 입력 막기·R3. #15·#16에 앞의 것이 합쳐져 있어 함께 시험했다.
- 확인(합친 상태, Linux): lint·build 0, Vitest Linux에서 macOS 전용 9건 빼고 통과, E2E 창 표시 전체 통과. PR CI는 macOS에서 단위 전부 통과.
- Mac에서만 볼 수 있는 것은 `docs/verify/20261122-company-pc-check.md` 확인표로 사람이 본다. 특히 macOS 알림은 Electron 42부터 서명된 앱에서만 보여서 ad-hoc 서명인 이 앱에서 막힐 수 있다. 그래서 Dock 아이콘을 함께 튀긴다.

## 다음 할 일
- 사람: #12 → #13 → #14 → #15 → #16 순서로 머지한다.
- Claude: 머지 뒤 release workflow를 dispatch해 v0.2.2를 올린다(태그 push는 이 환경에서 막혀 있다).
- 사람(회사 PC): v0.2.2로 업데이트하고 확인표를 따라 한다. 결과를 Claude에게 주면 반영한다.

## 막힌 것 · 결정 필요
- 없음. 2026-11-22 사람 결정: embedded-sessions는 #1 머지로 전달된 것으로 닫았다. 저장소 공개는 회사가 정한 것이라 그대로 둔다. 보는 중 입력 잠그기·구석 1px 클릭·endpoint R3는 #16에서 고쳤다.
