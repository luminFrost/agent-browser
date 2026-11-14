# 검증 보고: agent-browser (20261114-agent-browser) — 1회차
날짜: 2026-11-14 · 판정 커밋: 04f14c8 · 규모 L · 강도 엄격
검증자: reviewer 에이전트(spec 대조), /code-review(high, diff c510912..04f14c8), 확인 명령, 일부러 깨뜨려 보기(검증용 worktree), 상태별 스크린샷

## 결론: FAIL
- R7이 FAIL이다. R12·R13은 인수 사례는 통과하지만, 에이전트가 CDP 명령 하나로 관문을 우회할 수 있다(Critical·Major).
- 나머지 R1~R6, R8~R11은 PASS다.

| 완료 기준 (spec R#) | 판정 | 증거 (04f14c8에서 새로 만듦) |
|---|---|---|
| R1 창 분리 | PASS | `humanWindow.spec.ts:17`, `control.spec.ts:24` (npm test 통과) |
| R2 로그인 공유 | PASS | `login.spec.ts:24` (재시작 뒤 logged-in) |
| R3 세션 생성 | PASS | `control.spec.ts:17`(0600), `endpoint.spec.ts:12,20,37,50` |
| R4 기존 도구 호환 | PASS | `compat.spec.ts:16`(chrome-devtools-mcp navigate·snapshot), `:32`(Playwright click) |
| R5 탭 격리 | PASS | `isolation.spec.ts:18,33`. 깨뜨려 보기 M2(getTargets 전체 노출)는 테스트가 잡음 |
| R6 격리 우회 차단 | PASS | `isolation.spec.ts:56,74,86,102`. reviewer 실험: autoAttachRelated도 거부됨. M1(attach 소유 검사 제거)·M8(autoAttach 그대로 넘김)은 테스트가 잡음 |
| R7 공유 상태 보호 | **FAIL** | reviewer 실험: 페이지 세션의 `Network.setCookie {sid, expires:1}` 뒤 사람 창 `/me`가 logged-in에서 anonymous로 바뀜. code-review #2: `IndexedDB.deleteDatabase`·`DOMStorage.clear`·`CacheStorage.deleteCache`가 넘어감. `Page.setDownloadBehavior`가 사람 창 다운로드 경로까지 바꿈 |
| R8 동시 세션 | PASS | `concurrency.spec.ts:13,32` |
| R9 종료 | PASS | `termination.spec.ts:29,40`. M9(엔드포인트 안 닫음)는 테스트가 잡음 |
| R10 잘못된 접속 | PASS | `control.spec.ts:36,43`, `endpoint.spec.ts:60,72`. reviewer 실험: 세션 포트에 외부 IP·::1로 접속하면 ECONNREFUSED. M4·M5는 테스트가 잡음 |
| R11 지켜보기 | PASS | `watch.spec.ts:29,36`. 스크린샷 `test-results/watch-*/R11-*.png` 3장(04f14c8의 npm test에서 생성) |
| R12 폼 제출 관문 | **FAIL** (우회) | 인수 사례 `formGate.spec.ts:25,42,54,66`는 통과. reviewer 실험: `Fetch.continueRequest {method:'POST'}`로 최상위 GET 이동을 POST로 바꾸면 서버가 받고 승인 요청은 0건. spec이 적은 한계(fetch·XHR)에 들지 않는 우회 |
| R13 다운로드 관문 | **FAIL** (우회) | 인수 사례 `downloadGate.spec.ts`는 통과. 재현: 페이지 세션의 `Page.setDownloadBehavior {allow, downloadPath}` 뒤 다운로드하면 승인 대기 중인데도 파일이 이미 지정 폴더에 저장됨(검증용 worktree에서 EVIL=["data.bin"]). 깨뜨려 보기 M7(거부해도 옮김)을 테스트가 못 잡음: 다 받은 뒤 거부하는 경우의 테스트가 없음 |
| 제약: 브라우저 전체 CDP 명령 차단 | **FAIL** | 위 R7과 같음 |
| 제약: 그 밖(TS·Electron, 도구, 화면 상태, 권한, 하드코딩, 라이선스, 127.0.0.1) | PASS | reviewer 판정표. Electron 45.3.2가 "최신 안정판"인지는 오프라인이라 대조하지 못함(확인 못 함, 사람 확인) |

## 확인 명령 (04f14c8)
- `npm run lint`: 종료 0
- `npm test`: Vitest 6파일 73개 통과, Playwright 47개 통과
- `npm run build`: 종료 0

## 테스트 품질 (일부러 깨뜨려 보기, 돌연변이 도구 없음)
| # | 깨뜨린 것 | 결과 |
|---|---|---|
| M1 | attach 소유 검사 제거 | 잡힘 |
| M2 | getTargets를 모든 대상으로 | 잡힘 |
| M3 | 공유 상태 차단 제거 | 잡힘 |
| M4 | 비밀 경로 검사 제거 | 잡힘 |
| M5 | 토큰 검사 항상 통과 | 잡힘 |
| M6 | 폼 관문 끄기 | 잡힘 |
| M7 | 거부해도 다운로드 폴더로 옮김 | **못 잡음** → 다 받은 뒤 거부하는 경우를 테스트로 더하면 잡힘(worktree에서 확인) |
| M8 | setAutoAttach를 브라우저에 그대로 넘김 | 잡힘 |
| M9 | 세션 종료 때 엔드포인트 안 닫음 | 잡힘 |

## code-review 지적 (이번 변경 안)
| # | 심각도 | 내용 | 처리 |
|---|---|---|---|
| 1 | Major | `cdpPipe.ts:49` 청크마다 UTF-8로 풀어 경계에서 한글 등이 깨짐 | 이번에 고침 |
| 2 | Major | R7 차단 목록에 IndexedDB·DOMStorage·CacheStorage 지우기와 쿠키 설정(만료로 지우기) 없음 | 이번에 고침 |
| 3 | Critical | `Page.setDownloadBehavior`로 R13 우회(재현함) | 이번에 고침 |
| 4 | Major | 팝업의 `window.close()` 뒤 죽은 탭이 남아 state()가 던지고 tabRemoved가 안 감 | 이번에 고침 |
| 5 | Major | 연결이 끊긴 뒤 온 attach 응답이 닫힌 연결을 주인으로 정해 세션이 샘 | 이번에 고침 |
| 6 | Major | createSession 실패·생성 중 창 닫힘에 범위·엔드포인트가 샘 | 이번에 고침 |
| 7 | Major | ipc 채널이 닫힌 뒤 child.send → 'error' 리스너 없어 런처가 죽을 수 있음 | 이번에 고침 |
| 8 | Major | attach 응답이 먼저 오면 다른 targetId의 대기 항목을 지움(reviewer #4와 같음) | 이번에 고침 |
| 9 | Minor | 끊긴 다운로드의 승인 요청이 남음 | 후속 |
| 10 | Minor | 창 크기 숫자 상수 | 후속 |
| R-3 | Major | `Fetch.continueRequest`의 method·postData 바꾸기로 R12 우회(reviewer) | 이번에 고침 |

## 사람 확인 항목
- Electron 45.3.2가 지금의 최신 안정판인가(오프라인이라 대조 못 함).
- 실제 화면(창을 띄운 상태)의 모양: 상태별 스크린샷 `docs/verify/screenshots/20261114-agent-browser/` 3장(승인 요청 카드, 에이전트 창 머리줄, 차단 오류 페이지)과 R11 3장. 실제 Mac 화면에서 한 번 켜 보는 것은 사람이 한다.

## 후속 (FAIL 아님, 고칠지는 사람이 정한다)
- code-review #9, #10
- reviewer #5: 세션 엔드포인트 포트의 외부 IP 접속 E2E가 없음(코드와 직접 실험으로는 맞음)
- reviewer #6: Connection·Router 단위 테스트가 없음(E2E로 다룸)

---

# 검증 보고 — 2회차
날짜: 2026-11-14 · 판정 커밋: 80747da · 검증자: 새 reviewer, 새 /code-review(high, c510912..80747da), 확인 명령, 일부러 깨뜨려 보기(새 worktree)

## 결론: FAIL. R7·R13이 두 회차 연속 FAIL이라 자동 수정을 멈추고 사람의 결정을 받는다

| 완료 기준 | 판정 | 증거 (80747da) |
|---|---|---|
| R1~R6, R8~R11 | PASS | reviewer 판정표. npm test: 단위 87, E2E 51 통과. R6: target=_blank·noopener POST 팝업도 A의 창에 생김(reviewer P4·P5) |
| R7 공유 상태 보호 | **FAIL (2회 연속)** | reviewer P2: 에이전트가 자기 탭에서 `Fetch.fulfillRequest`로 `Set-Cookie: sid=; Max-Age=0`를 주입하면 사람 창 `/me`가 anonymous로 바뀜. P3: `ServiceWorker.unregister`로 다른 출처에 있는 사람의 서비스 워커 등록을 지움(1→0). code-review: 페이지 JS(`document.cookie`, `localStorage.clear()`)로도 그 출처의 공유 상태를 지울 수 있음 |
| R12 폼 제출 관문 | PASS (reviewer) / code-review 지적 | 인수 사례와 Fetch 우회 막기 테스트 통과. code-review: iframe으로 보내는 POST(subFrame)는 묻지 않음. spec 문구는 "최상위 폼 제출" |
| R13 다운로드 관문 | **FAIL (2회 연속)** | reviewer P1·P1b: 응답이 오기 전에 탭을 닫거나 팝업이 스스로 닫히면, 출처를 알 수 없는 다운로드를 사람 창 것으로 보고 승인 없이 저장함(`downloadGate.ts:36-40`) |
| 제약: 브라우저 전체 CDP 명령 차단 | FAIL | R7과 같은 원인 |

## 확인 명령 (80747da)
- lint 종료 0, test 통과(단위 87, E2E 51), build 종료 0.

## 테스트 품질 (80747da, 새 worktree)
- M1~M13 모두 테스트가 잡음(M3은 문구가 바뀌어 건너뛰고 M12로 대신함). 1회차의 M7 공백은 메워짐.
- 남은 공백: R7 테스트는 정해 둔 명령만 검사하고, R13 테스트는 탭이 살아 있는 경우만 다룬다(reviewer #4).

## 왜 안 고쳐지는가
- **R7은 기준·설계 문제다.** 사람 창과 로그인을 공유하는 이상, 에이전트가 어떤 사이트 안에서 하는 행동(페이지 JS, 응답 조작, 로그아웃 버튼 누르기)은 그 사이트의 공유 로그인을 바꿀 수 있다. 페이지 세션을 차단 목록으로 거르면 새 경로가 계속 나온다(1회차 setCookie → 2회차 Fetch 응답·ServiceWorker). R7을 어디까지로 볼지 사람이 정해야 한다.
- **R13은 설계 결함이다.** 출처를 모르는 다운로드를 사람 것으로 기본 처리한다. 고칠 방향은 분명하다(사람 창 탭인지 확인되지 않으면 막거나 묻는다). 다만 같은 항목이 두 번 연속 FAIL이어서 규칙대로 멈춘다.

## code-review 2회차의 그 밖 지적 (사람 결정 뒤 3회차에서 처리 제안)
| 심각도 | 내용 |
|---|---|
| Major | iframe(subFrame)으로 보내는 POST가 폼 관문을 지나감(spec은 "최상위"만 명시) |
| Major | release() 뒤 attach 이벤트가 같은 탭을 기다리던 다른 연결로 넘어감(`router.ts:153`) |
| Major | addTarget(비동기)과 removeTarget(동기)의 경쟁: 바로 닫힌 탭이 범위에 영영 남음(`router.ts:61`) |
| Major | 세션 생성 중 멈추기(stopRequested)가 무시됨(`app.ts:101`) |
| Major | 다운로드 폴더가 없으면 허용한 파일이 격리 폴더에 남고 처리되지 않은 거부(unhandled rejection)가 남(`downloadGate.ts:48`) |
| Minor | 같은 이름의 사람 다운로드 둘이 동시에 오면 덮어씀. X-HTTP-Method-Override 헤더. 127.0.0.1 문자열이 두 곳에 있음. 창 크기 숫자 상수. Network.getAllCookies로 모든 쿠키를 읽을 수 있음(읽기만 함) |
