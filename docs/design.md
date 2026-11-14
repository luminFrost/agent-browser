# Design: agent-browser CDP 중계
spec: docs/spec.md · 코드로 알 수 없는 결정만 적는다 · 관련 ADR: 0001(프록시), 0002(런처·파이프), 0003(비밀 경로·관문)

## 구조 결정
- **브라우저 수준 명령은 넘기지 않고 흉내 낸다.** 원본 파이프 하나를 모든 세션과 연결이 함께 쓴다. 그래서 브라우저 수준 상태(`Target.setAutoAttach`, `setDiscoverTargets`, `Browser.setDownloadBehavior`)를 넘기면 다른 세션과 사람 창에까지 영향을 준다. 예를 들어 Playwright의 `setAutoAttach {waitForDebuggerOnStart: true}`를 넘기면 사람 창의 새 탭이 디버거를 기다리며 멈춘다. 런처는 브라우저 수준에서 `setDiscoverTargets`만 한 번 켠다. 나머지는 연결(WebSocket)마다 상태를 들고 흉내 낸다.
  - 버린 대안: 세션마다 브라우저 프로세스를 따로 띄우기. 로그인 공유(R2)가 깨진다.
- **소유권은 브라우저 main이 정한다.** 에이전트 창에 탭이 생기면(세션 생성, `createTarget` 흉내, 팝업) 브라우저 main이 그 탭의 targetId를 알아내 런처에 `tabAdded {sessionId, targetId}`로 알린다. targetId는 `webContents.debugger`로 `Target.getTargetInfo`를 불러 얻는다. 탭이 닫히면 `tabRemoved`를 보낸다. 런처의 세션 범위(scope)는 이 알림으로만 커진다. 전역 `targetCreated` 이벤트로는 소유권을 정하지 않는다.
- **page와 짝 tab 대상을 함께 범위에 넣는다.** Chrome(Electron 포함)에는 page마다 `tab` 종류의 대상이 따로 있다. 최신 puppeteer(chrome-devtools-mcp)는 page를 빼고 tab에 붙은 뒤, tab 세션 안의 autoAttach로 page를 받는다(T7에서 확인). 그래서 런처는 소유권 알림(page)을 받으면 짝 tab을 찾아 함께 넣는다. 짝은 tab 대상에 잠깐 붙어 `setAutoAttach`로 자식 page를 확인해 찾고, tab마다 한 번만 확인해 기억한다. `Target.getTargets`는 CDP 기본 filter(browser·tab 제외)를 따르므로 Playwright에는 tab이 보이지 않는다.
- **허용 목록 방식(ADR-0004, 0005).** 브라우저 수준(sessionId 없음) 명령은 아래 표에 있는 것만 처리하고 나머지는 오류로 돌려준다. 페이지 세션 명령은 **메서드 단위** 허용 목록이다. 목록은 확장 호환 테스트(`tests/e2e/compatExtended.spec.ts`)에서 chrome-devtools-mcp·Playwright가 실제로 보낸 명령과, 같은 탭 범위의 흔한 기능에 필요한 명령으로 짠다. 도메인을 통째로 열지 않는다. 3회차에 Tracing을 통째로 열었다가 다른 탭 URL이 샜기 때문이다. 표는 `src/launcher/cdp/policy.ts`에 있다. 도구가 새 명령을 쓰다 막히면 `--log-blocked`(`onBlocked`)로 찾아 이유와 함께 더한다.

## 인터페이스
| 브라우저 수준 명령 | 처리 |
|---|---|
| `Browser.getVersion`, `Target.getBrowserContexts` | 넘긴다 |
| `Target.getTargetInfo` (targetId 없음 / 자기 탭) | 넘긴다. 남의 탭이면 오류 |
| `Target.getTargets` | 자기 탭만 돌려준다 |
| `Target.setDiscoverTargets` | 연결 상태로 기록. 자기 탭의 `targetCreated`·`targetInfoChanged`·`targetDestroyed`만 보낸다 |
| `Target.setAutoAttach` | 연결 상태로 기록. 자기 page 탭에 대신 붙고 `attachedToTarget`을 보낸다(`waitingForDebugger: false`). `filter`가 page를 빼면 붙지 않는다 |
| `Target.attachToTarget` (flatten) | 자기 탭만 넘긴다. flatten이 아니면 오류 |
| `Target.detachFromTarget`, `Target.getDevToolsTarget`, `Target.activateTarget` | 자기 세션·탭만 |
| `Target.createTarget` | 앱이 세션 창에 about:blank 탭을 만들고, 붙인 뒤 url로 이동한다 |
| `Target.closeTarget` | 자기 탭만. 앱이 탭을 닫는다 |
| `Browser.setDownloadBehavior` | 넘기지 않고 `{}`. 다운로드는 관문(R13)이 다룬다 |
| 그 밖의 모든 것 (`Browser.close`, `Target.attachToBrowserTarget`, `Target.createBrowserContext` …) | 오류 |

- 응답 id: 연결마다 클라이언트 id를 전역 id(양수)로 바꿔 넘기고, 응답이 오면 되돌린다. 런처 자신의 요청은 음수 id를 쓴다.
- 이벤트 경로: sessionId가 있는 메시지는 그 sessionId의 주인 연결에만 보낸다. 브라우저 수준 `attachedToTarget`은 `params.sessionId`로 경로를 정한다. 아직 주인이 없으면 같은 targetId를 붙이고 있는 연결(먼저 온 순서)에 준다. 자식 세션(iframe·worker)의 `attachedToTarget`은 부모 세션 주인에게 주고, 자식 sessionId도 그 연결 것으로 등록한다.
- 엔드포인트: `http://127.0.0.1:<세션 포트>/<세션 비밀>/` 아래에 `json/version`, `json/list`(`json`), `devtools/browser/<id>`, `devtools/page/<targetId>`. Host 헤더가 127.0.0.1·localhost가 아니면 거부한다(DNS rebinding).

- 페이지 세션에서 따로 검사하는 것: `Page/Browser.setDownloadBehavior`는 막는다(R13 우회). method·postData·url을 바꾸는 `Fetch.continueRequest`는 막는다(R12 우회, 승인한 곳과 다른 곳). `Network.continueInterceptedRequest`는 목록에 없다. Set-Cookie가 든 `Fetch.fulfillRequest`·`continueResponse`도 막는다(R7: 응답으로 공유 쿠키 바꾸기). 쿠키 쓰기·지우기는 허용 목록에 없다. 알려진 한계: 에이전트가 자기 탭으로 어떤 사이트 안에서 한 행동(페이지 JS, 로그아웃 버튼)은 그 사이트의 공유 로그인을 바꿀 수 있다(ADR-0004).
- 도구가 보내지만 막히는 것: chrome-devtools-mcp(puppeteer)의 `Autofill.enable`·`setAddresses`, `WebMCP.enable`(도구가 오류를 무시하고 계속 동작한다), `resize_page`의 `Browser.getWindowForTarget`·`setWindowBounds`(OS 창 크기를 바꾸면 사람 창에도 닿을 수 있다).
- 폼 관문은 에이전트 탭의 POST 중 resourceType이 xhr(fetch 포함)·ping(sendBeacon)이 아닌 것을 모두 묻는다(ADR-0005).
- 에이전트 탭 이동 주소(ADR-0006): `http:`·`https:`·`about:blank`·`data:`·`blob:`만 허용한다. 정책(`Page.navigate`·`createTarget`의 url)과 브라우저(`will-navigate`·`will-redirect`·`will-frame-navigate`·팝업) 두 겹으로 막는다. `chrome://` 내부 페이지로 사람 탭 정보를 읽은 것(검증 4회차) 때문이다.
- 폼 관문은 브라우저가 스스로 보내는 CSP 위반 보고(cspReport)를 묻지 않는다(ADR-0006).
- createTarget(url): about:blank로 만들어 범위에 반영하고 자동 붙기를 마친 뒤 이동한다. 그래야 클라이언트가 첫 요청을 놓치지 않는다.

## 오류 처리
- 막힌 명령: CDP 오류 `{code: -32000, message: "agent-browser: <이유>"}`로 응답한다. 연결은 끊지 않는다.
- 잘못된 JSON이나 숫자가 아닌 id: 연결을 끊는다(1008).
- 연결이 끊기면 그 연결이 가진 세션을 모두 detach한다.
