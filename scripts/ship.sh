#!/usr/bin/env bash
# Package the current build, install it into VS Code, and reload the window so
# the new version is live. Needs the `code` CLI on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm package

vsix=$(ls -1 claude-rastin-*.vsix | head -1)
code --install-extension "$vsix" --force

if [[ ${SKIP_RELOAD:-0} == 1 ]]; then
  echo "installed $vsix — run Developer: Reload Window to finish"
  exit 0
fi

# macOS has no CLI reload; drive the command palette. Needs Accessibility
# permission for the calling terminal. Any failure is not an error: the
# install already succeeded, a reload is only what activates it.
osascript <<'APPLESCRIPT' || echo "reload skipped — run Developer: Reload Window"
tell application "Visual Studio Code" to activate
delay 0.5
tell application "System Events"
  keystroke "p" using {command down, shift down}
  delay 0.8
  keystroke "Developer: Reload Window"
  delay 0.8
  key code 36
end tell
APPLESCRIPT
echo "installed $vsix"
