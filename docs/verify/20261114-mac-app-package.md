# 검증: 20261114-mac-app-package (Mac 앱 묶기)
기준: `docs/spec-mac-app.md` · 규모 M · 강도 엄격

## 1회차 — 커밋 b90de33 · FAIL
| 기준 | 판정 | 증거 |
|---|---|---|
| P1 묶기 | PASS | reviewer: `release/Agent Browser-0.1.0-arm64.dmg`, `lipo -archs` = arm64, `npm run test:dist` 6/6 |
| P2 Node 없이 실행 | PASS | reviewer: PATH=/usr/bin:/bin에 node 없음, 시작 exit 0, control.json 0600, POST /sessions → browserUrl, connectOverCDP |
| P3 보안 불변식 | PASS | reviewer: 앱 pid 전체 `lsof` LISTEN은 런처 127.0.0.1 하나, 브라우저·도우미 inet 없음, 토큰 없음/틀림 401 |
| P4 끝내기 | PASS (사람 창 닫기 경로는 확인 못 함) | reviewer: `osascript quit`·SIGTERM 뒤 0개, control.json 삭제. 창 닫기는 보조 접근 권한 없음(-1719) |
| P5 두 번 열기 | **FAIL** | reviewer race.txt: 새 프로필로 0.05초 간격 두 번 실행 → 런처 2개·브라우저 2개 동시 존재(`src/app/entry.ts:20-27` 자물쇠를 놓은 뒤 런처를 띄움). code-review도 같은 지적(Major) |
| P6 비정상 종료 | PASS | reviewer: kill -9 뒤 2초 안에 0개, 다음 실행 201 |
| P7 기존 동작 | PASS | lint 0, Vitest 146, E2E 64, build 0, `npm start` 동작 |

code-review Major(이번 변경 안): 시작 실패가 아무 기록 없이 사라짐(`entry.ts:26`), 시작 프로세스 최상위 예외로 프로세스가 남음(`entry.ts:18`). → FAIL로 다룬다.

## 2회차 — 커밋 c39333a · FAIL (P5 두 번 연속 → 멈추고 사람 결정)
| 기준 | 판정 | 증거 |
|---|---|---|
| P1 | PASS | reviewer: dmg `Agent Browser-0.1.0-arm64.dmg`, arm64, plist 0.1.0 |
| P2 | PASS | reviewer 탐침: PATH=/usr/bin:/bin, control.json 600, POST 201 |
| P3 | PASS | reviewer 탐침: LISTEN은 런처 127.0.0.1 하나, 브라우저·도우미 inet 없음, 401 |
| P4 | PASS (사람 창 닫기 경로는 확인 못 함: 접근성 권한 없음 -1719) | Apple Event quit·SIGTERM 뒤 0개 |
| P5 | **FAIL** | reviewer `scratchpad/r2/burst3.mjs 120 8`: 8ms 간격 120회 연속 실행 13번 중 4번 런처·브라우저 2~3개 공존, SingletonLock이 나중 브라우저로 바뀜. 정상 조건(2회 실행 0~900ms, CPU 부하 포함)은 통과. code-review Major 2건: 시작 프로세스가 Chromium 자물쇠를 잠깐 잡아 막 뜨는 브라우저와 경쟁, 낡은 표시를 pid 생존만으로 판정(pid 재사용 시 앱이 안 열림) |
| P6 | PASS | kill -9 브라우저·런처 모두 정리, 다시 열기 201 |
| P7 | PASS | lint 0, Vitest 152, E2E 64, build 0, npm start |

원인(추정): 시작 프로세스가 Chromium 단일 인스턴스 자물쇠를 직접 건드린다. 실행 중인 브라우저가 바빠 응답이 늦으면 Chromium은 그 쪽을 멈춘 것으로 보고 자물쇠를 가져간다. 그 뒤 시작 표시는 이미 지워져 있어 둘째 런처가 뜬다. 설계 문제 → 사람 결정.

## 3회차 — 커밋 6d31bfc · PASS (ADR-0008 방식, 사람 결정 "A. 방식을 바꿔 고친다")
| 기준 | 판정 | 증거 |
|---|---|---|
| P1 묶기 | PASS | reviewer: `release/Agent Browser-0.1.0-arm64.dmg`, `lipo -archs` arm64, Info.plist 0.1.0 |
| P2 Node 없이 실행 | PASS | reviewer: `env -i PATH=/usr/bin:/bin` 시작 exit 0, control.json 600, POST 201, `packaged.spec.ts:103`(창 소유자·connectOverCDP) |
| P3 보안 불변식 | PASS | reviewer: LISTEN은 런처 127.0.0.1 두 개뿐, 브라우저·도우미 TCP 없음, 브라우저 인자 `--remote-debugging-pipe`, 401 |
| P4 끝내기 | PASS | `packaged.spec.ts:162`(SIGTERM 뒤 0개·control.json 삭제), 사람 창 닫기는 `tests/e2e/termination.spec.ts` 마지막 테스트(브라우저 끝남) + `cli.ts` `exited.then(stop)` |
| P5 두 번 열기 | PASS | reviewer 탐침: 8ms×120회 7번(부하 없음)·4번(8코어 부하) 모두 런처·브라우저 최대 1, 낡은 자물쇠 3종 각 3번 최대 1, 동시 30개 10번 런처 1, 다시 열기 시 브라우저가 맨 앞, control.json md5 그대로. `npm run test:dist` 14/14 |
| P6 비정상 종료 | PASS | reviewer: 브라우저·런처 kill -9 각각 0.4초 안 정리, 다시 열기 정상 |
| P7 기존 동작 | PASS | reviewer: lint 0, Vitest 152, Playwright 65, build 0, `npm start` 정상, 같은 프로필 중복 `npm start`는 "이미 다른 런처" 오류로 종료 |

code-review(검증 없이 심각도 자체 판정) Major 6건을 직접 확인한 결과(Minor로 둔다):
- 끄자마자 다시 열기: `scratchpad/reopen.sh` — 종료 신호 뒤 0.01~0.06초 간격 6번 중 1번(약 0.02초) 열리지 않음, 0.1~0.6초 간격 6번 모두 열림. 사람 조작으로는 생기기 어려움.
- 낡은 자물쇠 동시 치우기에서 주인 둘: reviewer가 함수 단위로 재현(동시 30개, 40번 중 31번), 앱 단위로는 재현 안 됨(동시 30개 실행 10번 모두 런처 1).
- 다른 프로필 런처 pid를 이 앱의 런처로 오인: reviewer 재현(자물쇠 파일을 다른 프로필에 복사한 경우). 프로필 폴더 복사·재부팅 뒤 pid 재사용에서만.
- 런처가 10초 넘게 pid를 못 적는 경우, 런처 띄우기 실패 시 빈 자물쇠 10초, 환경 변수 자물쇠 경로를 믿음: 재현 안 함(조건이 드묾).

## 후속 (Minor, 고칠지는 사람이 정한다)
| 항목 | 위치 |
|---|---|
| 낡은 자물쇠 동시 치우기 경쟁(함수 단위) | `src/app/launcherLock.ts:34-43` |
| 자물쇠 pid 판별에 프로필 비교 없음 | `src/app/launcherLock.ts:82` |
| 끄자마자(약 0.02초 안) 다시 열면 안 열림 | `src/app/entry.ts:40` |
| launcher.log 크기 제한 없음 | `src/app/entry.ts:16` |
| 잘못된 환경 값 테스트가 시작 프로세스 잔존을 못 잡음 | `tests/dist/packaged.spec.ts` |
| `--ab-hidden`·`--ab-downloads=`가 공유 상수가 아님 | `src/launcher/app.ts:74` |
| 준비 전 실패 때 ready 대기 타이머 30초 남음 | `src/launcher/app.ts` |
