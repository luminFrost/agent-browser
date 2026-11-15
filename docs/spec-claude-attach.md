# Spec: Claude Code에서 바로 붙기
상태: 승인 (2026-11-15) · 구분: 남길 것 · 정본: 이 문서 (앱 동작은 `docs/spec.md`, 묶은 앱은 `docs/spec-mac-app.md`) · 규모: M · 검증 강도: 보통 · 작업: 20261115-claude-attach
사람 결정 (2026-11-15): 규모·강도 "M, 보통", chrome-devtools-mcp "앱 안에 넣기", 세션이 끝날 때 "자동으로 닫기", 앱이 꺼져 있을 때 "자동으로 켜기"

## 가치
회사 PC에서 dmg로 설치한 앱에 Claude Code를 붙일 때 `claude mcp add` 한 줄만 쓰면 되게 한다. 지금은 `control.json`을 읽고, `POST /sessions`를 보내고, 받은 `browserUrl`로 chrome-devtools-mcp를 손으로 붙여야 한다. 게다가 `browserUrl`은 세션마다, 앱을 켤 때마다 바뀐다. 이 작업 뒤에는 Claude Code 세션 하나가 자기 에이전트 창 하나를 자동으로 받고, 세션이 끝나면 그 창이 닫힌다. 이것이 프로젝트의 원래 목적(여러 Claude 세션이 브라우저를 나눠 쓰기, `docs/spec.md` 가치)을 실제로 쓰는 길이다.

## 범위
- 한다
  - 앱 안에 붙이기 명령(MCP stdio 서버)을 넣는다. 경로는 `/Applications/Agent Browser.app/Contents/Resources/agent-browser-mcp`이다.
  - chrome-devtools-mcp를 앱에 함께 넣는다. 앱의 Electron이 Node 역할을 하므로 회사 PC에 Node·npx·인터넷 내려받기가 없어도 된다.
  - 세션 닫기 API를 넣는다. 붙이기 명령이 끝나면 그 세션을 닫는다.
  - 앱이 꺼져 있으면 붙이기 명령이 앱을 켠다.
  - 사용 안내 `README.md`를 쓴다.
- 안 한다
  - 서명·공증
  - 기존 앱 동작(R1~R13: 격리, 승인, 막는 CDP 명령) 변경
  - chrome-devtools-mcp 말고 다른 MCP 서버(Playwright MCP 등) 묶기
  - Claude Code 설정 파일을 앱이 직접 고치기 (`claude mcp add`는 사람이 한 번 실행한다)
  - Windows·Intel Mac

## 요구사항과 인수 사례 (= 완료 기준)
| # | 요구사항 | 인수 사례 (입력 → 기대 결과) | 확인 방법 |
|---|---|---|---|
| A1 | 붙이기 명령 | 앱이 켜져 있다. 붙이기 명령을 띄우고 stdio로 MCP `initialize` → `tools/list` → `navigate_page`(로컬 테스트 페이지) → `take_snapshot`을 보낸다 → 에이전트 창이 1개 새로 생기고, 스냅샷에 그 페이지의 글자가 나온다 | 묶은 앱 E2E(MCP JSON-RPC를 직접 보냄) |
| A2 | 세션마다 따로 | 붙이기 명령 2개를 동시에 띄운다 → 에이전트 창이 2개 생긴다. 각자 `list_pages`에는 자기 탭만 나온다(사람 창 탭, 다른 세션 탭은 안 나옴). 한쪽의 navigate가 다른 쪽에 영향을 주지 않는다 | 묶은 앱 E2E |
| A3 | 끝나면 창 닫기 | 붙이기 명령이 (가) stdin이 닫혀 끝나거나 (나) SIGTERM으로 끝나거나 (다) SIGKILL로 강제 종료되면 → 그 세션의 에이전트 창이 5초 안에 닫히고 그 `browserUrl`은 응답하지 않는다. 다른 세션은 그대로다 | 묶은 앱 E2E(세 경우 모두) |
| A4 | 세션 닫기 API | 토큰과 함께 `DELETE /sessions/<id>` → 204, 그 창이 닫힌다. 토큰이 없거나 틀리면 401, 없는 id면 404 | 단위 + E2E |
| A5 | 앱이 꺼져 있으면 켜기 | 앱이 꺼진 상태에서 붙이기 명령을 띄운다 → 앱(사람 창)이 켜지고, 15초 안에 A1처럼 붙는다. 15초 안에 못 켜면 stderr에 이유를 한 줄 쓰고 0이 아닌 코드로 끝난다(Claude Code에 MCP 실패로 보임). 붙이기 명령 여러 개가 동시에 앱을 켜도 런처는 1개다(ADR-0008) | 묶은 앱 E2E |
| A6 | Node 없이 | PATH에서 node·npm·npx를 뺀 환경에서 A1이 통과한다 | 묶은 앱 E2E |
| A7 | 회사 밖으로 보내지 않기 | 함께 넣은 chrome-devtools-mcp는 `--no-usage-statistics`, `--no-performance-crux`로 띄운다(Google로 보내는 사용 통계와 방문 URL 조회를 끈다) | 단위(띄우는 인자 확인) |
| A8 | 사용 안내 | `README.md`에 설치(첫 실행 우클릭 → 열기), `claude mcp add agent-browser -- "<앱 경로>/Contents/Resources/agent-browser-mcp"` 한 줄, 세션마다 창이 생기고 끝나면 닫힌다는 것, 알려진 한계(서명 없음, 막힌 도구, 승인 창)가 있다 | 원문 확인 |

확인 방법(공통): `npm run lint`, `npm test`, `npm run build`, `npm run test:dist`가 모두 통과한다(기존 동작 유지). 검증 때 실제 Claude Code로 한 번 붙여 본다. `claude -p`에 `--mcp-config`로 붙이기 명령만 준다(사람의 Claude 설정은 건드리지 않는다). 로컬 테스트 페이지의 제목을 읽어 오면 통과다.

## 위험
- 공유 로그인이 걸린 회사 계정 창을 Claude 세션에 여는 길이 쉬워진다. 보호(토큰 파일 0600, 127.0.0.1만, 세션 격리, POST·다운로드 사람 승인)는 그대로다. 붙이기 명령은 같은 사용자 권한으로 토큰 파일을 읽을 뿐이고, 새로 열리는 포트는 없다.
- dmg가 약 17MB 커진다.
- 되돌리기: main을 이 작업 전 커밋(501e8f4)으로 되돌리고 `npm run dist`. Claude Code 쪽은 `claude mcp remove agent-browser`.
