<!--
프로젝트 CLAUDE.md 틀. 프로젝트 루트에 복사해 채운다. 이 주석 블록은 Claude에게 전달되지 않는다.
- 코드를 읽으면 알 수 있는 것(폴더 구조, 일반 관례)은 쓰지 않는다.
- 200줄 미만. 일부 경로에만 해당하는 규칙은 .claude/rules/ 로 옮긴다.
- 구분: "탐색" 또는 "남길 것" 하나만 남긴다. 탐색이면 기간·비용 상한과 끝의 조건을 함께 적는다.
- 정본: 개발은 docs/spec.md, 분석은 docs/question.md, 기존 코드를 분석하는 작업은 "코드".
- 아래 @ 줄은 프레임워크가 주는 지시(스타터)를 가져온다. 프레임워크 파일은 고치지 않고, 바꿀 것은 이 파일과 .aif/overrides/ 에 쓴다.
-->

@.aif/framework/starter/CLAUDE.md

# 이 프로젝트
- 목적: 개발
- 구분: 남길 것
- 정본: docs/spec.md (작업 목록 docs/tasks.md, 결정 docs/adr/)

# 다른 PC에 설치
- 사람이 이 앱을 이 PC에 설치·등록해 달라고 하면 `docs/setup.md`의 절차를 그대로 따른다(설치 스크립트 `scripts/install-mac.sh`).

# 확인 명령
- 설치: `npm install`
- 테스트 전체: `npm test` (build → Vitest 단위 → Playwright E2E, 단위가 실패해도 E2E까지 돌고 하나라도 실패하면 실패)
- E2E만: `npm run test:e2e` (build → Playwright E2E)
- OS별: macOS에서는 `npm test`가 모두 통과해야 한다. Linux에서는 macOS 전용 단위가 실패하는 것이 정상이다: 설치 스크립트 8건, 기본 프로필 경로 1건, 그리고 파일 시각이 거친 파일 시스템에서 자물쇠 신호 받음 1건(통과할 때도 있다). 그 밖의 단위와 E2E가 통과하면 된다(CI도 Linux는 E2E, macOS는 단위로 나눠 돈다)
- 테스트 하나: `npx vitest run <파일>` / `npm run build && npx playwright test <파일> -g <이름>`
- 타입/린트: `npm run lint`
- Mac 앱 묶기: `npm run dist` → `release/Agent-Browser-<버전>-arm64.dmg` / 묶은 앱 확인: `npm run test:dist` (실제 창을 띄운다)

# 규칙 (코드에 없는 결정)
- 브라우저의 원본 CDP는 런처만 쥔다(`--remote-debugging-pipe`). TCP 디버그 포트를 열지 않는다. Playwright `_electron.launch`도 쓰지 않는다(ADR-0002).
- E2E는 테스트 프로세스가 `startApp`을 불러 런처가 된다. E2E는 `dist/`를 쓰므로 먼저 build한다.

# 함정
- 묶은 앱은 한 실행 파일이 시작·런처(ELECTRON_RUN_AS_NODE)·브라우저 세 역할을 한다(`src/app/entry.ts`). 런처가 브라우저를 띄울 때 ELECTRON_RUN_AS_NODE를 빼야 한다. 안 빼면 브라우저도 Node로 돈다.
- TS 6의 기본 `moduleDetection: force`는 렌더러 스크립트에 `exports`를 넣어 브라우저에서 깨진다 → tsconfig에 `auto`. 렌더러 `.ts`는 import 없이 `{ }` 블록으로 감싼 스크립트로 쓴다.
- macOS Electron은 거부된 위치 요청(`getCurrentPosition`)에 오류 콜백을 부르지 않고 멈춘다. 권한 처리기에도 오지 않는다. 거부 확인은 `permissions.query` 상태로 한다.
- Electron은 `Target.createTarget`을 지원하지 않는다(Not supported) → 프록시가 가로채 그 세션의 탭 묶음(사람 창 안)에 탭을 만든다.
- 숨긴(`setVisible(false)`) 탭, 다른 탭 view에 완전히 덮인 탭은 그리지 않는다 → CDP 클릭·스크린샷이 멈춘다. 그래서 보이지 않는 세션의 활성 탭은 크기 그대로 창 오른쪽 아래 구석 바깥에 두고 페이지 왼쪽 위 1px만 드러낸다(에이전트가 화면 크기를 줄여도 페이지 안이어야 한다). 드러난 점은 `View`로도 덮지 않는다(덮으면 멈춘다). Linux 메뉴 막대는 resize 이벤트 없이 내용 높이를 줄이므로 사람 창 UI가 `relayout`으로 알린다(ADR-0009).
- 에이전트 탭의 `before-mouse-event`는 사람 마우스와 CDP `Input.dispatchMouseEvent`를 똑같이 받는다(구별할 값이 없다). 그래서 프록시가 `Input.*` 앞뒤로 `agentInput`을 알린다. `before-input-event`는 CDP 키 입력을 거치지 않는다. 휠은 두 이벤트 모두에 오지 않는다. 사람 입력 시험은 `simulateHumanInput`(sendInputEvent, OS 입력과 같은 길)으로 한다(ADR-0009).
- 세션 탭은 생길 때와 `Page.bringToFront` 때 키보드 포커스를 가져간다. 화면에 없는 탭이면 사람이 보는 탭으로 포커스를 돌려준다. focus 이벤트 안에서 바로 돌리면 먹히지 않아 `setImmediate`로 한다(ADR-0009 3-1). Linux에서 숨긴 창(테스트 기본)은 아예 그리지 않으니 화면이 필요한 E2E는 `launch({ hidden: false })`로 창을 띄운다(embedded.spec). 다른 화면 시험은 `AB_TEST_SHOW=1`로 본다.
