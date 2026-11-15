# Agent Browser

여러 Claude Code 세션이 브라우저를 나눠 쓰게 하는 macOS 앱이다. 사람이 쓰는 창 하나와, Claude Code 세션마다 따로 생기는 에이전트 창이 로그인(쿠키)을 함께 쓴다. 에이전트는 자기 창의 탭만 보고 다룰 수 있다. 사람 창의 탭이나 다른 세션의 탭은 보이지 않는다. 에이전트 창에서 일어나는 폼 제출(POST)과 다운로드는 사람이 허용해야 진행된다.

- 대상: Apple Silicon Mac
- 정본 문서: `docs/spec.md`(앱 동작), `docs/spec-mac-app.md`(묶은 앱), `docs/spec-claude-attach.md`(Claude Code 붙이기)

## 설치

1. `Agent Browser-<버전>-arm64.dmg`를 열고 `Agent Browser`를 `응용 프로그램`으로 끌어 놓는다.
2. 처음 한 번은 Finder에서 앱을 **우클릭 → 열기**로 연다. 서명하지 않은 앱이라 더블클릭하면 macOS가 막는다.
   - 회사 PC 관리 정책이 서명 없는 앱을 막으면 열리지 않는다. 그때는 IT 담당과 상의한다.
3. 사람 창이 뜨면 평소처럼 회사 계정에 로그인해 둔다. 에이전트 창도 이 로그인을 함께 쓴다.

## Claude Code에 붙이기 (처음 한 번)

터미널에서 한 줄만 실행한다.

```sh
claude mcp add --scope user agent-browser -- "/Applications/Agent Browser.app/Contents/Resources/agent-browser-mcp"
```

- `--scope user`는 모든 프로젝트에서 쓰게 한다. 한 프로젝트에서만 쓰려면 빼고 그 폴더에서 실행한다.
- Node·npm·인터넷 내려받기는 필요 없다. 브라우저를 다루는 도구(chrome-devtools-mcp)는 앱 안에 들어 있다.
- 지우려면 `claude mcp remove --scope user agent-browser`를 실행한다.

## 쓰는 법

- Claude Code 세션을 열고 "agent-browser로 ○○ 페이지 열어 줘"처럼 시키면 된다.
- 세션이 처음 브라우저 도구를 부를 때 그 세션 전용 에이전트 창이 하나 생긴다. 세션 3개를 열면 창도 3개다.
- 앱이 꺼져 있으면 붙이기 명령이 앱을 켠다. 15초 안에 못 켜면 Claude Code에 MCP 연결 실패로 보인다.
- Claude Code 세션이 끝나면 그 세션의 에이전트 창은 5초 안에 닫힌다. 강제 종료돼도 닫힌다.
- 사람이 에이전트 창을 닫거나 그 창의 멈추기 버튼을 누르면 그 세션은 더 이상 브라우저를 쓰지 못한다. 다시 쓰려면 Claude Code에서 `/mcp`로 다시 연결한다.

## 알려진 한계

- **서명 없음:** 처음 열 때 우클릭 → 열기가 필요하다. 회사 정책에 따라 아예 안 열릴 수 있다.
- **사람 승인 창:** 에이전트 창에서 폼을 제출하거나 파일을 내려받으면 사람 창에 허용/거부가 뜬다. 사람이 누르기 전까지 에이전트는 기다린다. `fetch`·XHR로 보내는 요청은 묻지 않는다(ADR-0005).
- **막힌 도구:** 브라우저 전체에 닿는 기능은 막혀 있다. 예: `resize_page`(창 크기), 성능 트레이스, lighthouse, 힙 스냅샷, 화면 녹화. 화면 크기는 `emulate`로 바꾼다(ADR-0005).
- **외부 전송 끔:** 앱에 넣은 chrome-devtools-mcp는 Google 사용 통계와 CrUX(방문 URL 조회)를 끈 채 돈다.
- **공유 로그인:** 에이전트는 사람과 같은 계정으로 움직인다. 에이전트의 행동은 실제 계정에서 되돌릴 수 없다. 승인 창은 보조 장치일 뿐 완전한 보장은 아니다.

## 개발

```sh
npm install
npm test            # build → Vitest → Playwright E2E
npm run lint
npm run dist        # release/Agent Browser-<버전>-arm64.dmg
npm run test:dist   # 묶은 앱 확인(실제 창이 뜬다)
```

직접 붙이려면 프로필 폴더(`~/Library/Application Support/agent-browser`)의 `control.json`에 적힌 포트와 토큰을 쓴다.

- `POST /sessions` → `{id, browserUrl}`
- `POST /sessions?hold=1` → 첫 줄로 같은 정보를 주고, 연결이 끊기면 그 세션을 닫는다
- `DELETE /sessions/<id>` → 세션을 닫는다

모든 요청에 `Authorization: Bearer <token>` 헤더가 필요하다.
