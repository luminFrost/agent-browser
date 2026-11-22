# Progress
갱신: 2026-11-22 · 단계: 전달 끝 · v0.2.2 Release
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- 배포: GitHub Release v0.2.2(2026-11-22, `Agent-Browser-0.2.2-arm64.dmg` + `install-mac.sh`). PR #12~#17이 들어갔다(사람 창 UI 보호, PR CI, 승인 알림·자동 거부, 회사 PC 확인표, 11/15 후속, 에이전트 탭 사람 입력 막기, 시작 중 끄기 결함).
- 첫 릴리스 실행은 묶은 앱 시험 C1이 새 러너 이미지(macOS 15.8.2)에서 실패했다. 시작 중 SIGTERM에 브라우저가 남는 기존 결함이었고 #17로 고친 뒤 통과했다.

## 다음 할 일
- 사람(회사 PC): v0.2.2로 업데이트하고 `docs/verify/20261122-company-pc-check.md` 확인표를 따라 한다. 결과를 Claude에게 주면 반영한다.
- 사람: GitHub에 남은 임시 브랜치 `bisect/c1-v021`·`bisect/c1-main`·`bisect/c1-fix`를 지운다(이 환경은 원격 브랜치를 지울 수 없다).

## 막힌 것 · 결정 필요
- 없음.
