# ADR-0006: 에이전트 탭은 웹 스킴으로만 이동한다, 5회차 수정 범위
상태: 승인 · 날짜: 2026-11-14 · 작업: 20261114-agent-browser

## 맥락
- 검증 4회차에서 R1~R13은 모두 PASS였다. 그러나 에이전트가 `Page.navigate`로 `chrome://accessibility` 등 내부 페이지를 열어 사람 창 탭의 URL과 제목을 읽었다(Critical, 보안 제약 위반).
- 권한 테스트가 카메라 장치 상태에 따라 흔들렸다.

## 결정 (사람 결정 2026-11-14, 검증 4회차 뒤 질문 창: "5회차 진행")
1. 에이전트 탭이 이동할 수 있는 주소는 `http:`, `https:`, `about:blank`, `data:`, `blob:`뿐이다. `chrome:`·`devtools:`·`file:` 등은 두 겹으로 막는다.
   - 정책: `Page.navigate`와 `Target.createTarget`의 url을 검사한다.
   - 브라우저: 에이전트 탭의 페이지 쪽 이동(`will-navigate`·`will-redirect`·`will-frame-navigate`)과 팝업을 검사한다.
2. 권한 테스트는 장치가 있는지와 상관없이 판정한다. 기준은 `permissions.query`의 denied이고, 허용(granted)이 나오지 않는 것으로 본다.
3. 브라우저가 스스로 보내는 CSP 위반 보고(cspReport)는 폼 관문에서 묻지 않는다. 에이전트가 내용을 정하는 전송이 아니다.
4. Set-Cookie 검사는 헤더 이름 앞뒤 공백을 무시하고 판정한다.
5. Minor도 함께 고친다: PDF 저장용 `IO.read`·`IO.close` 열기, onBlocked는 정책 거부만 기록, navigateTab 실패 때도 탭 id 응답, 쓰지 않는 코드 정리.
