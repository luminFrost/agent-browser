#!/bin/bash
# Agent Browser를 이 Mac에 설치하고 Claude Code에 MCP로 등록한다(spec-company-setup, 절차는 docs/setup.md).
#   scripts/install-mac.sh                     소스로 빌드해서 설치(Node 22 이상 필요)
#   scripts/install-mac.sh --from-dmg <파일>    Release dmg로 설치(Node 필요 없음)
# 시험용 환경 변수: AB_INSTALL_DIR(설치 폴더), AB_REPO_DIR(저장소), AB_ARCH(CPU 이름), AB_MACOS(macOS 버전)
set -euo pipefail

APP_NAME="Agent Browser.app"
ATTACH_REL="Contents/Resources/agent-browser-mcp"
MCP_NAME="agent-browser"
MIN_NODE_MAJOR=22
MIN_MACOS_MAJOR=13 # Electron 44부터 macOS 13(Ventura) 이상만 지원한다
REPO_DIR="${AB_REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

fail() { echo "설치 실패: $*" >&2; exit 1; }

DMG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from-dmg) [ $# -ge 2 ] || fail "--from-dmg 뒤에 dmg 파일 경로가 필요하다"; DMG="$2"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) fail "모르는 인자: $1" ;;
  esac
done

# 1. 사전 확인: 아무것도 바꾸기 전에 끝낸다
[ "$(uname -s)" = "Darwin" ] || fail "macOS에서만 설치할 수 있다"
ARCH="${AB_ARCH:-$(uname -m)}"
[ "$ARCH" = "arm64" ] || fail "Apple Silicon(arm64) Mac만 지원한다(지금: $ARCH)"
MACOS="${AB_MACOS:-$(sw_vers -productVersion)}"
[ "${MACOS%%.*}" -ge "$MIN_MACOS_MAJOR" ] 2>/dev/null || fail "macOS $MIN_MACOS_MAJOR(Ventura) 이상이 필요하다(지금: $MACOS). 이 앱의 Electron이 그 아래 버전을 지원하지 않는다"
command -v claude >/dev/null 2>&1 || fail "Claude Code(claude 명령)가 없다. Claude Code를 먼저 설치한다"
if [ -n "$DMG" ]; then
  [ -f "$DMG" ] || fail "dmg 파일이 없다: $DMG"
else
  command -v node >/dev/null 2>&1 || fail "Node가 없어 빌드할 수 없다. Release dmg를 받아 --from-dmg <파일>로 설치한다(docs/setup.md 'Release로 설치')"
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  [ "$NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null || fail "Node $MIN_NODE_MAJOR 이상이 필요하다(지금: $(node -v)). Node를 올리거나 Release dmg를 받아 --from-dmg <파일>로 설치한다"
fi

# 2. 설치할 앱 준비
MOUNT=""
cleanup() { if [ -n "$MOUNT" ]; then hdiutil detach -quiet "$MOUNT" >/dev/null 2>&1 || hdiutil detach -force -quiet "$MOUNT" >/dev/null 2>&1 || true; rmdir "$MOUNT" 2>/dev/null || true; fi; }
trap cleanup EXIT
if [ -n "$DMG" ]; then
  MOUNT="$(mktemp -d /tmp/agent-browser-dmg.XXXXXX)"
  hdiutil attach -quiet -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" || { rmdir "$MOUNT"; MOUNT=""; fail "dmg를 열 수 없다: $DMG"; }
  SRC="$MOUNT/$APP_NAME"
else
  echo "빌드: npm ci → npm run dist (몇 분 걸린다)"
  (cd "$REPO_DIR" && npm ci && npm run dist) || fail "빌드가 실패했다. 위 출력을 확인하고, npm이 막혀 있으면 Release dmg로 --from-dmg 설치한다"
  SRC="$REPO_DIR/release/mac-arm64/$APP_NAME"
fi
[ -x "$SRC/$ATTACH_REL" ] || fail "앱에 붙이기 명령이 없다: $SRC/$ATTACH_REL"

# 3. 앱 복사: /Applications에 쓸 수 없으면 ~/Applications
if [ -n "${AB_INSTALL_DIR:-}" ]; then DEST_DIR="$AB_INSTALL_DIR"
elif [ -w /Applications ]; then DEST_DIR="/Applications"
else DEST_DIR="$HOME/Applications"; mkdir -p "$DEST_DIR"
fi
DEST="$DEST_DIR/$APP_NAME"
rm -rf "$DEST" || fail "기존 앱을 지우지 못했다: $DEST. 앱을 끄고 권한을 확인한 뒤 다시 한다"
ditto "$SRC" "$DEST" || fail "앱을 $DEST_DIR에 복사하지 못했다"

# 4. Claude Code에 등록(같은 이름이 있으면 지우고 다시)
claude mcp remove --scope user "$MCP_NAME" >/dev/null 2>&1 || true
claude mcp add --scope user "$MCP_NAME" -- "$DEST/$ATTACH_REL" || fail "claude mcp add가 실패했다"

cat <<MSG
설치 완료
- 앱: $DEST
- Claude Code MCP: $MCP_NAME → $DEST/$ATTACH_REL (사용자 범위, 모든 프로젝트)
다음 할 일(사람)
1. 앱을 한 번 연다: open "$DEST" (막히면 Finder에서 우클릭 → 열기, 또는 시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기)
2. 사람 창에서 회사 계정에 로그인해 둔다
3. 확인: claude mcp list 에서 $MCP_NAME 이 연결됨(✓)
MSG
