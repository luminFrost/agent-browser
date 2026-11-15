# 검증: 20261115-start-fixes (정본 `docs/spec-start-fixes.md`)
판정 커밋 22e2b62 · 검증자: reviewer(새로 띄움, 수행 과정 모름) · 강도 보통 · 1회차 PASS

| 기준 | 판정 | 증거 (22e2b62에서 새로 만듦) |
|---|---|---|
| D1 꺼지는 순간 다시 열기 | PASS | (가) `src/app/startDecision.ts:63-73` 자물쇠 사라지면 다시 잡기, 테스트 `startDecision.test.ts:380`. (나) `src/app/entry.ts:46-53` ESRCH→false, `startDecision.ts:79` → waitAndStart, 테스트 `:388`·`:396`. 검증자가 복사본에서 각 줄을 깨뜨리면 해당 테스트 실패 |
| D2 고정 대기 없앰 | PASS | 런처 `src/launcher/cli.ts:26-33`(끄는 중 아님 + focus 응답 뒤에만 `.ack`), 시작 `startDecision.ts:82-88`(10ms 간격, 300ms 뒤 대체). 단위 `:406`(50ms 미만), `:413`(이전 표시 무시), `:423`(끄는 중). 묶은 앱 E2E P5 `tests/dist/packaged.spec.ts:161` `.ack`=런처 pid 통과. 깨뜨림 확인 2건 실패 |
| D3 15초 실패 알림 | PASS | `startDecision.ts:102-107` timeout → 기록 1줄·알림 1회·1 반환, 연결 `entry.ts:60`(launcher.log), `:62`(`dialog.showErrorBox`), `:72`(`app.exit(start())`). 테스트 `startDecision.test.ts:439`. 실제 오류 창 모양은 spec상 대상 아님 |
| D4 기록 교체 실패해도 시작 | PASS | `src/app/logRotate.ts:11-14`, 테스트 `logRotate.test.ts:32`(.1 자리에 비지 않은 폴더). ENOENT 외 다시 던지게 바꾸면 실패 |
| 공통 | PASS | lint 0, build 0, `npm test` Vitest 177 + Playwright 66 passed, `npm run test:dist` 15 passed(C1 끄는 중 다시 열기 10회 포함), 남은 앱 프로세스 0 |

Critical·Major: 없음.

## 후속 (Minor, 고칠지는 사람이 정한다)
| 항목 | 위치 |
|---|---|
| 자물쇠가 3번 넘게 연달아 사라지면 아무것도 띄우지 않고 알림 없이 0으로 끝남(가능성 매우 낮음) | `src/app/startDecision.ts:72` |
| P5 E2E가 `.ack`를 바로 읽음: 브라우저 focus 응답이 300ms 넘게 늦으면 가끔 실패할 수 있음 | `tests/dist/packaged.spec.ts:161` |
| 타임스탬프가 거친 파일시스템(HFS+·FAT·네트워크)이면 받음 표시를 인정 못 하고 300ms 대기로 돌아감(동작은 유지) | `src/app/launcherLock.ts:117` |
| (변경 밖) ESRCH 외 신호 오류(EPERM 등)는 오류 창 없이 종료 코드 1 | `src/app/entry.ts:51-52` |
