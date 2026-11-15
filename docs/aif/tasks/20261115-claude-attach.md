# 작업 기록: agent-browser (Electron + CDP 에이전트 공간 브라우저)

작업 ID `20261115-claude-attach` · 프레임워크 0.5.0

## 기록
<!-- aif:data:start — aif close가 다시 쓴다. 손으로 고치지 않는다 -->
| 항목 | 값 |
|---|---|
| 제목 | agent-browser (Electron + CDP 에이전트 공간 브라우저) |
| 목적 · 변형 | develop · app |
| 규모 · 검증 강도 | M · 엄격 |
| 목표 문서 | `docs/spec.md` |
| 시작 · 완료 | 2026-11-15 18:06 · 2026-11-15 18:53 |
| 걸린 기간 (시작~완료) | 47분 |
| 실작업 (5분 넘는 빈 시간 제외) | 29분 — 기대 120분의 0.24배 |
| AI 작업 · 사람 대기 | 17분 · 53분 |
| 토큰 (캐시 읽기 제외) | 0 — 기대 2,000,000의 0배 |
| 토큰 내역 | 입력 0 · 출력 0 · 캐시 쓰기 0 · 캐시 읽기 0 |
| 사람 메시지 · 수정 요청 · 개입률 | 0 · 0 · 판정 전 |
| 승인 뒤 재결정 | 0 |
| 완료 기준 · 최종 검증 | 13개 · pass |
| 검증 회차 (FAIL) | 1 (0) |
| 커밋 | 10 |
| 판정 | 규칙 주의 · 효율 정상 · 완성도 정상 |

### 단계별 시간
| 단계 | 실작업 | 들어간 횟수 | 처음 시작 |
|---|---|---|---|
| plan | 3분 | 1 | 2026-11-15 18:06 |
| work | 11분 | 1 | 2026-11-15 18:09 |
| verify | 12분 | 1 | 2026-11-15 18:20 |
| deliver | 1분 | 1 | 2026-11-15 18:52 |

### 게이트
| 시각 | 단계 | 결과 | 근거 |
|---|---|---|---|
| 2026-11-15 18:09 | plan | pass | `docs/spec-claude-attach.md` |
| 2026-11-15 18:19 | work | pass | - |
| 2026-11-15 18:30 | verify | pass | `docs/verify/20261115-claude-attach.md` |
| 2026-11-15 18:53 | deliver | pass | `docs/progress.md` |

### 사람 결정 (질문 창)
- 2026-11-15 18:09 [plan] 'Claude Code에서 바로 붙기'(작업 20261115-claude-attach) 계획을 이대로 시작할까요?
• 목표: 회사 PC에서 `claude mcp add agent-browser -- "/Applications/Agent Browser.app/Contents/Resources/agent-browser-mcp"` 한 줄이면 끝납니다. 그 뒤로는… → {"'Claude Code에서 바로 붙기'(작업 20261115-claude-attach) 계획을 이대로 시작할까요?\n• 목표: 회사 PC에서 `claude mcp add agent-browser -- \"/Applications/Agent Browser.app/Contents/Resources/agent-browser-mcp\"` 한 줄이면 끝납니다. 그 뒤로는 Claude Code 세션마다 자기 에이전트 창이 자동으로 생기고, 세션이 끝나면(강제 종료 포함) 5초 안에 닫힙니다. 앱이 꺼져 있으면 켜서 붙습니다.\n• 방법: chrome-devtools-mcp를 앱 안에 넣습니다(Node·인터넷 불필요). 세션 닫기 API를 넣고 README를 씁니다.\n• 추가로 제가 넣은 것: 함께 넣는 도구가 Google로 보내는 사용 통계와 방문 URL 조회(CrUX)는 기본으로 끕니다. 회사 보안 때문입니다.\n• 확인: 묶은 앱에 MCP로 직접 붙는 테스트(세션 2개 동시, 끝낼 때 3가지, 앱 꺼짐, Node 없음)를 돌립니다. 검증 때 실제 Claude Code(`claude -p`, 선생님 설정은 안 건드림)로 한 번 붙여 봅니다.\n• 안 할 것: 서명, 기존 격리·승인 동작 변경, 다른 MCP, Claude 설정 자동 수정.\n• 규모 M(약 2시간), 검사 보통. 브랜치는 feat/claude-attach이고, 계획 문서는 docs/spec-claude-attach.md입니다.":"승인 (추천)"}
- 2026-11-15 18:52 [deliver] 'Claude Code에서 바로 붙기'(작업 20261115-claude-attach)를 넘길까요?
• 바뀐 것: 앱 안에 붙이기 명령과 chrome-devtools-mcp가 들어갔습니다. 세션 닫기 API와 붙잡은 세션을 넣었고 README를 썼습니다. 커밋 8개, 파일 19개입니다.
• 갈 곳: 원격 저장소가 없어 PR 없이 로컬 main에 합칩니다. … → {"'Claude Code에서 바로 붙기'(작업 20261115-claude-attach)를 넘길까요?\n• 바뀐 것: 앱 안에 붙이기 명령과 chrome-devtools-mcp가 들어갔습니다. 세션 닫기 API와 붙잡은 세션을 넣었고 README를 썼습니다. 커밋 8개, 파일 19개입니다.\n• 갈 곳: 원격 저장소가 없어 PR 없이 로컬 main에 합칩니다. 산출물은 release/Agent Browser-0.1.0-arm64.dmg입니다(버전 0.1.0 그대로, 123,057,367바이트, SHA-256 24decc45…).\n• 남은 것: '사람이 창을 닫으면 /mcp로 다시 연결' Minor는 후속으로 둡니다.\n• 되돌리기: main을 501e8f4로 돌리고 npm run dist를 실행합니다. Claude Code 쪽은 claude mcp remove --scope user agent-browser로 지웁니다.":"승인, 합치기는 직접 (추천)"}

### 규칙 위반
- D-TEST-FIRST: 작업 안에서 테스트를 먼저 고친다 — src/launcher/app.ts가 edit.test보다 먼저

### 원인 (AI 판정)
- [구현] 수행 체크리스트: 구현 파일(src/…)을 고치기 전에 그 동작을 확인하는 테스트 파일을 먼저 고치고, 그 테스트가 실패하는 것을 확인한다.
<!-- aif:data:end -->

## 리뷰
<!-- aif:review:start -->
**한 줄 결론:** A1~A8과 공통 확인 모두 첫 검증에서 PASS(3a186aa, `docs/verify/20261115-claude-attach.md`). 실작업 29분으로 기대 120분의 0.24배다. 토큰은 기록상 0이라 판단하지 않았다(I-006). 규칙 판정 "주의"는 D-TEST-FIRST 1건이다.

**흐름**
- 계기(작업 전): 앞 작업 끝에 "남은 확인은 dmg 열기뿐"이라고 보고했다. 사람이 "회사 pc에서 클로드로 해당 브라우저를 띄울껀대? 지금 이 프로젝트 목적을 알고 있는거지?"라고 짚었고, 그제야 Claude Code를 붙이는 길이 비어 있음을 확인했다.
- plan(4분): 질문 한 번으로 4가지를 정했다(규모·강도, 도구를 앱에 넣기, 끝나면 닫기, 꺼져 있으면 켜기). 외부 전송 끄기(A7)는 AI가 제안하고 승인을 받았다.
- work(11분): G1 세션 닫기·붙잡기 API → G2 붙이기 명령 → G3 앱에 묶기 → G4 README. 각 단계마다 실패하는 테스트를 먼저 봤다(단위·개발 E2E·묶은 앱 E2E).
- verify(11분): 새 reviewer 1명. 1회차 PASS. 일부러 깨 본 8곳은 모두 테스트가 잡았다. 실제 `claude -p`로 붙여 페이지 제목을 읽어 왔다. 후속은 Minor 1건, Low 4건이다.
- deliver(2분): 원격 저장소가 없어 사람이 main에 직접 합친다. dmg를 다시 만들었다(SHA-256 `24decc45…`).

**잘 된 것**
- 연결이 끊기면 닫는 "붙잡은 세션"을 서버 쪽에 둔 덕분에, 강제 종료(SIGKILL)에도 창이 닫힌다. 이것을 단위·개발 E2E·묶은 앱 E2E 세 층에서 확인했다.
- 회사 PC 조건(Node 없음, 인터넷 내려받기 없음, Google 전송 끔)을 인수 사례로 적고, 묶은 앱 테스트에서 그대로 재현했다.

**문제와 원인**
- **원래 목적을 놓친 보고 [기획 누락]:** 묶은 앱 spec(`docs/spec-mac-app.md`)은 "앱이 열린다"까지만 완료 기준으로 삼았다. "Claude Code가 붙는다"는 기준이 없었다. 그래서 그 뒤 두 작업 동안 프로젝트의 핵심 용도가 손 작업으로 남았고, 사람이 직접 짚어야 했다. → I-013
- **D-TEST-FIRST 1건 [구현]:** 판정자 둘이 일치했다. `src/launcher/app.ts`의 closeSession 연결(18:11)을 단위 테스트(server.test.ts)를 본 뒤 고쳤고, 그 연결을 보는 E2E(termination.spec)는 나중에 썼다. → I-015
- **lint 실패를 못 본 채 커밋 [구현]:** `npm run lint | tail`의 종료 코드가 tail의 것이라, prefer-const 오류가 있는 상태로 커밋이 이어졌다. 바로 다음 단계에서 보고 고쳐 같은 커밋에 넣었다(8f2de67). → I-014
- 기록의 검증 강도 "엄격"·완료 기준 "13개"와 판정자 후보의 goal_doc(`docs/spec.md`)은 이번에도 틀렸다. 실제는 보통, 8개, `docs/spec-claude-attach.md`다. I-006·I-010과 같은 원인이라 새 항목은 만들지 않았다.

**개선**
- I-013 (project, 기획 누락): 쌓인 기획 질문에 "이 작업 뒤 원래 목적까지 실제로 쓸 수 있나, 손 작업이 남나"를 넣는다.
- I-014 (project, 구현): 확인 명령을 파이프로 자른 채 커밋을 잇지 않는다. 종료 코드를 보고 커밋한다.
- I-015 (project, 구현): 런처·앱 연결 코드를 바꿀 때도 그 연결을 보는 E2E를 먼저 쓰고 실패를 본다.
<!-- aif:review:end -->
