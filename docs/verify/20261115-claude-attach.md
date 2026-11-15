# 검증: 20261115-claude-attach (정본 `docs/spec-claude-attach.md`)
판정 커밋 3a186aa · 검증자: reviewer(새로 띄움, 수행 과정 모름) · 강도 보통 · 1회차 PASS

| 기준 | 판정 | 증거 (3a186aa에서 검증자가 새로 만듦) |
|---|---|---|
| A1 붙이기 명령 | PASS | `tests/e2e/attach.spec.ts:35`(tools/list → 에이전트 창 1개 → navigate → snapshot `heading "A"`), 묶은 앱 `tests/dist/packaged.spec.ts:329` 통과. 실제 Claude Code: `claude -p --strict-mcp-config --mcp-config <붙이기 명령만>`이 로컬 페이지 제목 `PROBE-TITLE-7319`를 읽어 옴(종료 0, 앱 꺼짐에서 자동으로 켜짐, 끝난 뒤 남은 프로세스 없음) |
| A2 세션마다 따로 | PASS | `attach.spec.ts:46`(서로의 탭·`/renderer/`가 안 보임), 묶은 앱에서 3개 동시 실행 때 각자 자기 탭만 보임 |
| A3 끝나면 창 닫기 | PASS | `attach.spec.ts:64` (가) stdin 닫힘 (나) SIGTERM (다) SIGKILL 통과. `termination.spec.ts:77` 연결이 끊기면 창이 닫히고 browserUrl 응답 없음, B는 그대로. 묶은 앱에서 SIGKILL → SIGTERM → stdin 순서로 5초 안에 창이 하나씩 줄어듦 |
| A4 세션 닫기 API | PASS | `src/launcher/control/server.test.ts` 204, 404, 401(없음·틀림). E2E `termination.spec.ts:63` 204 뒤 끝남, B는 그대로, 다시 보내면 404 |
| A5 꺼져 있으면 켜기 | PASS | 묶은 앱: 꺼진 상태에서 붙이기 명령 3개를 동시에 띄우면 20초 안에 initialize까지 되고 런처는 1개. 15초 초과는 단위 테스트 `attach.test.ts`(오류에 "15초")와 `cli.ts` exit(1), 개발 실행 `attach.spec.ts:75` |
| A6 Node 없이 | PASS | 묶은 앱 테스트를 `PATH=/usr/bin:/bin:/usr/sbin:/sbin`(node·npx 없음을 확인함)로 돌려 통과. 앱 안 `Resources/app/node_modules`에 chrome-devtools-mcp와 ws가 있음 |
| A7 외부 전송 끔 | PASS | `src/attach/attach.ts:56` `mcpArgs`에 `--no-usage-statistics`, `--no-performance-crux`가 있고 `cli.ts:87`이 이것으로 띄움. 단위 테스트 통과 |
| A8 사용 안내 | PASS | `README.md` 설치(우클릭 → 열기), `claude mcp add` 한 줄, 세션마다 창·끝나면 닫힘, 알려진 한계(서명 없음, 승인 창, 막힌 도구가 spec·ADR-0005와 같음) |
| 공통 | PASS | lint 0, build 0, `npm test` Vitest 189 + Playwright 74 passed, `npm run test:dist` 16 passed, 남은 앱·MCP 프로세스 0 |

보안 확인: 붙이기 명령과 그 자식은 듣는 포트가 없다. 토큰은 실행 인자·launcher.log·stderr에 나오지 않는다. hold·DELETE도 토큰이 없거나 틀리면 401이다.
깨뜨려 보기: 8곳을 바꿨고(연결이 끊겨도 닫지 않음, closeSession, startApp, 대기 시간, mcpArgs 플래그, extraResources, 의존성 위치) 모두 테스트가 실패했다.

Critical·Major: 없음.

## 후속 (게이트 아님, 고칠지는 사람이 정함)
| 등급 | 내용 | 위치 |
|---|---|---|
| Minor | 사람이 에이전트 창을 닫거나 멈추기를 눌러 세션이 끝나도 붙잡은 연결이 열려 있다. 그래서 붙이기 명령과 chrome-devtools-mcp가 Claude 세션이 끝날 때까지 남고, 도구를 부르면 오류가 난다. `cli.ts`의 주석은 "창을 닫음"에도 풀린다고 하지만 그런 길은 없다. README의 "`/mcp`로 다시 연결" 안내는 실제 동작과 맞다 | `src/launcher/control/server.ts` hold ↔ `src/launcher/app.ts` stopSession, `src/attach/cli.ts:98` |
| Low | 첫 줄 JSON이 깨지면 정리된 한 줄 대신 스택이 찍히며 끝난다 | `src/attach/cli.ts:53` |
| Low | openSession에 요청마다 시간 제한이 없다. 포트는 열렸는데 응답이 없으면 15초를 넘길 수 있다 | `src/attach/cli.ts` |
| Low | A3 (가)·(나) 테스트는 창 수만 본다(browserUrl 무응답은 termination.spec이 확인). 묶은 앱의 "15초 안에 못 켬"은 단위 테스트로만 확인했다 | `tests/e2e/attach.spec.ts:64`, `src/attach/attach.test.ts` |
| Low | `cli.ts`가 `mcpArgs`를 쓰는지는 테스트가 아니라 코드로만 확인했다 | `src/attach/cli.ts:87` |
