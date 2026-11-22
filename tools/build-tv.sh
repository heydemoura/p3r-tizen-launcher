#!/bin/bash
# Assemble the TV package and sign it using the named Samsung certificate profile.
# tools/build-tv.sh [signing-profile] → build/MainMenu.wgt
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f tools/local.env ] && . tools/local.env
PROFILE="${1:-${TIZEN_PROFILE:-}}"
if [ -z "$PROFILE" ] || [ "$#" -gt 1 ]; then
  echo "Usage: tools/build-tv.sh <signing-profile> (or set TIZEN_PROFILE)" >&2
  exit 2
fi
command -v tizen >/dev/null || { echo "the Tizen command-line tools are not on PATH (install Tizen Studio, then add its tools/ide/bin folder to PATH or to tools/local.env)"; exit 1; }

mkdir -p build
# The SDK edits dist/ while signing. The temporary output directory also guards it against concurrent builds.
stage="$PWD/build/.packaging"
if ! mkdir -m 700 "$stage" 2>/dev/null; then
  echo "Could not reserve build/.packaging. If it remains after an interrupted build, remove it once no build is running." >&2
  exit 1
fi
trap 'rm -rf "$stage"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
dist_dir="$PWD/dist"

assemble() {
  rm -rf "$dist_dir"
  mkdir -p dist/assets/menu-sfx dist/fonts
  cp index.html app.js LICENSE NOTICE dist/
  cp assets/home-motion.js assets/hero.png assets/home-scene.webp assets/quest-scene.webp assets/quest-idle.webp dist/assets/
  cp -R assets/home-frames dist/assets/
  cp assets/menu-sfx/{focus,confirm,back}.wav dist/assets/menu-sfx/
  for f in $(grep -o 'fonts/[A-Za-z0-9_.-]*' index.html | sort -u); do
    test -f "$f" || { echo "index.html names $f, which is not in the fonts folder"; exit 1; }
    cp "$f" dist/fonts/
  done
  cp tv/config.xml tv/icon.png dist/
  cp tv/FONTS.txt dist/fonts/LICENSES.txt
}

# The SDK may return success for an unsigned package. Publish only a checked widget.
sign() {
  local output_dir="$1"
  local widget="$output_dir/Main Menu.wgt"
  mkdir "$output_dir" || return 2
  # Use the SDK's saved credentials. Keep signing output and prompts out of build logs.
  if ! (cd "$output_dir" && tizen package -t wgt -s "$PROFILE" -o "$output_dir" -- "$dist_dir") </dev/null >/dev/null 2>&1; then
    echo "The Tizen SDK could not package the app using the selected signing profile." >&2
    return 1
  fi
  python3 tools/widget.py check "$widget" && return 0
  # An otherwise readable unsigned archive is the SDK's other way of reporting signing failure.
  if unzip -tqq "$widget" >/dev/null 2>&1 &&
     { ! unzip -p "$widget" author-signature.xml >/dev/null 2>&1 || ! unzip -p "$widget" signature1.xml >/dev/null 2>&1; }; then
    return 1
  fi
  return 2
}

assemble
output_dir="$stage/first"
sign_result=0
sign "$output_dir" || sign_result=$?
if [ "$sign_result" -ne 0 ]; then
  # Headless installations can explicitly supply stored passwords when SDK access has expired.
  [ "$sign_result" -eq 1 ] && [ -n "${PROFILE_PASSWORDS:-}" ] || exit 1
  passwords=("$PROFILE_PASSWORDS/$PROFILE-author.pass")
  if [ -f "$PROFILE_PASSWORDS/$PROFILE-dist.pass" ]; then
    passwords+=("$PROFILE_PASSWORDS/$PROFILE-dist.pass")
  fi
  if ! tools/headless/set-profile-passwords.py "$PROFILE" "${passwords[@]}" </dev/null >/dev/null 2>&1; then
    echo "Could not restore password access for the selected headless signing profile." >&2
    exit 1
  fi
  assemble
  output_dir="$stage/retry"
  sign "$output_dir"
fi
mv -f "$output_dir/Main Menu.wgt" build/MainMenu.wgt
ls -l build/MainMenu.wgt
