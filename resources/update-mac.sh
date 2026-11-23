#!/bin/bash
# Agent Browser 앱 안 업데이트 설치 스크립트(카드 20261123-update-notice U3, ADR-0010 3).
# 앱이 떨어진 프로세스로 띄우고 스스로 끝난다. 앱이 끝나길 기다렸다가 dmg 안의 앱으로 같은 자리를 바꾸고 다시 연다.
# 쓰는 법: update-mac.sh <dmg> <앱 묶음 경로> <앱 pid>
set -uo pipefail

dmg="$1"; app="$2"; pid="$3"
# 앱이 끝나길 기다리는 간격(초)과 횟수: 0.2초 × 150 = 30초. 시험은 횟수를 줄인다
WAIT_STEP_S=0.2
WAIT_TRIES="${AGENT_BROWSER_UPDATE_WAIT_TRIES:-150}"
profile="${AGENT_BROWSER_PROFILE:-$HOME/Library/Application Support/agent-browser}"
mkdir -p "$profile" 2>/dev/null
log="$profile/update.log"
say() { echo "$(date '+%F %T') $*" >> "$log" 2>/dev/null || true; }
# 앱이 끝난 뒤의 실패면 원래 앱을 다시 열어 사람이 앱 없이 남지 않게 한다
reopen=0
fail() {
  say "업데이트 실패: $*"
  if [ "$reopen" = 1 ] && [ -e "$app" ]; then open "$app" || say "원래 앱을 다시 열지 못했다"; fi
  exit 1
}

say "업데이트 시작: $dmg → $app (pid $pid)"

# 앱(브라우저)이 끝나길 기다린다
for _ in $(seq 1 "$WAIT_TRIES"); do
  kill -0 "$pid" 2>/dev/null || break
  sleep "$WAIT_STEP_S"
done
kill -0 "$pid" 2>/dev/null && fail "앱이 끝나지 않았다(pid $pid). 앱을 끄고 다시 업데이트한다"
reopen=1

mnt="$(mktemp -d "${TMPDIR:-/tmp}/agent-browser-mount.XXXXXX")" || fail "임시 폴더를 만들지 못했다"
detach() { hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || hdiutil detach "$mnt" -force -quiet >/dev/null 2>&1 || true; rmdir "$mnt" 2>/dev/null || true; }
trap detach EXIT

hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$mnt" "$dmg" >/dev/null || fail "dmg를 열지 못했다"
src="$(find "$mnt" -maxdepth 1 -name '*.app' -print -quit)"
[ -n "$src" ] || fail "dmg 안에 앱이 없다"

old="$app.old"
rm -rf "$old"
if [ -e "$app" ]; then mv "$app" "$old" || fail "기존 앱을 옮기지 못했다"; fi
if ! ditto "$src" "$app"; then
  rm -rf "$app"
  if [ -e "$old" ] && ! mv "$old" "$app"; then
    reopen=0
    fail "새 앱을 복사하지 못했고 원래 앱도 되돌리지 못했다. 원래 앱: $old"
  fi
  fail "새 앱을 복사하지 못해 원래 앱을 되돌렸다"
fi
rm -rf "$old"
say "업데이트 완료: $app"
open "$app" || say "새 앱을 열지 못했다(직접 열어 주세요)"
exit 0
