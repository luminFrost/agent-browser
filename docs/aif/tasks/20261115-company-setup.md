# 작업 기록: agent-browser (Electron + CDP 에이전트 공간 브라우저)

작업 ID `20261115-company-setup` · 프레임워크 0.5.0

## 기록
<!-- aif:data:start — aif close가 다시 쓴다. 손으로 고치지 않는다 -->
| 항목 | 값 |
|---|---|
| 제목 | agent-browser (Electron + CDP 에이전트 공간 브라우저) |
| 목적 · 변형 | develop · app |
| 규모 · 검증 강도 | M · 엄격 |
| 목표 문서 | `docs/spec.md` |
| 시작 · 완료 | 2026-11-15 19:02 · 2026-11-15 19:42 |
| 걸린 기간 (시작~완료) | 40분 |
| 실작업 (5분 넘는 빈 시간 제외) | 40분 — 기대 120분의 0.33배 |
| AI 작업 · 사람 대기 | 7분 · 42분 |
| 토큰 (캐시 읽기 제외) | 0 — 기대 2,000,000의 0배 |
| 토큰 내역 | 입력 0 · 출력 0 · 캐시 쓰기 0 · 캐시 읽기 0 |
| 사람 메시지 · 수정 요청 · 개입률 | 0 · 0 · 판정 전 |
| 승인 뒤 재결정 | 0 |
| 완료 기준 · 최종 검증 | 13개 · pass |
| 검증 회차 (FAIL) | 2 (1) |
| 커밋 | 9 |
| 판정 | 규칙 정상 · 효율 주의 · 완성도 주의 |

### 단계별 시간
| 단계 | 실작업 | 들어간 횟수 | 처음 시작 |
|---|---|---|---|
| plan | 2분 | 1 | 2026-11-15 19:02 |
| work | 14분 | 2 | 2026-11-15 19:04 |
| verify | 23분 | 2 | 2026-11-15 19:13 |
| deliver | 1분 | 1 | 2026-11-15 19:41 |

### 게이트
| 시각 | 단계 | 결과 | 근거 |
|---|---|---|---|
| 2026-11-15 19:04 | plan | pass | `docs/spec-company-setup.md` |
| 2026-11-15 19:13 | work | pass | - |
| 2026-11-15 19:23 | verify | fail | `reviewer: B6 Release 자산 이름(공백) 불일치 Major` |
| 2026-11-15 19:28 | work | pass | - |
| 2026-11-15 19:39 | verify | pass | `docs/verify/20261115-company-setup.md` |
| 2026-11-15 19:42 | deliver | pass | `docs/progress.md` |

### 사람 결정 (질문 창)
- 2026-11-15 19:04 [plan] '회사 PC에서 Claude가 설치하고 쓰기'(작업 20261115-company-setup) 계획을 이대로 시작할까요?
• 회사 PC에서 하실 일: GitHub에서 저장소를 받고, 그 안에서 Claude에게 "docs/setup.md대로 설치해 줘"라고 말하면 됩니다. 남는 것은 처음 한 번 실행 허용과 회사 계정 로그인뿐입니다.
• 만들 것:
  - C… → {"'회사 PC에서 Claude가 설치하고 쓰기'(작업 20261115-company-setup) 계획을 이대로 시작할까요?\n• 회사 PC에서 하실 일: GitHub에서 저장소를 받고, 그 안에서 Claude에게 \"docs/setup.md대로 설치해 줘\"라고 말하면 됩니다. 남는 것은 처음 한 번 실행 허용과 회사 계정 로그인뿐입니다.\n• 만들 것:\n  - Claude용 설치 문서(docs/setup.md)와, CLAUDE.md에서 그 문서를 가리키는 한 줄\n  - 설치 스크립트: 사전 확인 → 빌드(안 되면 Release dmg) → 앱 복사 → claude mcp add → 확인\n  - 다른 프로젝트에서 쓸 때 Claude가 받는 MCP 안내: 자기 창만, 사람 승인 대기, 막힌 도구, 창이 닫히면 /mcp\n  - Release 올리기·받기 절차\n  - README는 회사 PC 절차 위주로 고칩니다. .gitignore에 대화 기록(.aif/tasks/)을 넣어 GitHub에 올라가지 않게 합니다.\n• 선생님이 하실 것: GitHub 저장소를 만들고 push하시는 것(비공개를 권합니다). 빌드가 막히는 경우에만 Release를 올리시면 됩니다. 저는 외부로 보내지 않습니다.\n• 확인: 스크립트 시험(가짜 claude, 임시 설치 위치), 깨끗한 clone에서 실제 빌드 한 번, MCP 안내 E2E. 선생님의 실제 Claude 설정은 건드리지 않습니다.\n• 규모 M(약 2시간), 검사 보통. 브랜치는 feat/company-setup이고, 계획 문서는 docs/spec-company-s…
- 2026-11-15 19:42 [deliver] '회사 PC에서 Claude가 설치하고 쓰기'(작업 20261115-company-setup)를 넘길까요?
• 바뀐 것: Claude용 설치 문서(docs/setup.md), 설치 스크립트, MCP 안내, README 맨 앞의 회사 PC 절차, .gitignore입니다. dmg 이름은 Agent-Browser-0.1.0-arm64.dmg로 바뀝니다. 커밋 … → {"'회사 PC에서 Claude가 설치하고 쓰기'(작업 20261115-company-setup)를 넘길까요?\n• 바뀐 것: Claude용 설치 문서(docs/setup.md), 설치 스크립트, MCP 안내, README 맨 앞의 회사 PC 절차, .gitignore입니다. dmg 이름은 Agent-Browser-0.1.0-arm64.dmg로 바뀝니다. 커밋 8개, 파일 20개입니다.\n• 갈 곳: 원격 저장소가 아직 없어 로컬 main에 직접 합치십니다. GitHub push는 그다음에 선생님이 하십니다. 산출물은 release/Agent-Browser-0.1.0-arm64.dmg(123,060,157바이트, SHA-256 fecd2a54…)입니다.\n• 남은 것: Minor·Low 7건은 후속으로 둡니다.\n• 되돌리기: main을 0859ad2로 되돌립니다. 설치한 PC에서는 claude mcp remove --scope user agent-browser를 실행합니다.":"승인, 합치기는 직접 (추천)"}

### 규칙 위반
- 없음

### 원인 (AI 판정)
- [구현] Release/배포 문서 체크리스트: 받기·올리기 명령의 파일 이름이 호스트(GitHub 등)가 실제로 저장하는 자산 이름(공백·특수문자 치환)과 맞는지 확인하고, 이름을 시험으로 고정한다.
- [구현] Release/배포 문서 체크리스트: 문서에 적은 외부 명령(gh release download 등)의 glob·파일 이름을 실제 산출물 이름과 대조하고, 외부 서비스의 이름 변환 규칙을 확인한다.
<!-- aif:data:end -->

## 리뷰
<!-- aif:review:start -->
**한 줄 결론:** B1~B8과 공통 확인 모두 2회차 검증에서 PASS(723bf82, `docs/verify/20261115-company-setup.md`). 실작업 40분으로 기대 120분의 0.33배다. 토큰은 기록상 0이라 판단하지 않았다(I-006). 효율 "주의"·완성도 "주의"는 1회차 FAIL 1건 때문이다.

**흐름**
- 계기(작업 전): 앞 작업 뒤 안내에서 회사 PC를 "이 Mac에서 dmg를 USB로 옮기기"로 잘못 전제했다. 사람이 두 가지를 짚었다: "회사 pc에서 github로 이 프로젝트 소스 다운 가능", "회사 pc의 클로드가 이해할 수 있는 정보가 있어야함".
- plan(2분): 질문 한 번(빌드 우선, 안 되면 Release / 설치 절차와 쓸 때 알 것)으로 범위를 정하고 B1~B8로 승인받았다.
- work(11분): H1 MCP 안내 → H2 설치 스크립트 → H3 문서 → H4 .gitignore. 각각 실패하는 시험을 먼저 봤다(단위·개발 E2E·스크립트 시험).
- verify 1회차 FAIL: B6 Release 받기 명령이 공백 든 dmg 이름(`Agent\ Browser-*`)을 썼다. GitHub은 자산 이름의 공백을 바꾼다.
- 고침(약 10분): dmg 이름을 `Agent-Browser-<버전>-arm64.dmg`로 바꾸고, 문서와 이름이 어긋나면 실패하는 `scripts/release-docs.test.ts`를 넣었다.
- verify 2회차 PASS: 새 검증자가 깨끗한 clone에서 실제로 빌드·설치했다(가짜 claude, 임시 폴더). 후속은 Minor 3건, Low 4건이다. deliver: 원격이 아직 없어 사람이 합치고 push한다.

**잘 된 것**
- 설치 스크립트를 환경 변수(`AB_INSTALL_DIR`, `AB_REPO_DIR`, `AB_ARCH`)와 가짜 `claude`/`npm`/`node`로 시험할 수 있게 만들었다. 그래서 사람의 실제 설정과 `/Applications`를 건드리지 않고 검증자가 끝까지 실제로 돌려 볼 수 있었다.
- 검사 중 발견한 어제 세션의 남은 테스트 프로세스 3개를 정리했다.

**문제와 원인**
- **1회차 FAIL: Release 받기 명령의 dmg 이름 [구현]** (판정자 둘 일치). B6 요구는 목표 문서에 있었다. 하지만 GitHub의 자산 이름 규칙을 확인하지 않고, 로컬 산출물 이름(공백 포함)을 그대로 문서에 썼다. → I-016
- **FAIL 게이트의 증거가 파일이 아니었음 [설정]:** `gate verify fail --evidence`에 보고 파일 대신 요약 글을 넘겼다. 그래서 판정자가 증거 파일을 열 수 없어, 검증 보고 경로를 따로 알려 줘야 했다. → I-017(framework)
- 판정자 후보의 goal_doc이 이번에도 `docs/spec.md`를 가리켰다. I-010과 같은 원인이라 새 항목은 만들지 않았다.

**개선**
- I-016 (project, 구현): 외부 서비스 명령(gh release 등)을 문서·스크립트에 쓸 때는 그 서비스의 이름 규칙과 플래그를 확인하고, 실제 산출물 이름과 문서가 맞는지 시험으로 묶는다.
- I-017 (framework, 설정): gate `--evidence`에 파일 경로가 아닌 글이 오면 경고한다. FAIL 게이트도 보고 파일을 먼저 쓰게 한다.
<!-- aif:review:end -->
