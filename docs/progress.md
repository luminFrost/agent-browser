# Progress
갱신: 2026-11-15 · 단계: 전달 끝 · 작업: 20261115-start-fixes · 브랜치: feat/start-fixes (main에 합치기는 사람이 한다)
덮어쓴다. 기록이 아니라 현재 상태다.

## 지금 상태
- Mac 앱 묶기, 런처 자물쇠 3건, 정리 5건은 main에 합침(61964e6).
- 앱 시작 결함 4건 고침(20261115-start-fixes): 꺼지는 순간 다시 열기(D1), 받음 표시로 0.3초 고정 대기 없앰(D2), 15초 실패 때 오류 창 + 기록(D3), 기록 교체 실패해도 시작(D4).
  - 검증 1회차 PASS(22e2b62, `docs/verify/20261115-start-fixes.md`, 사람용 `docs/verify/start-fixes-report.html`).
  - 전달 2026-11-15, 사람 승인 "승인, 합치기는 직접". 원격 저장소가 없어 PR 없음. 배포 없음.
- 빌드 산출물: `npm run dist` → `release/Agent Browser-0.1.0-arm64.dmg`
  - 버전 0.1.0 그대로, Apple Silicon, 서명 없음(ad-hoc)
  - 크기 119,520,327 바이트, SHA-256 `374e55255528da25c8bbd12be0a991b00505bd7820389928166111c95e542077`
  - 코드 기준 커밋 22e2b62 (그 뒤는 문서만 바뀜)
- 되돌리기: main을 61964e6으로 되돌리고 `npm run dist`.
- 결정: ADR-0001~0008. 한 프로필 한 런처는 런처 자물쇠 파일, 끄는 중 표시, 받음 표시(ADR-0008 4-1~4-3).

## 다음 할 일
- 사람: `git checkout main && git merge --ff-only feat/start-fixes`로 main에 합친다.
- 사람: dmg를 직접 열어 본다(처음 한 번 우클릭 → 열기). 회사 PC에서 서명 없는 앱이 열리는지 확인한다.
- 후속 Minor 4건은 `docs/verify/20261115-start-fixes.md` "후속" 표에 있다(급하지 않음).

## 막힌 것 · 결정 필요
- 없음.
