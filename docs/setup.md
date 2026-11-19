# 설치 절차 (Claude Code가 따라 한다)

이 문서는 다른 Mac(예: 회사 PC)에서 Claude Code가 Agent Browser를 설치하고 MCP로 등록할 때 따르는 절차다. 사람이 "설치해 줘", "agent-browser 등록해 줘"라고 하면 이 순서대로 한다. 각 단계의 명령을 실행하고 출력으로 성공을 판단한다. 실패하면 "실패하면"에 적힌 대로 하고, 거기 없는 일은 하지 말고 사람에게 출력을 보여 준다.

설치가 바꾸는 것은 세 가지뿐이다.
- `/Applications/Agent Browser.app`(쓸 수 없으면 `~/Applications`)
- Claude Code의 사용자 범위 MCP 항목 `agent-browser` 한 개
- 빌드 경로에서만: 저장소 안의 `node_modules/`, `dist/`, `release/`

사람의 다른 설정(`~/.claude/CLAUDE.md`, 다른 MCP 등)은 건드리지 않는다.

## 1. 사전 확인

```sh
uname -m          # arm64 여야 한다
sw_vers -productVersion
command -v claude && claude --version
node -v           # v22 이상이면 빌드 경로, 없거나 낮으면 Release 경로
```

- `uname -m`이 `arm64`가 아니면 멈춘다. 이 앱은 Apple Silicon만 지원한다고 사람에게 알린다.
- Node가 v22 이상이면 2-가(빌드), 아니면 2-나(Release)로 간다.

## 2-가. 빌드로 설치 (기본)

저장소 맨 위 폴더에서 실행한다.

```sh
scripts/install-mac.sh
```

- 이 명령은 `npm ci` → `npm run dist`(몇 분 걸린다) → 앱 복사 → `claude mcp add --scope user agent-browser -- "<앱>/Contents/Resources/agent-browser-mcp"` 순서로 한다. 같은 이름이 이미 있으면 지우고 다시 등록한다.
- 성공: 마지막에 `설치 완료`와 앱 경로가 나오고, 종료 코드가 0이다.
- 실패하면:
  - `npm ci`가 네트워크 오류(ETIMEDOUT, 403, ECONNREFUSED, 프록시 오류)로 실패하면 회사 네트워크가 npm을 막는 것이다. 2-나로 간다.
  - Electron 내려받기(github.com의 electron 파일)가 막혀도 2-나로 간다.
  - 그 밖의 실패는 출력 끝부분 30줄을 사람에게 보여 주고 멈춘다.

## 2-나. Release dmg로 설치 (빌드가 안 될 때)

Release는 사람이 개발 Mac에서 올려 둔다(아래 "Release 올리기"). 회사 PC에서는 내려받아 설치한다.

```sh
rm -rf /tmp/agent-browser-release && mkdir -p /tmp/agent-browser-release
gh release download --pattern 'Agent-Browser-*-arm64.dmg' --dir /tmp/agent-browser-release
ls /tmp/agent-browser-release      # dmg가 정확히 하나여야 한다
scripts/install-mac.sh --from-dmg /tmp/agent-browser-release/Agent-Browser-*-arm64.dmg
```

- 가장 최근 Release를 받는다. dmg 이름은 `Agent-Browser-<버전>-arm64.dmg`다(공백 없음).

- `gh`가 없거나 로그인되어 있지 않으면, GitHub 저장소의 Releases 페이지에서 dmg를 내려받아 달라고 사람에게 부탁한다. 받은 파일 경로로 `--from-dmg`를 실행한다.
- Release가 하나도 없으면 사람에게 "개발 Mac에서 Release를 올려 주세요"라고 알리고 멈춘다.
- 성공 판단은 2-가와 같다.

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

## Release 올리기 (사람이 개발 Mac에서)

빌드가 막힌 PC를 위해, 개발 Mac에서 만든 dmg를 GitHub Release로 올린다. 버전은 `package.json`의 `version`을 쓴다.

```sh
npm run dist
VERSION="$(node -p 'require("./package.json").version')"
gh release create "v$VERSION" "release/Agent-Browser-$VERSION-arm64.dmg" \
  --title "Agent Browser $VERSION" --notes "Apple Silicon dmg. 설치: docs/setup.md"
```

같은 버전으로 다시 올릴 때는 `gh release upload "v$VERSION" "release/Agent-Browser-$VERSION-arm64.dmg" --clobber`를 쓴다. `release/`에는 옛 버전 dmg가 남아 있을 수 있으니 파일 이름을 버전까지 정확히 쓴다.

## 쓸 때 (설치 뒤, 다른 프로젝트에서)

agent-browser MCP에 붙으면 initialize 안내(instructions)로 쓸 때 알 것을 받는다. 요약:
- 이 세션 전용 탭만 보인다(사람 창 안에 있고, 사람이 패널에서 골라 지켜볼 수 있다).
- 사람의 회사 계정 로그인을 함께 쓴다.
- 폼 제출(POST)·다운로드는 사람이 허용해야 진행된다.
- 막힌 도구가 있다. 화면 크기는 `emulate`로 바꾼다.
- 연결이 끊기면 사람에게 `/mcp` 재연결을 부탁한다.

자세한 것은 `README.md`의 "알려진 한계"를 본다.
