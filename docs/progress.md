# Progress
갱신: 2026-11-23 · 단계: 전달 끝 · v0.2.3 Release
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- 배포: GitHub Release v0.2.3(2026-11-23, `Agent-Browser-0.2.3-arm64.dmg` + `install-mac.sh`). Release CI run 45098747320: 단위 252/252, 묶은 앱 16/16.
- v0.2.3에 들어간 것(PR #21, 카드 20261123-qa-followups): 승인을 기다리는 세션을 보는 중에는 다른 세션의 새 승인 요청이 화면을 옮기지 않음, 에이전트가 `Page.bringToFront`(select_page)로 고른 탭이 사람 화면에 보임, 앱 메뉴(다시 로드·개발자 도구 없음), 차단 페이지 탭 제목, 이름 입력 40자, `npm test`가 단위 실패에도 E2E까지, `package.json` main, `--log-blocked` 시험, 회사 PC 확인표 v0.2.3.
- 회사 PC 확인표 v0.2.2 결과 v1(PR #22): 설치된 앱이 0.2.1이라 35항목 중 3개만 판정, 기능 확인은 아직 없다. 회사 PC 사용은 사람이 가능하다고 확인했다(2026-11-23).
- 회사 PC 확인표 v0.2.3 결과(`docs/verify/20261123-company-pc-check-result.md`, 2026-11-23): 회사 PC를 0.2.3으로 올려 40항목 확인. 안 됨 0, OK 23, 모름 1(9-4 알림을 누르면 창이 앞으로 오는지), 11개는 Linux E2E가 보는 항목이라 사람 확인을 뺐다. 창 최소화·Cmd+H·가림에서도 스크린샷이 멈추지 않고(6장), 다른 앱에 칠 때 select_page가 창을 앞으로 끌어오지 않는다(7-3). ad-hoc 서명이어도 macOS 알림이 뜬다(9-2).
- 프로젝트 산출물(claude.ai Project automation `agent-browser/`): 1~6단계 문서 9개 발행. 판정은 조건부 완료(회사 PC 확인 대기).

## 다음 할 일
- 다음 회사 PC 확인 때: 9-4(승인 알림을 누르면 사람 창이 앞으로 오고 그 세션이 보이는지), 9-2의 Dock 튐·배지 `1`을 본다(v0.2.3 결과에서 모름).
- 사람: GitHub에 남은 임시 브랜치 `bisect/c1-v021`·`bisect/c1-main`·`bisect/c1-fix`를 지운다.
- 후속 후보(영향 하): 다운로드 승인 대기 중 앱 종료 시 처리되지 않은 Promise 거부(CR-01), 탭 키보드 선택(UI-F5), 어두운 모드 색(UI-F7, 확인표 11-4 뒤).

## 막힌 것 · 결정 필요
- 없음. (UI-F2는 추천안으로 들어갔다. 바꾸려면 `humanWindow.ts` attention 한 줄과 formGate.spec Q2)
