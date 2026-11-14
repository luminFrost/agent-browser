# ADR-0002: 런처 프로세스가 `--remote-debugging-pipe`로 브라우저의 CDP를 쥔다
상태: 승인(ADR-0001의 전제 조건 충족) · 날짜: 2026-11-14 · 작업: 20261114-agent-browser

## 맥락
ADR-0001(가)는 내부 CDP 앞에 거르는 프록시를 둔다. 내부 CDP가 TCP 포트로 열리면 같은 기기의 다른 프로세스가 프록시를 건너뛰어 사람 창의 탭에 붙을 수 있다(spec 확인 필요 2번).

## 스파이크 결과 (T0, Electron 45.3.2 / Chrome 156, macOS)
- `electron <app> --remote-debugging-pipe`를 fd 3·4에 파이프를 물려 실행하면 `Browser.getVersion`, `Target.getTargets`가 파이프로 응답했다.
- 같은 때 Electron 프로세스(자식 포함)에 LISTEN 중인 TCP 소켓이 없었다(`lsof -iTCP -sTCP:LISTEN` 결과 없음).
- fd 3·4(CDP 파이프)와 fd 5(Node `ipc` 채널)를 함께 물려도 둘 다 동작했다. Electron main에 `process.send`가 있고, 메시지가 왕복했다.
- Electron은 `Target.createTarget`에 `Not supported`를 돌려준다 → 탭 만들기는 프록시가 가로채서 앱이 세션 창에 탭을 만든다(R6과 같은 길).

## 결정
- 앱은 두 프로세스로 나눈다.
  - **런처**(Node): 브라우저 프로세스를 띄우고 파이프를 쥔다. 제어 서버(R3)와 세션별 CDP 프록시(R4~R10)를 연다.
  - **브라우저**(Electron main): 사람 창·에이전트 창·관문 UI. 내부 CDP 포트를 열지 않는다.
- 런처는 라이브러리(`startApp(options)`)로 만들고, 실행 진입점은 그것을 부르기만 한다. E2E는 테스트 프로세스가 `startApp`을 직접 불러 런처가 된다. 사람 창을 들여다볼 때는 테스트가 쥔 원본 CDP 연결을 쓴다.
- 그래서 Playwright `_electron.launch`는 쓰지 않는다(그것은 자체 디버그 포트를 연다). Playwright는 테스트 실행기와 `connectOverCDP`로만 쓴다. spec의 R1 확인 방법 칸을 이에 맞게 고친다. 관찰하는 결과는 같다.

## 결과
- 쉬워지는 것: 토큰 없는 내부 포트가 아예 없다. 프록시를 건너뛸 길은 같은 사용자 권한으로 프로세스 메모리를 들여다보는 것뿐이고, 이것은 이번 범위의 위협 밖이다.
- 어려워지는 것: 런처와 브라우저 사이의 명령(세션 창 만들기, 세션 목록 표시, 관문 질문)을 주고받을 통로가 필요하다. 이 통로는 spawn 때 물려주는 Node `ipc` 채널(fd 5)로 하고 TCP를 쓰지 않는다.
