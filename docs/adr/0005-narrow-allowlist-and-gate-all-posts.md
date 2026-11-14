# ADR-0005: 페이지 세션 허용 목록을 도구가 실제로 쓰는 명령으로 좁히고, 관문은 xhr·fetch가 아닌 모든 POST를 묻는다
상태: 승인 · 날짜: 2026-11-14 · 작업: 20261114-agent-browser · ADR-0004를 보완

## 맥락
- 검증 3회차가 FAIL이었다(docs/verify/20261114-agent-browser.md).
- R5: ADR-0004에서 "그 탭 안에서만 일하는 도메인"으로 통째로 연 Tracing이 다른 세션과 사람 창의 탭 URL을 흘렸다. 도메인 단위 분류가 틀릴 수 있다는 뜻이다.
- R12: 관문이 resourceType `mainFrame`·`subFrame`만 봐서, `<object>`·`<embed>` 안으로 보내는 POST가 건너뛰었다.
- 회차마다 한 겹 더 깊은 우회가 나왔다.

## 결정 (사람 결정 2026-11-14, 검증 3회차 뒤 질문 창: "좁혀서 4회차")
1. **페이지 세션 허용 목록을 메서드 단위로 좁힌다.** 대상은 chrome-devtools-mcp와 Playwright가 실제로 보내는 명령이다. 확장 호환 테스트에서 모으고, 그 테스트가 목록을 지킨다. 도메인을 통째로 여는 것은 없앤다. Tracing·Memory 등 프로세스 전체에 닿는 도메인은 막는다.
2. **폼 제출 관문은 에이전트 탭의 POST 중 xhr(fetch 포함)와 ping(sendBeacon)이 아닌 것을 모두 묻는다.** mainFrame·subFrame·object·other 등이 해당한다. xhr·fetch·sendBeacon은 spec의 알려진 한계로 둔다.
3. **요청 바꾸기를 더 막는다.** `Fetch.continueRequest`에서 url을 바꾸는 것도 막는다(승인한 호스트와 다른 곳으로 가지 않게). `Network.continueInterceptedRequest`·`setRequestInterception`은 목록에서 뺀다.
4. **막힌 명령을 알 수 있게 한다.** `startApp`의 `onBlocked`와 CLI `--log-blocked`로 남긴다. 도구가 새 명령을 쓰다 막히면 이것으로 원인을 찾고, 이유와 함께 목록에 더한다.
5. code-review 3회차 Major 5건도 함께 고친다.

## 결과
- 쉬워지는 것: 검증되지 않은 명령은 기본으로 닫혀 있다.
- 어려워지는 것: 도구의 덜 쓰는 기능(성능 트레이스 등)이 막힐 수 있다. 막힌 기능은 spec의 알려진 한계로 적는다.
