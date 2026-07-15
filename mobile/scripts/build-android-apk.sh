#!/usr/bin/env bash

set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find_android_sdk() {
  local candidate
  for candidate in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk"; do
    if [[ -n "$candidate" && -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

if ! command -v bun >/dev/null 2>&1; then
  echo "error: Bun is required (https://bun.sh)." >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "error: Java 17 is required." >&2
  exit 1
fi

if ! SDK_DIR="$(find_android_sdk)"; then
  echo "error: Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT." >&2
  exit 1
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export NODE_ENV=production

cd "$MOBILE_DIR"

echo "Generating the Expo Android project..."
bunx expo prebuild --platform android --clean --no-install

escaped_sdk_dir="${SDK_DIR// /\\ }"
printf 'sdk.dir=%s\n' "$escaped_sdk_dir" > android/local.properties

echo "Building a standalone 64-bit release APK..."
(
  cd android
  ./gradlew \
    --no-daemon \
    assembleRelease \
    -PreactNativeArchitectures=arm64-v8a,x86_64
)

version="$(bun -e "console.log(require('./app.json').expo.version)")"
output_dir="$MOBILE_DIR/build"
output_path="$output_dir/kriyan-android-v${version}.apk"
source_path="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"

mkdir -p "$output_dir"
cp "$source_path" "$output_path"

echo "APK: $output_path"
shasum -a 256 "$output_path"
