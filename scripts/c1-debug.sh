#!/bin/bash
# 임시: C1(끄는 중 다시 열기) 진단
APP="$PWD/release/mac-arm64/Agent Browser.app/Contents/MacOS/Agent Browser"
P="$(mktemp -d /tmp/ab-c1.XXXX)"
start() { env -i HOME="$HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin AGENT_BROWSER_PROFILE="$P" "$APP"; echo "starter exit $? at $(date +%T.%N | cut -c1-12)"; }
snap() { echo "--- $(date +%T.%N | cut -c1-12) $1"; ps -axww -o pid=,ppid=,stat=,command= | grep -F "Agent Browser" | grep -v grep | grep -v -- '--type=' | cut -c1-60; echo "  -E cli.js 전체: $(ps -axwwE -o pid=,command= | grep -F dist/launcher/cli.js | grep -v grep | awk '{print $1}' | tr '\n' ' ') / 프로필 맞음: $(ps -axwwE -o pid=,command= | grep -F dist/launcher/cli.js | grep -v grep | grep -c "AGENT_BROWSER_PROFILE=$P")"; }
sw_vers
start; sleep 8; snap "첫 실행 뒤"
echo "ps -E 런처 줄:"; ps -axwwE -o pid=,command= | grep -F "dist/launcher/cli.js" | grep -v grep | grep -c "AGENT_BROWSER_PROFILE=$P"
L=$(ps -axwwE -o pid=,command= | grep -F "dist/launcher/cli.js" | grep -v grep | grep "AGENT_BROWSER_PROFILE=$P" | awk '{print $1}' | head -1)
echo "launcher=$L"
kill -TERM "$L"; start
for i in $(seq 1 12); do snap "kill 뒤 $i"; sleep 1; done
for i in 1 2 3; do t0=$(date +%s); swift tests/dist/windows.swift | tr "\n" " "; echo " swift 걸린 초: $(( $(date +%s) - t0 ))"; done
echo "=== launcher.log"; cat "$P"/launcher.log* 2>/dev/null | tail -80
ls -la "$P"
