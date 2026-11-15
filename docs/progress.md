# Progress
갱신: 2026-11-15 · 단계: 전달 끝 · 작업: 20261115-cleanup-five · 브랜치: feat/cleanup-five (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- Mac 앱 묶기 완료(20261114-mac-app-package), 런처 자물쇠 3건(20261115-launcher-lock-race) main에 합침(43d0f80).
- 정리 5건 고침(20261115-cleanup-five): 끄는 중 다시 열기(C1), launcher.log 1MB 교체(C2), 브라우저 인자 상수(C3), 준비 전 실패 3초 안 종료(C4), 잘못된 설정 테스트 보강(C5).
  - 검증 1회차 PASS(4423094, `docs/verify/20261115-cleanup-five.md`, 사람용 `docs/verify/cleanup-five-report.html`).
  - 전달 2026-11-15, 사람 승인 "승인, 합치기는 직접". 원격 저장소가 없어 PR 없음. 배포 없음.
- 빌드 산출물: `npm run dist` → `release/Agent Browser-0.1.0-arm64.dmg`
  - 버전 0.1.0 그대로, Apple Silicon, 서명 없음(ad-hoc)
  - 크기 119,515,323 바이트, SHA-256 `5ffdf2b59ec7466fc0d9e939f376e1b1eb395650828dba07bacc6df7eb6f3686`
  - 코드 기준 커밋 f846578 (그 뒤는 문서만 바뀜)
- 되돌리기: main을 43d0f80으로 되돌리고 `npm run dist`.
- 결정: ADR-0001~0008. 한 프로필 한 런처는 런처 자물쇠 파일, 끄는 중 표시(ADR-0008).

## 다음 할 일
- 사람: `git checkout main && git merge --ff-only feat/cleanup-five`으로 main에 합친다.
- 사람: dmg를 직접 열어 본다(처음 한 번 우클릭 → 열기). 회사 PC에서 서명 없는 앱이 열리는지 확인한다.
- 후속 Minor 4건은 `docs/verify/20261115-cleanup-five.md` "후속" 표에 있다(급하지 않음).

## 막힌 것 · 결정 필요
- 없음.
