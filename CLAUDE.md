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

# 확인 명령
- 설치: `npm install`
- 테스트 전체: `npm test` (build → Vitest 단위 → Playwright E2E)
- 테스트 하나: `npx vitest run <파일>` / `npm run build && npx playwright test <파일> -g <이름>`
- 타입/린트: `npm run lint`
- Mac 앱 묶기: `npm run dist` → `release/Agent Browser-<버전>-arm64.dmg` / 묶은 앱 확인: `npm run test:dist` (실제 창을 띄운다)

# 규칙 (코드에 없는 결정)
- 브라우저의 원본 CDP는 런처만 쥔다(`--remote-debugging-pipe`). TCP 디버그 포트를 열지 않는다. Playwright `_electron.launch`도 쓰지 않는다(ADR-0002).
- E2E는 테스트 프로세스가 `startApp`을 불러 런처가 된다. E2E는 `dist/`를 쓰므로 먼저 build한다.

# 함정
- 묶은 앱은 한 실행 파일이 시작·런처(ELECTRON_RUN_AS_NODE)·브라우저 세 역할을 한다(`src/app/entry.ts`). 런처가 브라우저를 띄울 때 ELECTRON_RUN_AS_NODE를 빼야 한다. 안 빼면 브라우저도 Node로 돈다.
- TS 6의 기본 `moduleDetection: force`는 렌더러 스크립트에 `exports`를 넣어 브라우저에서 깨진다 → tsconfig에 `auto`. 렌더러 `.ts`는 import 없이 `{ }` 블록으로 감싼 스크립트로 쓴다.
- macOS Electron은 거부된 위치 요청(`getCurrentPosition`)에 오류 콜백을 부르지 않고 멈춘다. 권한 처리기에도 오지 않는다. 거부 확인은 `permissions.query` 상태로 한다.
- Electron은 `Target.createTarget`을 지원하지 않는다(Not supported) → 프록시가 가로채 세션 창에 탭을 만든다.
