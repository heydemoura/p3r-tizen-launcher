#!/bin/bash
# Talk to the TV over its developer connection (sdb). The TV must be switched ON and in Developer Mode.
#   TV=<the TV's IP address> tools/tv.sh info | connect | duid | apps | install | run | stop | debug | uninstall
# (TV can also be set once in tools/local.env.)
#   info       what the TV says about itself and about this app (no developer connection needed)
#   connect    open the developer connection
#   duid       the TV's device ID, which a Samsung distributor certificate has to name
#   apps       names and IDs of installed TV applications, including system services
#   install    put build/MainMenu.wgt on the TV          run / stop    start or stop the app
#   debug      restart the app with its web inspector on and print the address to use as CDP=... for tools/tv-*.mjs and lab/
#              (the app is stopped first, by package name: the TV's debug start hangs when the app is already running)
#   uninstall  remove the app from the TV
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f tools/local.env ] && . tools/local.env
TV="${TV:?set TV to the IP address of the TV (TV=192.168.x.x tools/tv.sh …, or in tools/local.env)}"
DEV=$TV:26101
ids=$(python3 tools/widget.py identity) || exit 1
read -r APP PKG <<< "$ids"
need() { command -v "$1" >/dev/null || { echo "$1 is not on PATH (it comes with Tizen Studio: add its tools/ and tools/ide/bin folders to PATH or to tools/local.env)"; exit 1; }; }
up() {
  need sdb
  if connected; then return 0; fi
  sdb connect "$TV" >/dev/null 2>&1
  sleep 1
  connected || { echo "the TV does not answer (is it switched on, in Developer Mode, with this computer's address as its Host PC IP?)"; exit 1; }
}
connected() {
  sdb devices | awk -v serial="$DEV" '$1 == serial && $2 == "device" {found=1} END {exit !found}'
}
case "${1:-info}" in
  info)      curl -s -m 5 "http://$TV:8001/api/v2/" | python3 -c "import sys,json; d=json.load(sys.stdin)['device']; print({k:d.get(k) for k in ['modelName','PowerState','developerMode','developerIP']})"; curl -s -m 5 "http://$TV:8001/api/v2/applications/$APP"; echo ;;
  connect)   up; sdb devices | awk -v serial="$DEV" '$1 == serial && $2 == "device"' ;;
  duid)      up; sdb -s "$DEV" shell 0 getduid ;;
  apps)      up; sdb -s "$DEV" shell 0 applist ;;
  install)
    python3 tools/widget.py check build/MainMenu.wgt || exit 1
    up
    need tizen
    output=$(tizen install -n MainMenu.wgt -s "$DEV" -- "$PWD/build" 2>&1)
    status=$?
    printf '%s\n' "$output"
    if (( status != 0 )); then exit "$status"; fi
    output=${output//$'\r'/}
    if ! awk -v id="$APP" '
      /^app_id\[.*\] install completed$/ || /^Installed the package: Id\(.*\)$/ {
        if ($0 == "app_id[" id "] install completed" || $0 == "Installed the package: Id(" id ")") done=1
        else failed=1
      }
      $0 == "Tizen application is successfully installed." {done=1}
      tolower($0) ~ /install failed|failed to install|not successfully installed|completed with errors/ {failed=1}
      END {exit (!done || failed)}
    ' <<< "$output"; then
      echo "The SDK did not confirm installation." >&2
      exit 1
    fi
    if ! sdb -s "$DEV" shell 0 applist | tr -d "'\r" |
         awk -v id="$APP" '$NF == id {found=1} END {exit !found}'; then
      echo "The TV did not list $APP after installation." >&2
      exit 1
    fi
    echo "Installed $APP."
    ;;
  run)
    up
    output=$(timeout 30 sdb -s "$DEV" shell 0 execute "$APP" 2>&1)
    status=$?
    printf '%s\n' "$output"
    if (( status != 0 )); then exit "$status"; fi
    output=${output//$'\r'/}
    if grep -Eiq 'failed|not successfully launched' <<< "$output" ||
       ! { grep -Eq '^\.\.\. successfully launched pid = [1-9][0-9]* with debug 0$' <<< "$output" ||
           grep -Fxq "App $APP is successfully launched." <<< "$output"; }; then
      echo "The TV did not confirm launch of $APP." >&2
      exit 1
    fi
    ;;
  stop)      up; timeout 20 sdb -s "$DEV" shell 0 kill "$PKG" | head -1 ;;
  debug)     up; timeout 20 sdb -s "$DEV" shell 0 kill "$PKG" >/dev/null 2>&1; sleep 1
             out=$(timeout 30 sdb -s "$DEV" shell 0 debug "$APP" 2>&1); port=$(printf '%s' "$out" | grep -o 'port: [0-9]*' | grep -o '[0-9]*')
             [ -n "$port" ] && echo "http://$TV:$port" || { echo "no inspector port: $out"; exit 1; } ;;
  uninstall) up; need tizen; tizen uninstall -p "$APP" -s "$DEV" ;;
  *) echo "unknown command: $1"; exit 2 ;;
esac
rc=$?
rm -f '${sys:installerLogFileName}'      # an empty file the Tizen tools leave behind wherever they run
exit $rc
