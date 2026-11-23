# 설치 절차 (Claude Code가 따라 한다)

이 문서는 다른 Mac(예: 회사 PC)에서 Claude Code가 Agent Browser를 설치하고 MCP로 등록할 때 따르는 절차다. 사람이 "설치해 줘", "agent-browser 등록해 줘", "업데이트해 줘"라고 하면 이 순서대로 한다. 각 단계의 명령을 실행하고 출력으로 성공을 판단한다. 실패하면 "실패하면"에 적힌 대로 하고, 거기 없는 일은 하지 말고 사람에게 출력을 보여 준다.

**소스는 필요 없다.** 기본 경로는 GitHub Release의 dmg로 설치하는 것이다. 이 문서는 저장소를 받지 않은 PC에서도 GitHub 웹(https://github.com/luminFrost/agent-browser/blob/main/docs/setup.md)으로 읽고 따를 수 있다. 소스로 빌드하는 것은 개발자용(2-나)이다.

설치가 바꾸는 것은 두 가지뿐이다.
- `/Applications/Agent Browser.app`(쓸 수 없으면 `~/Applications`)
- Claude Code의 사용자 범위 MCP 항목 `agent-browser` 한 개

사람의 다른 설정(`~/.claude/CLAUDE.md`, 다른 MCP 등)은 건드리지 않는다. 로그인 정보가 든 프로필(`~/Library/Application Support/agent-browser`)도 건드리지 않는다.

## 1. 사전 확인

```sh
uname -m          # arm64 여야 한다
sw_vers -productVersion
command -v claude && claude --version
command -v gh && gh auth status   # 있으면 2-가를 명령으로, 없으면 사람에게 내려받기를 부탁한다
```

- `uname -m`이 `arm64`가 아니면 멈춘다. 이 앱은 Apple Silicon만 지원한다고 사람에게 알린다.
- `sw_vers -productVersion`의 앞자리가 13보다 작으면 멈춘다. macOS 13(Ventura) 이상이 필요하다고 알린다(앱의 Electron 45가 그 아래를 지원하지 않는다).
- `claude`가 없으면 멈춘다. Claude Code를 먼저 설치해야 한다고 알린다.
- Node는 필요 없다.

## 2-가. Release dmg로 설치 (기본)

가장 최근 Release에서 dmg와 설치 스크립트를 받아 설치한다. Release는 CI가 올린다(아래 "Release 올리기").

```sh
rm -rf /tmp/agent-browser-release && mkdir -p /tmp/agent-browser-release
gh release download --repo luminFrost/agent-browser --dir /tmp/agent-browser-release \
  --pattern 'Agent-Browser-*-arm64.dmg' --pattern 'install-mac.sh'
ls /tmp/agent-browser-release      # dmg 하나와 install-mac.sh가 있어야 한다
bash /tmp/agent-browser-release/install-mac.sh --from-dmg /tmp/agent-browser-release/Agent-Browser-*-arm64.dmg
```

- 이 명령은 dmg를 열어 앱을 복사하고(기존 앱은 덮어쓴다) `claude mcp add --scope user agent-browser -- "<앱>/Contents/Resources/agent-browser-mcp"`로 등록한다. 같은 이름이 이미 있으면 지우고 다시 등록한다. dmg는 끝에 항상 닫는다.
- dmg 이름은 `Agent-Browser-<버전>-arm64.dmg`다(공백 없음).
- 성공: 마지막에 `설치 완료`와 앱 경로가 나오고, 종료 코드가 0이다.
- 실패하면:
  - `gh`가 없거나 로그인되어 있지 않으면, 사람에게 https://github.com/luminFrost/agent-browser/releases/latest 에서 `Agent-Browser-<버전>-arm64.dmg`와 `install-mac.sh`를 내려받아 달라고 부탁한다. 받은 폴더(보통 `~/Downloads`)에서 `bash ~/Downloads/install-mac.sh --from-dmg ~/Downloads/Agent-Browser-<버전>-arm64.dmg`를 실행한다.
  - Release가 하나도 없으면 사람에게 "Release가 아직 없습니다. GitHub Actions의 release를 실행해 주세요"라고 알리고 멈춘다.
  - 그 밖의 실패는 출력 끝부분 30줄을 사람에게 보여 주고 멈춘다.

## 2-나. 소스로 빌드해서 설치 (개발자용)

저장소를 받아 둔 Mac에서, Node 22 이상이 있을 때만 쓴다. 저장소 맨 위 폴더에서 실행한다.

```sh
node -v           # v22 이상
scripts/install-mac.sh
```

- 이 명령은 `npm ci` → `npm run dist`(몇 분 걸린다) → 앱 복사 → MCP 등록 순서로 한다. 성공 판단은 2-가와 같다.
- `npm ci`나 Electron 내려받기가 네트워크 오류(ETIMEDOUT, 403, ECONNREFUSED, 프록시 오류)로 실패하면 회사 네트워크가 막는 것이다. 2-가로 간다.

## 3. 확인

```sh
claude mcp list
```

- `agent-browser`가 연결됨(✓ Connected)으로 나오면 성공이다. 이 확인을 할 때 앱이 켜지고 오른쪽 패널에 세션이 잠깐 생겼다가 사라질 수 있다. 정상이다.
- 연결 실패(✗)로 나오면 `~/Library/Application Support/agent-browser/launcher.log`의 끝 30줄을 보여 준다. 앱이 처음 실행을 막혔을 가능성이 크다(4번).

## 4. 사람에게 남은 일을 알린다

설치가 끝나면 아래를 사람에게 그대로 전한다.

1. 앱을 한 번 여세요. `open "<설치 완료에 나온 앱 경로>"`(보통 `/Applications/Agent Browser.app`, 쓸 수 없었으면 `~/Applications/Agent Browser.app`). 막히면 Finder에서 우클릭 → 열기를 하거나, 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"를 누르세요. 그래도 안 되면 회사 정책이 서명 없는 앱을 막는 것이니 IT 담당과 상의해야 합니다.
2. 사람 창에서 회사 계정에 로그인해 두세요. Claude의 탭도 이 로그인을 함께 씁니다.
3. 새 Claude Code 세션부터 agent-browser 도구를 쓸 수 있습니다. 지금 이 세션에서 쓰려면 `/mcp`로 다시 연결하세요.

## 지우기

```sh
claude mcp remove --scope user agent-browser
rm -rf "/Applications/Agent Browser.app"     # 또는 ~/Applications
# 로그인 정보까지 지우려면(사람에게 먼저 확인):
# rm -rf ~/Library/Application\ Support/agent-browser
```

## 업데이트

사람이 "업데이트 확인해 줘", "업데이트해 줘"라고 하면 먼저 버전을 비교한다.

```sh
defaults read "/Applications/Agent Browser.app/Contents/Info" CFBundleShortVersionString   # 설치된 버전(~/Applications에 깔렸으면 그 경로)
gh release view --repo luminFrost/agent-browser --json tagName,publishedAt,body --jq '.tagName, .publishedAt, .body'   # 최신 Release(태그는 v<버전>)
```

- 설치된 버전과 최신 태그(`v` 뺀 값)가 같으면 "최신입니다"라고 알리고 끝낸다.
- 최신이 더 높으면 Release 노트(바뀐 내용)를 짧게 보여 주고 2-가를 그대로 다시 한다. 앱은 덮어쓰고, 로그인 정보(프로필)는 그대로 남는다. MCP 경로가 같으므로 다시 등록해도 결과는 같다. 앱이 켜져 있으면 먼저 끄라고 사람에게 부탁한다. 끝나면 Claude Code에서 `/mcp`로 다시 연결하라고 알린다.
- `gh`가 없으면 사람에게 https://github.com/luminFrost/agent-browser/releases/latest 의 버전을 봐 달라고 부탁한다.
- 업데이트한 뒤 사람이 "확인표대로 확인하자"고 하면 [`verify/20261123-company-pc-check.md`](verify/20261123-company-pc-check.md)를 보여 주고, Claude Code가 시킬 일(세션 열기, 페이지 옮기기, 폼 제출)을 항목 순서대로 한다. 결과 칸은 사람이 본 것으로 채운다.

## Release 올리기 (CI가 한다)

dmg는 GitHub Actions의 macOS(arm64) 러너가 만든다(`.github/workflows/release.yml`). lint·단위 시험·묶은 앱 시험을 통과해야만 Release에 `Agent-Browser-<버전>-arm64.dmg`와 `install-mac.sh`가 올라간다. 버전은 `package.json`의 `version`이다.

1. `package.json`과 `package-lock.json`의 `version`을 올려 main에 합친다.
2. 둘 중 하나로 실행한다.
   - 태그: `git tag v<버전> && git push origin v<버전>` (태그와 `package.json` 버전이 다르면 CI가 멈춘다)
   - 수동: GitHub의 Actions → release → Run workflow (그 버전으로 태그를 만든다)
3. 같은 버전으로 다시 실행하면 그 Release의 파일을 바꿔 올린다.

## 쓸 때 (설치 뒤, 다른 프로젝트에서)

agent-browser MCP에 붙으면 initialize 안내(instructions)로 쓸 때 알 것을 받는다. 요약:
- 이 세션 전용 탭만 보인다(사람 창 안에 있고, 사람이 패널에서 골라 지켜볼 수 있다).
- 사람의 회사 계정 로그인을 함께 쓴다.
- 폼 제출(POST)·다운로드는 사람이 허용해야 진행된다.
- 막힌 도구가 있다. 화면 크기는 `emulate`로 바꾼다.
- 세션은 창을 따로 띄우지 않는다. 사람이 패널에서 그 세션의 멈추기를 누르거나 Claude Code 세션이 끝나면 세션이 끝난다.
- 연결이 끊기면(사람이 패널에서 멈추기를 눌렀거나 앱이 꺼짐) 사람에게 `/mcp` 재연결을 부탁한다.

자세한 것은 `README.md`의 "알려진 한계"를 본다.
