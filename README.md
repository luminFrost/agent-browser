# Agent Browser

여러 Claude Code 세션이 브라우저를 나눠 쓰게 하는 macOS 앱이다. 창은 사람이 쓰는 창 하나뿐이다. Claude Code 세션마다 그 세션 전용 탭 묶음이 사람 창 안에 생기고, 사람 탭과 로그인(쿠키)을 함께 쓴다. 오른쪽 패널에서 세션을 고르면 왼쪽 화면에 그 세션의 탭이 보이고(읽기 전용), "내 탭으로"로 돌아온다. 에이전트는 자기 세션의 탭만 보고 다룰 수 있다. 사람의 탭이나 다른 세션의 탭은 보이지 않는다. 에이전트 탭에서 일어나는 폼 제출(POST)과 다운로드는 사람이 허용해야 진행된다.

- 대상: Apple Silicon Mac
- 정본 문서: `docs/spec.md`(앱 동작), `docs/spec-mac-app.md`(묶은 앱), `docs/spec-claude-attach.md`(Claude Code 붙이기), `docs/spec-company-setup.md`(다른 PC 설치)
- 설치 절차(Claude가 따라 함): `docs/setup.md`

## 다른 PC(회사 PC)에 설치 — 이것부터

1. 이 저장소를 GitHub에서 받는다.
   ```sh
   git clone <이 저장소 주소> agent-browser && cd agent-browser
   ```
2. 그 폴더에서 Claude Code를 열고 이렇게 말한다.
   > docs/setup.md대로 agent-browser를 설치해 줘
   - Claude가 사전 확인 → 빌드(안 되면 Release dmg) → 앱 설치 → `claude mcp add` → 확인까지 한다. 절차는 `docs/setup.md`, 스크립트는 `scripts/install-mac.sh`에 있다.
   - Claude 없이 직접 하려면 `scripts/install-mac.sh`를 실행한다. Node 22 이상이 없으면 Release dmg로 `scripts/install-mac.sh --from-dmg <파일>`을 실행한다.
3. Claude가 끝났다고 하면 사람이 할 일은 두 가지다.
   - 앱을 한 번 연다. 막히면 Finder에서 **우클릭 → 열기**를 하거나, 시스템 설정 → 개인정보 보호 및 보안 → **그래도 열기**를 누른다. 서명하지 않은 앱이라 그렇다. 회사 관리 정책이 서명 없는 앱을 막으면 IT 담당과 상의한다.
   - 사람 창에서 회사 계정에 로그인해 둔다. 에이전트 탭도 이 로그인을 함께 쓴다.

등록은 사용자 범위(`--scope user`)라 모든 프로젝트에서 쓸 수 있다. Node·인터넷 내려받기 없이 도는 도구(chrome-devtools-mcp)가 앱 안에 들어 있다. 지우는 방법은 `docs/setup.md` "지우기"에 있다.

## 쓰는 법

- Claude Code 세션을 열고 "agent-browser로 ○○ 페이지 열어 줘"처럼 시키면 된다. Claude는 붙을 때 쓸 때 알 것(자기 세션의 탭만 보임, 사람 승인, 막힌 도구)을 MCP 안내로 받는다.
- Claude Code 세션이 시작되면(MCP 서버가 뜰 때) 오른쪽 패널에 그 세션이 하나 생긴다. 새 창은 뜨지 않는다. 패널에서 "보기"를 누르면 왼쪽에 그 세션의 탭이 보인다. 보는 동안 주소창·이동 버튼은 잠긴다(읽기 전용).
- 앱이 꺼져 있으면 붙이기 명령이 앱을 켠다. 15초 안에 못 켜면 Claude Code에 MCP 연결 실패로 보인다.
- Claude Code 세션이 끝나면 그 세션은 5초 안에 패널에서 사라진다. 강제 종료돼도 같다. 그 세션을 보던 중이면 내 탭으로 돌아온다.
- 사람이 패널에서 그 세션의 멈추기 버튼을 누르면 그 세션은 더 이상 브라우저를 쓰지 못한다. 다시 쓰려면 Claude Code에서 `/mcp`로 다시 연결한다.

## 알려진 한계

- **서명 없음:** 처음 열 때 우클릭 → 열기가 필요하다. 회사 정책에 따라 아예 안 열릴 수 있다.
- **사람 승인 창:** 에이전트 탭에서 폼을 제출하거나 파일을 내려받으면 사람 창에 허용/거부가 뜬다. 사람이 누르기 전까지 에이전트는 기다린다. `fetch`·XHR로 보내는 요청은 묻지 않는다(ADR-0005).
- **막힌 도구:** 브라우저 전체에 닿는 기능은 막혀 있다. 예: `resize_page`(창 크기), 성능 트레이스, lighthouse, 힙 스냅샷, 화면 녹화. 화면 크기는 `emulate`로 바꾼다(ADR-0005).
- **외부 전송 끔:** 앱에 넣은 chrome-devtools-mcp는 Google 사용 통계와 CrUX(방문 URL 조회)를 끈 채 돈다.
- **공유 로그인:** 에이전트는 사람과 같은 계정으로 움직인다. 에이전트의 행동은 실제 계정에서 되돌릴 수 없다. 승인 창은 보조 장치일 뿐 완전한 보장은 아니다.

## 개발

```sh
npm install
npm test            # build → Vitest → Playwright E2E
npm run lint
npm run dist        # release/Agent-Browser-<버전>-arm64.dmg
npm run test:dist   # 묶은 앱 확인(실제 창이 뜬다)
```

직접 붙이려면 프로필 폴더(`~/Library/Application Support/agent-browser`)의 `control.json`에 적힌 포트와 토큰을 쓴다.

- `POST /sessions` → `{id, browserUrl}`
- `POST /sessions?hold=1` → 첫 줄로 같은 정보를 주고, 연결이 끊기면 그 세션을 닫는다
- `DELETE /sessions/<id>` → 세션을 닫는다

모든 요청에 `Authorization: Bearer <token>` 헤더가 필요하다.
