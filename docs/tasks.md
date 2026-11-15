# Tasks: agent-browser
spec: docs/spec.md · 작업 하나 = 리뷰 가능한 크기, 커밋 하나 · ADR: docs/adr/

확인 명령(T1 이후): `npm test` (Vitest 단위 + Playwright E2E), `npm run lint` (ESLint + tsc --noEmit), `npm run build`

| # | 작업 | 파일 | 인수 사례 (spec R#) | 확인 명령 | 상태 |
|---|---|---|---|---|---|
| T0 | 스파이크: 남은 확인 필요 3건을 작게 시험한다. ① 내부 CDP 포트 우회 막기(ADR-0001 전제) ② 경로에 비밀값이 붙은 URL을 chrome-devtools-mcp·Playwright가 받는지 ③ 에이전트 창의 최상위 POST·다운로드를 요청 전에 붙잡고 창을 구분할 수 있는지. 결과는 ADR로 남긴다. 코드는 `spike/`에 두고 남기지 않는다 | `spike/**`(커밋 안 함), `docs/adr/0002~` | R3·R4·R10·R12·R13의 가능 여부 | 스파이크 출력 | [x] 모두 가능 (ADR-0002·0003) |
| T1 | 뼈대: package.json, tsconfig, ESLint, Vitest, Playwright, Electron 실행. `.aif/config.yaml` commands 채우기 | `package.json`, `tsconfig.json`, `eslint.config.*`, `vitest.config.*`, `playwright.config.*`, `src/launcher/index.ts`, `src/browser/main.ts` | (구조 커밋) | `npm test`, `npm run lint`, `npm run build` | [x] |
| T2 | 사람 창: 주소창·탭·뒤로/앞으로/새로고침, 로딩 표시와 오류 페이지, 권한 요청 기본 거부 | `src/browser/humanWindow.ts`, `src/browser/renderer/human/**` | R1(앱 실행 → 사람 창 1개) | `npm test` | [x] |
| T3 | 제어 서버: 토큰 파일(0600), `POST /sessions`, 127.0.0.1 바인딩, 토큰 없음/틀림 → 401. 세션 생성 시 에이전트 창 1개 생성 | `src/launcher/control/**`, `src/launcher/config.ts` | R1(세션 → 창 1개), R3(앞부분), R10(토큰·바인딩) | `npm test` | [x] |
| T4 | 세션 CDP 엔드포인트: 세션별 포트 + 비밀 경로, `/json/version`·`/json/list`·WebSocket 중계(ADR-0001 프록시) | `src/launcher/cdp/sessionEndpoint.ts`, `src/launcher/cdp/relay.ts` | R3, R10(없는 세션·비밀 경로 없음 → 거부) | `npm test` | [x] |
| T5 | 탭 격리 필터: 목록·`Target.getTargets`·`setDiscoverTargets` 이벤트 거르기, 남의 targetId attach 거부, `createTarget`·팝업이 세션 창에 생기게 | `src/launcher/cdp/filter.ts` | R5, R6 | `npm test` | [x] |
| T6 | 공유 상태 보호: 브라우저 전체에 영향을 주는 명령 차단 목록 | `src/launcher/cdp/filter.ts` | R7 | `npm test` | [x] |
| T7 | 기존 도구 호환 E2E: chrome-devtools-mcp navigate·snapshot, Playwright `connectOverCDP` 열기·클릭 | `tests/e2e/compat.spec.ts` | R4 | `npm test` | [x] |
| T8 | 로그인 공유: 로컬 테스트 서버 로그인 → 세션 탭에서 로그인 상태, 재시작 후 유지 | `tests/fixtures/server.ts`, `tests/e2e/login.spec.ts` | R2 | `npm test` | [x] |
| T9 | 동시 세션: A·B 동시 navigate | `tests/e2e/concurrency.spec.ts` | R8 | `npm test` | [x] |
| T10 | 종료: 멈추기·창 닫기 → 연결 끊김, browserUrl 응답 없음, B는 유지 | `src/launcher/sessions.ts`, `src/browser/sessionWindows.ts` | R9 | `npm test` | [x] |
| T11 | 지켜보기: 사람 창의 세션 목록·탭 URL·멈추기 버튼, 빈 상태 문구, 상태별 스크린샷 | `src/browser/renderer/human/sessions*` | R11 | `npm test` + 스크린샷 | [x] |
| T12 | 폼 제출 관문: 에이전트 창의 최상위 POST를 붙잡고 사람 창에 허용/거부, 거부 시 차단 오류 페이지, GET은 묻지 않음 | `src/browser/gate/**` | R12 | `npm test` | [x] |
| T13 | 다운로드 관문: 에이전트 창의 다운로드 허용/거부, 사람 창 다운로드는 묻지 않음 | `src/browser/gate/**` | R13 | `npm test` | [x] |

T0 결과에 따라 T4·T12·T13의 방식이 바뀔 수 있다. 완료 기준을 지킬 수 없다고 나오면 진행하지 않고 spec 수정·ADR·재승인을 거친다.

## 20261115-cleanup-five (정본 `docs/spec-cleanup-five.md`)
| # | 작업 | 바꿀 파일 | 인수 사례 | 확인 명령 | 완료 |
|---|---|---|---|---|---|
| K1 | 브라우저 인자 이름 공유 상수로(구조 커밋) | `src/shared/constants.ts`, `src/launcher/app.ts`, `src/browser/main.ts` | C3 | `npm run lint`, grep | [x] |
| K2 | launcher.log 1MB 넘으면 .1로 교체 | `src/app/logRotate.ts`(+test), `src/app/entry.ts` | C2 | `npx vitest run src/app/logRotate.test.ts` | [x] |
| K3 | 준비 전 실패 때 대기 타이머 정리 | `src/launcher/app.ts`, `tests/e2e/*` | C4 | `npm test` | [x] |
| K4 | 끄는 중 다시 열기 + 잘못된 설정 테스트 보강 | `src/app/entry.ts`, `src/launcher/cli.ts`, `tests/dist/packaged.spec.ts` | C1, C5 | `npm run test:dist` | [x] |

## 20261115-start-fixes (정본 `docs/spec-start-fixes.md`)
| # | 작업 | 바꿀 파일 | 인수 사례 | 확인 명령 | 완료 |
|---|---|---|---|---|---|
| F1 | 시작 판단을 Electron 없는 모듈로 떼어 냄(구조 커밋, 동작 그대로) | `src/app/startDecision.ts`(+test), `src/app/entry.ts` | (기반) | `npx vitest run src/app/startDecision.test.ts`, `npm run lint` | [x] |
| F2 | 기록 교체 실패해도 시작 | `src/app/logRotate.ts`(+test) | D4 | `npx vitest run src/app/logRotate.test.ts` | [x] |
| F3 | 꺼지는 순간 다시 열기(자물쇠 사라짐·ESRCH) | `src/app/startDecision.ts`(+test), `src/app/entry.ts` | D1 | `npx vitest run src/app/startDecision.test.ts` | [x] |
| F4 | 신호 받음 표시로 고정 대기 없앰 | `src/app/launcherLock.ts`, `src/launcher/cli.ts`, `src/app/startDecision.ts`(+test), `tests/dist/packaged.spec.ts` | D2 | 단위 + `npm run test:dist` | [x] |
| F5 | 15초 실패 알림(오류 창 + 기록 + 종료 코드 1) | `src/app/startDecision.ts`(+test), `src/app/entry.ts` | D3 | `npx vitest run src/app/startDecision.test.ts` | [x] |

## 20261115-claude-attach (정본 `docs/spec-claude-attach.md`)
| # | 작업 | 바꿀 파일 | 인수 사례 | 확인 명령 | 완료 |
|---|---|---|---|---|---|
| G1 | 세션 닫기 API(`DELETE /sessions/<id>`)와 붙잡기(`POST /sessions?hold=1`: 연결이 끊기면 세션을 닫음) | `src/launcher/control/server.ts`(+test), `src/launcher/app.ts` | A4, A3(다) | `npx vitest run src/launcher/control`, `npm test` | [x] |
| G2 | 붙이기 명령: 앱 찾기·켜기(15초), 붙잡은 세션, 함께 넣은 chrome-devtools-mcp 띄우기, 끝날 때 닫기 | `src/attach/attach.ts`(+test), `src/attach/cli.ts` | A1, A3, A5, A7 | `npx vitest run src/attach` | [x] |
| G3 | 앱에 묶기(chrome-devtools-mcp를 dependencies로, `Contents/Resources/agent-browser-mcp`) + 묶은 앱 E2E | `package.json`, `resources/agent-browser-mcp`, `tests/dist/packaged.spec.ts` | A1, A2, A3, A5, A6 | `npm run test:dist` | [x] |
| G4 | 사용 안내 | `README.md` | A8 | 원문 확인 | [x] |

## 20261115-company-setup (정본 `docs/spec-company-setup.md`)
| # | 작업 | 바꿀 파일 | 인수 사례 | 확인 명령 | 완료 |
|---|---|---|---|---|---|
| H1 | 붙이기 명령이 initialize 응답에 agent-browser 사용 안내를 덧붙임 | `src/attach/attach.ts`(+test), `src/attach/cli.ts`, `tests/e2e/attach.spec.ts`, `tests/e2e/mcpClient.ts` | B5 | `npx vitest run src/attach`, `npm test` | [x] |
| H2 | 설치 스크립트(빌드·dmg 경로, 사전 확인) | `scripts/install-mac.sh`, `scripts/install-mac.test.ts` | B2, B3, B4 | `npx vitest run scripts` | [x] |
| H3 | Claude용 설치 문서·CLAUDE.md 한 줄·README·Release 절차 | `docs/setup.md`, `CLAUDE.md`, `README.md` | B1, B6, B7 | 원문 확인 | [ ] |
| H4 | 올리면 안 될 것 | `.gitignore` | B8 | `git check-ignore`, `git grep` | [ ] |
