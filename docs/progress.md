# Progress
갱신: 2026-11-23 · 단계: 전달 끝 · v0.2.3 Release
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- 배포: GitHub Release v0.2.3(2026-11-23, `Agent-Browser-0.2.3-arm64.dmg` + `install-mac.sh`). Release CI run 45098747320: 단위 252/252, 묶은 앱 16/16.
- v0.2.3에 들어간 것(PR #21, 카드 20261123-qa-followups): 승인을 기다리는 세션을 보는 중에는 다른 세션의 새 승인 요청이 화면을 옮기지 않음, 에이전트가 `Page.bringToFront`(select_page)로 고른 탭이 사람 화면에 보임, 앱 메뉴(다시 로드·개발자 도구 없음), 차단 페이지 탭 제목, 이름 입력 40자, `npm test`가 단위 실패에도 E2E까지, `package.json` main, `--log-blocked` 시험, 회사 PC 확인표 v0.2.3.
- 회사 PC 확인표 v0.2.2 결과 v1(PR #22): 설치된 앱이 0.2.1이라 35항목 중 3개만 판정, 기능 확인은 아직 없다. 회사 PC 사용은 사람이 가능하다고 확인했다(2026-11-23).
- 프로젝트 산출물(claude.ai Project automation `agent-browser/`): 1~6단계 문서 9개 발행. 판정은 조건부 완료(회사 PC 확인 대기).

## 다음 할 일
- 사람(회사 PC): 앱을 끄고 0.2.1에서 0.2.3으로 바로 업데이트한 뒤 `docs/verify/20261123-company-pc-check.md`(40항목, v0.2.2 35항목 포함)를 원문 그대로 따라 한다. v0.2.2 확인표는 건너뛴다. 결과를 Claude에게 주면 반영한다.
- 사람: GitHub에 남은 임시 브랜치 `bisect/c1-v021`·`bisect/c1-main`·`bisect/c1-fix`를 지운다.
- 후속 후보(영향 하): 다운로드 승인 대기 중 앱 종료 시 처리되지 않은 Promise 거부(CR-01), 탭 키보드 선택(UI-F5), 어두운 모드 색(UI-F7, 확인표 11-4 뒤).

## 막힌 것 · 결정 필요
- 없음. (UI-F2는 추천안으로 들어갔다. 바꾸려면 `humanWindow.ts` attention 한 줄과 formGate.spec Q2)
