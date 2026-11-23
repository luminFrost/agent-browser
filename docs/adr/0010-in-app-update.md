# ADR-0010: 앱이 GitHub 최신 Release를 묻고, 사람이 누르면 스스로 바꿔 깐다
상태: 승인 · 날짜: 2026-11-23 · 작업: 20261123-update-notice

## 맥락
- 다른 PC는 Release dmg + `claude mcp add`로 설치한다(사람 결정 11-19). 업데이트는 사람이 버전을 확인하고 설치 명령을 다시 쳐야 했다.
- 2026-11-23 개인 Mac에 0.1.0(11/15)만 남아 있었다. 사람: "이렇게 불편하면 사용안하지". 제안한 "앱 안 업데이트 알림"을 사람이 승인했다("둘 다 진행해").
- 설계 원칙 P-10은 "회사 밖으로 보내지 않는다"(chrome-devtools-mcp 사용 통계·CrUX 끔)다. 업데이트 확인은 GitHub에 요청을 보낸다.

## 결정
1. **묻기:** 묶은 앱(`app.isPackaged`)만 켜질 때와 1시간마다 `https://api.github.com/repos/<owner>/<repo>/releases/latest`를 GET한다. 주소는 `package.json` `repository`에서 만든다. 요청에 앱 데이터는 없다(버전 조회만, 쿠키 없는 별도 요청). 실패는 조용히 넘긴다(회사망이 막아도 앱은 그대로).
   - P-10과의 관계: P-10이 막는 것은 사용 데이터를 밖으로 보내는 것이다. 버전 조회 GET은 IP·User-Agent 말고 보내는 것이 없고, 설치(`gh release download`)도 이미 GitHub에서 받는다. 그래도 막아야 하는 PC를 위해 끄는 법을 둔다: 프로필의 `settings.json`에 `"updateCheck": false`(Dock·Finder로 켠 앱은 셸 환경 변수를 받지 않으므로 이것이 기본, 검증 2회차 지적), 또는 앱을 켜는 프로세스의 환경 변수 `AGENT_BROWSER_UPDATE_CHECK=off`(Claude Code가 켤 때는 `claude mcp add --env`).
2. **알리기:** 새 버전이고 그 버전의 dmg 자산(`Agent-Browser-<버전>-arm64.dmg`)이 있을 때만 패널 맨 위에 알림 줄을 보인다. 저절로 깔지 않는다: 바꾸면 앱이 다시 켜져 에이전트 세션이 끊기므로 사람이 때를 고른다.
3. **바꾸기:** **업데이트**를 누르면 브라우저 main이 dmg를 임시 폴더에 받고, `Resources/update-mac.sh <dmg> <앱 경로> <pid>`를 떨어진 프로세스(`detached`, 표준 입출력 없음)로 띄운 뒤 앱을 끈다. 스크립트는 앱이 끝나길 기다렸다가 dmg 안의 `.app`을 같은 자리에 바꿔 넣고(`ditto`, 실패하면 원래 앱 되돌림) 새 앱을 연다.
   - 앱 경로는 실행 파일 경로(`…/X.app/Contents/MacOS/…`)에서 얻는다. `/Applications`든 `~/Applications`든 깔린 자리 그대로 바꾼다.
   - MCP 등록은 다시 하지 않는다(경로가 같다). Claude Code는 `/mcp`로 다시 붙는다.
   - 프로필(로그인)은 앱 밖(`~/Library/Application Support/agent-browser`)이라 그대로다.
4. **시험:** 개발 실행은 묻지 않으므로 E2E는 `AGENT_BROWSER_UPDATE_URL`(시험 서버)과 `AGENT_BROWSER_UPDATE_INSTALLER`(가짜 설치 스크립트)로 켠다. 설치 스크립트는 `hdiutil`·`ditto`·`open`을 가짜 명령으로 바꿔 단위 시험한다. macOS 실제 바꿔 깔기는 회사 PC 확인표로 본다.

## 결과
- v0.2.4부터는 업데이트를 사람이 찾지 않아도 된다. v0.2.4로 올리는 것까지는 지금처럼 손으로 한다.
- 서명이 없으므로 바꿔 깐 앱이 macOS에서 다시 "확인되지 않은 개발자"로 막힐 수 있다. 앱이 받은 파일은 macOS 격리 표시(quarantine)를 붙이지 않는 것으로 알려져 있으나(가정) 회사 PC 확인표로 본다. 막히면 Finder 우클릭 → 열기 한 번.
- GitHub API는 인증 없이 시간당 60회까지다. 1시간 간격이라 넘지 않는다. 처음 간격으로는 켜 둔 앱이 새 버전을 반나절 못 봐서 줄였다(v0.2.6, 카드 `20261123-update-check-now`). 메뉴 **업데이트 확인…**은 사람이 누를 때만 묻고, 자동 묻기를 꺼도(아래 끄기) 묻는다(사람이 직접 고른 것).
