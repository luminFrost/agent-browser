# Spec: 회사 PC에서 Claude가 설치하고 쓰기
상태: 승인 (2026-11-15) · 구분: 남길 것 · 정본: 이 문서 (붙이기는 `docs/spec-claude-attach.md`) · 규모: M · 검증 강도: 보통 · 작업: 20261115-company-setup
사람 결정 (2026-11-15):
- 회사 PC는 GitHub에서 이 저장소를 받을 수 있다.
- 회사 PC의 Claude가 이해할 정보가 있어야 한다.
- 앱 준비는 "빌드 우선, 안 되면 Release".
- Claude 안내는 "설치 절차 + 쓸 때 알 것".
- 계획 "승인".
- **바뀜 (2026-11-19, 카드 20261119-release-ci):** 다른 PC는 소스를 받지 않는다. 기본 경로는 Release dmg 설치 + `claude mcp add` 한 줄이고, Release는 GitHub Actions(macOS arm64)가 만든다. 소스 빌드는 개발자용으로 뒤로 뺐다(`docs/setup.md` 2-나).

## 가치
회사 PC에서 사람은 GitHub에서 저장소를 받고 그 안에서 Claude Code에게 "설치해 줘"라고만 하면 된다. Claude가 저장소의 안내를 읽고 빌드(안 되면 Release dmg), 앱 설치, `claude mcp add`, 확인까지 한다. 그 뒤 다른 프로젝트에서 agent-browser를 쓰는 Claude도 쓸 때 알아야 할 것(자기 창만 보임, 사람 승인, 막힌 도구, 창이 닫혔을 때)을 MCP 안내로 받는다. 앞 작업의 안내(`docs/install-company-pc.html`, 브랜치 docs/install-guide)는 이 Mac 경로와 USB 옮기기를 전제로 해서 맞지 않았다.

## 범위
- 한다
  - Claude가 따라 할 설치 문서 `docs/setup.md`를 쓴다. `CLAUDE.md`에서 "설치·등록 요청이면 이 문서를 따른다"고 가리킨다.
  - 설치 스크립트 `scripts/install-mac.sh`를 만든다. 사전 확인 → 빌드 또는 dmg → 앱 복사 → MCP 등록 → 확인을 한 번에 한다.
  - 붙이기 명령이 MCP `initialize` 응답에 agent-browser 사용 안내를 덧붙인다.
  - Release 절차(사람이 이 Mac에서 올리기, 회사 PC Claude가 받기)를 문서로 남긴다.
  - 사람용 안내를 새로 쓴다(이 Mac 경로·USB 전제 삭제).
  - 올리면 안 될 파일을 `.gitignore`에 넣는다(`.aif/tasks/`의 대화 기록, `.DS_Store`).
- 안 한다
  - GitHub 저장소 만들기·push·Release 올리기. 사람이 한다. 에이전트는 외부로 보내지 않는다.
  - 서명·공증, 앱 동작 변경, 새 라이브러리
  - 회사 PC의 사용자 전역 설정(`~/.claude/CLAUDE.md` 등)을 고치기. MCP 등록(`claude mcp add --scope user`)만 한다.

## 요구사항과 인수 사례 (= 완료 기준)
| # | 요구사항 | 인수 사례 (입력 → 기대 결과) | 확인 방법 |
|---|---|---|---|
| B1 | Claude용 설치 문서 | `docs/setup.md`에 회사 PC Claude가 순서대로 실행할 명령과 각 단계의 성공 판단, 실패 때 할 일이 있다. 단계: 사전 확인(arm64, macOS, Node 22 이상, `claude` 있음) → 스크립트 실행 → `claude mcp list`에 `agent-browser` 연결됨 → 사람에게 남은 일(첫 실행 허용, 회사 계정 로그인) 보고. `CLAUDE.md`에 "다른 PC 설치·등록 요청이면 `docs/setup.md`" 한 줄이 있다 | 원문 확인 + 새 Claude 세션에 저장소만 주고 "설치 절차를 요약해 봐"라고 했을 때 단계가 맞게 나온다(검증 때) |
| B2 | 설치 스크립트: 빌드 경로 | Node가 있는 Mac에서 `scripts/install-mac.sh` → `npm ci`·`npm run dist` → 앱을 `/Applications`(쓸 수 없으면 `~/Applications`)에 복사 → `claude mcp add --scope user agent-browser -- "<설치한 앱>/Contents/Resources/agent-browser-mcp"`. 같은 이름이 이미 있으면 지우고 다시 등록한다. 마지막에 설치 경로와 다음 할 일을 출력하고 0으로 끝난다 | 시험(설치 위치·`claude`를 가짜로 바꿔 인자·결과 확인) + 검증 때 깨끗한 clone에서 한 번 실제 빌드 |
| B3 | 설치 스크립트: dmg 경로 | `scripts/install-mac.sh --from-dmg <파일>` → Node 없이 dmg를 마운트해 앱을 복사하고 등록한다. 마운트는 끝에 항상 푼다 | 시험(실제 dmg, 임시 설치 위치, 가짜 `claude`, PATH에 node 없음) |
| B4 | 사전 확인 실패 | arm64가 아니거나 `claude`가 없으면 → 이유 한 줄 + 0이 아닌 코드, 아무것도 설치하지 않는다. 빌드 경로에서 Node가 없거나 22 미만이면 → "Release dmg로 `--from-dmg`" 안내와 함께 0이 아닌 코드로 끝난다 | 시험 |
| B5 | 쓸 때 알 것(MCP 안내) | 붙이기 명령의 `initialize` 응답 `instructions`에 agent-browser 안내가 들어간다(chrome-devtools-mcp의 원래 안내는 유지). 안내 내용: 이 세션 전용 창의 탭만 보인다, 사람이 같은 로그인으로 지켜본다, POST·다운로드는 사람이 허용할 때까지 기다린다, 막힌 도구와 대신 쓸 것(`emulate`), 창이 닫히면 사람에게 `/mcp` 재연결을 부탁한다 | 개발 E2E(initialize 응답 확인) + 묶은 앱 E2E |
| B6 | Release 절차 | `docs/setup.md`에 사람이 이 Mac에서 dmg를 Release로 올리는 명령(`gh release create`)과, 회사 PC Claude가 받는 명령(`gh release download` → `--from-dmg`)이 있다 | 원문 확인 |
| B7 | 사람용 안내 | `README.md` 맨 앞에 회사 PC 절차가 있다: GitHub에서 받기 → 저장소에서 `claude` 실행 → "docs/setup.md대로 설치해 줘" → 첫 실행 허용과 로그인. 이 Mac의 개인 경로가 문서에 없다 | 원문 확인 + `grep` |
| B8 | 올리면 안 될 것 | `.gitignore`에 `.aif/tasks/`와 `.DS_Store`가 있다. 추적 파일에 개인 경로(`/Users/<이름>`)·이메일·토큰이 없다 | `git check-ignore`, `git grep` |

확인 방법(공통): `npm run lint`, `npm test`, `npm run build`, `npm run test:dist`가 모두 통과한다.

## 위험
- 설치 스크립트가 사람의 Claude 설정(사용자 범위 MCP 목록)에 `agent-browser` 한 항목을 쓴다. 되돌리기: `claude mcp remove --scope user agent-browser`.
- 앱 복사가 기존 `/Applications/Agent Browser.app`을 덮어쓴다. 프로필(로그인)은 건드리지 않는다.
- 되돌리기(코드): main을 0859ad2로 되돌린다.
