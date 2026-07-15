#!/usr/bin/env bash

set -euo pipefail

desktop_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tauri_dir="$desktop_dir/src-tauri"
bundle_dir="$tauri_dir/target/release/bundle"
app_path="$bundle_dir/macos/Kriyan.app"
dmg_dir="$bundle_dir/dmg"
version="$(bun -e "const config = await Bun.file('$tauri_dir/tauri.conf.json').json(); console.log(config.version)")"

case "$(uname -m)" in
  arm64) artifact_arch="aarch64" ;;
  x86_64) artifact_arch="x64" ;;
  *) artifact_arch="$(uname -m)" ;;
esac

dmg_path="$dmg_dir/Kriyan_${version}_${artifact_arch}.dmg"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/kriyan-dmg.XXXXXX")"
trap 'rm -rf "$staging_dir"' EXIT

bun run --cwd "$desktop_dir" tauri build --bundles app

mkdir -p "$dmg_dir"
/usr/bin/codesign --force --deep --sign - "$app_path"
/usr/bin/ditto "$app_path" "$staging_dir/Kriyan.app"
ln -s /Applications "$staging_dir/Applications"
rm -f "$dmg_path"
/usr/bin/hdiutil create \
  -volname Kriyan \
  -srcfolder "$staging_dir" \
  -ov \
  -format UDZO \
  "$dmg_path"

printf 'Created %s\n' "$app_path"
printf 'Created %s\n' "$dmg_path"
