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
| T7 | 기존 도구 호환 E2E: chrome-devtools-mcp navigate·snapshot, Playwright `connectOverCDP` 열기·클릭 | `tests/e2e/compat.spec.ts` | R4 | `npm test` | [ ] |
| T8 | 로그인 공유: 로컬 테스트 서버 로그인 → 세션 탭에서 로그인 상태, 재시작 후 유지 | `tests/fixtures/server.ts`, `tests/e2e/login.spec.ts` | R2 | `npm test` | [ ] |
| T9 | 동시 세션: A·B 동시 navigate | `tests/e2e/concurrency.spec.ts` | R8 | `npm test` | [ ] |
| T10 | 종료: 멈추기·창 닫기 → 연결 끊김, browserUrl 응답 없음, B는 유지 | `src/launcher/sessions.ts`, `src/browser/sessionWindows.ts` | R9 | `npm test` | [ ] |
| T11 | 지켜보기: 사람 창의 세션 목록·탭 URL·멈추기 버튼, 빈 상태 문구, 상태별 스크린샷 | `src/browser/renderer/human/sessions*` | R11 | `npm test` + 스크린샷 | [ ] |
| T12 | 폼 제출 관문: 에이전트 창의 최상위 POST를 붙잡고 사람 창에 허용/거부, 거부 시 차단 오류 페이지, GET은 묻지 않음 | `src/browser/gate/**` | R12 | `npm test` | [ ] |
| T13 | 다운로드 관문: 에이전트 창의 다운로드 허용/거부, 사람 창 다운로드는 묻지 않음 | `src/browser/gate/**` | R13 | `npm test` | [ ] |

T0 결과에 따라 T4·T12·T13의 방식이 바뀔 수 있다. 완료 기준을 지킬 수 없다고 나오면 진행하지 않고 spec 수정·ADR·재승인을 거친다.
