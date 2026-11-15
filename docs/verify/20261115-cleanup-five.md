# 검증: 20261115-cleanup-five (정본 `docs/spec-cleanup-five.md`)
판정 커밋 4423094 · 검증자: reviewer(새로 띄움, 수행 과정 모름) · 강도 보통 · 1회차 PASS

| 기준 | 판정 | 증거 (4423094에서 새로 만듦) |
|---|---|---|
| C1 끄는 중 다시 열기 | PASS | test:dist `packaged.spec.ts:285` 통과(0·20·50·100·300ms × 2 = 10회, 매번 런처 1·브라우저 1·새 런처 pid·화면 창). 검증자 추가 부하 시험 96회 실패 0. 고치기 전에는 같은 테스트가 "0ms 뒤 다시 열어 새 런처가 뜸(2번째)"에서 실패 |
| C2 실행 기록 크기 | PASS | `npx vitest run src/app/logRotate.test.ts` 4 passed. 호출 `src/app/entry.ts:18` |
| C3 인자 이름 한 곳에 | PASS | grep: 정의는 `src/shared/constants.ts:7-8`뿐, 사용처 `src/launcher/app.ts:74`, `src/browser/main.ts` 상수 사용 |
| C4 준비 전 실패 정리 | PASS | `tests/e2e/readyFail.spec.ts` 통과(179ms). 고치기 전 같은 테스트 Received 30066ms |
| C5 잘못된 설정 테스트 보강 | PASS | 정상 통과 + 검증자가 `app.exit(1)`을 막아 깨뜨리면 `packaged.spec.ts:272`에서 남은 시작 프로세스를 잡아 실패, 되돌린 뒤 통과 |
| 공통 | PASS | lint 0, build 0, `npm test` Vitest 159 + Playwright 66 passed, `npm run test:dist` 15 passed, 남은 앱 프로세스 0 |

Critical·Major: 없음.

## 후속 (Minor, 고칠지는 사람이 정한다)
| 항목 | 위치 |
|---|---|
| 자물쇠 잡기 실패와 pid 읽기 사이에 런처가 끝나면 아무것도 띄우지 않고 끝남(또는 kill ESRCH로 실패). 부하 96회에서 재현 0 | `src/app/entry.ts:67-74` |
| 이미 켜진 앱을 다시 열 때마다 시작 프로세스가 300ms 기다림 | `src/app/entry.ts:77-78` |
| 15초 기다려도 못 띄우면 기록 없이 0으로 끝남 | `src/app/entry.ts:46-56` |
| 로그 교체가 ENOENT 외 이유로 실패하면 앱 시작이 실패함 | `src/app/logRotate.ts:16` |
