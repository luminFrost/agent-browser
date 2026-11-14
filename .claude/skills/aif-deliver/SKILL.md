---
name: aif-deliver
description: 검증을 통과한 결과를 쓸 곳에 넘긴다. 코어 4단계. 사람만 실행한다.
disable-model-invocation: true
---

# 전달

추가 지시: $ARGUMENTS

## 현재 작업
!`cat .aif/current.json`

## 주입된 내용 (아래로 갈수록 우선, 고정 항목은 제외)

### 프로젝트 설정
!`cat .aif/config.yaml`

### 스타터 구현
!`cat .claude/skills/aif-deliver/starter.md`

### 변형
!`cat .aif/framework/variant.md`

### 프로젝트 오버라이딩
!`cat .aif/overrides/deliver.md`

## 순서 (고정)

1. `node .aif/framework/bin/aif.mjs task phase deliver`를 실행한다.
2. 이 작업에 `gate verify pass` 기록이 있는지 확인한다(`.aif/tasks/<ID>/events.jsonl`). 없으면 멈춘다.
3. **전달할 내용을 요약해 보인다.**
   - 무엇이 바뀌었나
   - 어디로 가나
   - 되돌리는 방법
4. **사람의 승인을 받는다.** 승인 없이 전달 명령을 실행하지 않는다.
5. 스타터 구현의 전달 순서를 따른다.
6. `node .aif/framework/bin/aif.mjs task gate deliver pass`를 실행한다.
7. **이어서 리뷰한다.** 게이트를 통과하면 작업이 닫히고 기록 문서(`docs/aif/tasks/<ID>.md`, 장부, 통계)가 자동으로 만들어진다. 사람을 기다리지 않고 바로 `aif-report` 스킬을 불러 리뷰와 개선 목록을 만든다.

## 하지 않는 것
- 운영 환경·공유 저장소의 기본 브랜치에 직접 쓰지 않는다. 스타터가 정한 길(PR, CI, 보고서 파일)로만 넘긴다.
