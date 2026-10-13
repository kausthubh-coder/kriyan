#!/usr/bin/env bash
# Small adb helpers for driving the emulator: shot <name>, tap x y, text "...", key CODE, ui (visible labels).
export MSYS_NO_PATHCONV=1
ADB="${ANDROID_HOME:-C:/Users/kaust/scoop/apps/android-clt/current}/platform-tools/adb.exe"
ART="$(dirname "$0")/../../../.artifacts/app"
case "$1" in
  shot) "$ADB" exec-out screencap -p > "$ART/$2.png" ;;
  tap) "$ADB" shell input tap "$2" "$3" ;;
  text) "$ADB" shell "input text '$2'" ;;
  key) "$ADB" shell input keyevent "$2" ;;
  swipe) "$ADB" shell input swipe "$2" "$3" "$4" "$5" "${6:-300}" ;;
  ui) "$ADB" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; "$ADB" shell cat /sdcard/ui.xml | sed 's/></>\n</g' | grep -o 'content-desc="[^"]*"[^>]*bounds="[^"]*"\|text="[^"]*"[^>]*bounds="[^"]*"' | grep -v '^text=""\|^content-desc=""' | sed -E 's/" .*bounds="/" @ /' ;;
  *) "$ADB" "$@" ;;
esac
