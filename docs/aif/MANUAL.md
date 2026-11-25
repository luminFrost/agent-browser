# AI 작업 매뉴얼 (이 프로젝트)

자동 생성: 프레임워크 0.5.0 · 목적 develop · 변형 app · 2026-11-25. 설정(`.aif/config.yaml`)과 규칙에서 만든다. 손으로 고치지 않는다.

## 흐름
```
/aif-plan <요청>  →  규모·검증 강도 제안, 목표 정의, 사람 승인
   S·M: 수행 → 검증 자동 (FAIL이면 정해진 횟수까지 고치고 재검증)
   L:   새 세션에서 /aif-work → 새 세션에서 /aif-verify
/aif-deliver      →  사람 승인 뒤 전달, 작업 닫기, 기록 문서 생성
/aif-report       →  리뷰(전달 뒤 자동으로 이어짐), 개선 목록, 승인한 것 반영
```

## 규모
| 규모 | 언제 | 기대 (실작업·토큰) | 목표 정의 | 검증 |
|---|---|---|---|---|
| 탐색 | 원하는 것을 아직 모름 | 사람이 정함 | 상한·끝 조건 | 없음 |
| S | 한두 문장, 되돌리기 어려운 결정 없음 | 30분 · 500,000 토큰 | 카드 3줄, 질문 0~1 | 확인 명령 출력 |
| M | 기능·화면·보고서 하나 | 120분 · 2,000,000 토큰 | 짧은 목표 문서, 질문 3개까지 | 확인 명령 + 검증자 1명 |
| L | 여러 모듈·구조 결정 여러 개 | 기획에서 정함 | 전체 목표 문서 + 인터뷰 | 검증자 전부 + 테스트 품질 |

- 기대를 1.5배 넘으면 멈추고 묻는다 (규모 올리기 / 범위 줄이기 / 계속). 기대는 완료 기준이 아니다.
- 검증 강도: 가볍게(나만 씀·로컬·되돌리기 쉬움) / 보통 / 엄격(운영·결제·보안). 엄격이면 /code-review와 사람 확인을 더한다.

## 확인 명령
- test: `npm test`
- lint: `npm run lint`
- build: `npm run build`

## 지키는 규칙 (자동 검사)
| ID | 내용 | 적용 |
|---|---|---|
| C-GOAL-FIRST | 목표 승인 전에 결과물을 만들지 않는다 | route: light,standard |
| C-APPROVAL-HUMAN | 승인은 사람이 한 것이어야 한다 | route: light,standard |
| C-VERIFY-BEFORE-DELIVER | 검증 통과 전에 전달하지 않는다 | route: light,standard |
| C-VERIFY-CONTEXT | 표준 경로의 검증은 수행과 다른 세션 또는 reviewer가 한다 | route: standard |
| C-DONE-EVIDENCE | 완료를 보고할 때 확인 명령 출력을 보인다 | 전부 |
| C-CHANGE-RECORDED | 승인 뒤 목표가 바뀌면 결정 기록을 남긴다 | route: standard |
| C-TWO-CORRECTIONS | 같은 주제 수정 요청이 3번 이상이면 멈추고 원인을 보고했어야 한다 | 전부 |
| C-PROGRESS | 세션을 끝내기 전에 progress.md를 갱신한다 | size: L |
| C-LIGHT-SCOPE | 가벼운 경로는 커밋 하나·완료 기준 3개 이하에 머문다 (넘으면 표준으로 올렸어야 한다) | 전부 |
| C-CLAUDE-MD-SIZE | CLAUDE.md는 200줄 미만 | 전부 |
| D-TEST-FIRST | 작업 안에서 테스트를 먼저 고친다 | route: light,standard |
| D-NO-TEST-DELETE | 테스트를 지우거나 끄지 않는다 | 전부 |
| D-COMMIT-PER-TASK | 체크한 작업마다 커밋이 있다 | size: L |
| D-NO-MAIN-PUSH | main·master로 직접 push하지 않는다 (막힌 시도도 센다) | 전부 |

## 문서가 남는 곳
| 무엇 | 어디 | 누가 쓰나 |
|---|---|---|
| 작업별 기록·리뷰 | `docs/aif/tasks/<ID>.md` | 기록: `aif close` (전달 때 자동) · 리뷰: /aif-report |
| 작업 장부 (모든 수치) | `docs/aif/ledger.csv` | `aif close` |
| 일·주·월 통계 | `docs/aif/stats.md`, 화면 `docs/aif/dashboard.html` | `aif close`, `aif stats` |
| 개선 목록 | `docs/aif/improvements.md` | `aif improve` (리뷰에서) |
| 이 매뉴얼 | `docs/aif/MANUAL.md` | `aif manual` |
| 목표 문서 | 카드 `.aif/tasks/<ID>/card.md` (S) · `docs/spec.md`·`docs/question.md` (M·L) | /aif-plan |
| 결정 기록 | `docs/adr/` | 수행 중 |
| 원시 기록 (커밋 안 함) | `.aif/tasks/<ID>/events.jsonl`, `.aif/sessions/` | 훅 |
