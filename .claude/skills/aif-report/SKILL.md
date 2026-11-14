---
name: aif-report
description: 끝난 작업의 이력을 리뷰하고 개선 목록을 만든다(실행 → 리뷰 → 개선). 코어 5단계. aif-deliver가 끝나면 이어서 쓰고, 사람이 /aif-report <ID>로 다시 돌릴 수도 있다.
---

# 리뷰와 개선

대상 작업 ID (비우면 마지막 작업): $ARGUMENTS

## 현재 작업
!`cat .aif/current.json`

## 판정 기준
!`cat .aif/framework/causes.md`

## 스타터 추가 예시
!`cat .claude/skills/aif-report/starter.md`

## 프로젝트 오버라이딩
!`cat .aif/overrides/report.md`

## 순서 (고정)

1. **기록을 만든다.** `node .aif/framework/bin/aif.mjs close <ID>`를 실행한다(전달 때 이미 만들어졌어도 다시 돌려 최신으로 한다).
   - `docs/aif/tasks/<ID>.md`의 "기록" 절: 기준, 시작·완료 시각, 실작업, 토큰, 단계별 시간, 게이트, 사람 결정, 규칙 위반.
   - `docs/aif/ledger.csv`(작업 장부), `docs/aif/stats.md`·`dashboard.html`(일·주·월), `docs/aif/MANUAL.md`가 함께 갱신된다.
2. **원인을 판정한다 (필요할 때만).** L이거나, 기록의 판정(규칙·효율·완성도) 중 하나라도 `정상`이 아니면 한다. S·M이 모두 `정상`이면 3으로 간다.
   - `.aif/tasks/<ID>/ai-candidates.json`을 서로 독립인 서브에이전트 두 개에게 판정하게 한다. 각자에게 후보 파일, 위 판정 기준, 후보에 적힌 `goal_doc`·`evidence_files`만 준다.
   - 결과를 `.aif/tasks/<ID>/judge-A.json`, `judge-B.json`에 쓰게 하고 `node .aif/framework/bin/aif.mjs merge-judgments <A> <B> .aif/tasks/<ID>/ai-judgments.json`로 합친다. 합치기는 코드가 한다.
   - `node .aif/framework/bin/aif.mjs close <ID>`를 다시 돌려 원인을 기록에 넣는다.
3. **리뷰를 쓴다.** `docs/aif/tasks/<ID>.md`의 `<!-- aif:review:start -->`와 `<!-- aif:review:end -->` 사이만 고친다. 기록 절의 수치, 목표 문서, 검증 보고만 근거로 쓴다. 아래 순서로 짧게:
   - **한 줄 결론:** 결과물이 기준을 통과했는지, 기대 대비 시간·토큰이 몇 배였는지.
   - **흐름:** 단계별로 무엇이 있었는지 3~6줄 (검증 FAIL이 있었다면 회차별 이유).
   - **잘 된 것:** 다음에도 할 것. 1~3개.
   - **문제와 원인:** 각 문제에 원인 단계(기획 누락·의사결정·설정·진행 방식·구현)와 근거(기록의 수치나 파일·줄)를 붙인다. 추정이면 [추론]을 붙인다.
   - **개선:** 다음 작업에서 바꿀 것. 각 항목을 `node .aif/framework/bin/aif.mjs improve add --text "<바꿀 것>" --scope <project|framework> --cause <원인> --task <ID>`로 등록하고, 받은 ID(I-001 등)를 리뷰에 적는다.
     - `project`: 이 프로젝트의 설정·규칙·오버라이딩·목표 문서 양식으로 고칠 수 있는 것.
     - `framework`: 다른 프로젝트에서도 같을 것(단계 스킬, 규모 기준, 판정 기준, 스크립트). 판정 기준의 "제안이 거스르면 안 되는 것"을 지킨다.
4. **사람에게 결정을 받는다.** 리뷰의 한 줄 결론과 개선 항목을 보이고, 항목마다 승인·기각을 한 번의 질문으로 묻는다.
   - `aif improve set <ID> approved|rejected`로 기록한다.
   - 승인된 `project` 항목은 바로 반영하고(`.aif/overrides/`, `.aif/config.yaml`, `.claude/rules/`, `.aif/plan-questions.md` 등) `aif improve set <ID> done`.
   - 승인된 `framework` 항목은 자동으로 `~/.aif/inbox`로 보내진다. 프레임워크 저장소에서 `aif inbox`로 모아 본다.
5. **문서를 커밋한다.** `docs/aif/`와 반영한 설정 파일만 `docs(aif): <ID> 기록과 리뷰` 메시지로 커밋한다. 다른 변경과 섞지 않는다.
6. 마지막에 `docs/aif/dashboard.html` 경로와 이번 작업의 기대 대비 배수를 한 줄로 알려 준다.

## 하지 않는 것
- 기록 절(aif:data)을 손으로 고치지 않는다. 수치는 스크립트가 쓴다.
- 판정 기준에 없는 원인 이름을 만들지 않는다. 점수 하나로 합치지 않는다.
- 사람이 승인하지 않은 개선을 반영하지 않는다.
