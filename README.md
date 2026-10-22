# Rastin for Claude Code (VS Code)

Persian chat layout for the Claude Code VS Code extension: the IranYekanX face,
right-to-left prose, and automatic per-message direction. Code blocks, tool
calls, and command rows stay left-to-right.

Like the [Rastin DSH bundle](https://github.com/Amir83Nasr/dsh-rastin), this is a
layout layer — it does not touch Claude's behavior, auth, or files outside
Claude Code's own webview assets.

## What it does

- **IranYekanX (Regular + Bold)** applied to chat prose, the composer, and UI
  copy. Code keeps the editor's monospace font.
- **Auto direction** — each markdown block follows its leading word run:
  - Persian/Hebrew first → RTL.
  - A lone English term (`Merge کن`) → stays RTL.
  - Two or more English words at the start (`Here is the fix`) → locks LTR.
- **LTR islands** — `pre`/`code`, code blocks, tool calls/results, thinking
  blocks, attachment rows, and icon rows keep LTR geometry and left alignment.
- **RTL lists, quotes, tables** — list padding and blockquote borders flip with
  the block direction.
- **Composer** — RTL text entry with bidi-aware (`unicode-bidi: plaintext`)
  rendering.
- **Modes** (status bar or Command Palette → `Rastin: Menu`): `auto`, `rtl`,
  `ltr`, plus disable/repair.

## How it works

VS Code has no API to style another extension's webview. Rastin therefore
patches Claude Code's installed webview bundle in place, the same mechanism
used by other RTL extensions:

- appends its CSS to `webview/index.css`;
- appends the direction engine to `webview/index.js` (auto mode only);
- copies its two woff2 faces into `webview/fonts/` (the webview CSP allows fonts
  only from its own extension source, so a `data:` font would be blocked).

Every write is atomic, guarded against shrinking a bundle, and delimited by
`/* rastin:start */` … `/* rastin:end */` markers, so re-applying replaces the
previous block instead of stacking. Patches from
`yechielby.claude-code-rtl` are detected and stripped during migration.

Claude Code updates replace these files, wiping the patch. Rastin re-applies on
every VS Code startup; for an update during a session, run
`Rastin: Repair after Claude Code update`. Reload the window after changes.

## Install

```sh
npm test
npm run package
code --install-extension rastin-claude-code-0.1.0.vsix
```

Then reload the window. Disable any other Claude Code RTL extension first.

## Settings

| Setting          | Values                  | Default |
| ---------------- | ----------------------- | ------- |
| `rastin.enabled` | `true` / `false`        | `true`  |
| `rastin.mode`    | `auto` / `rtl` / `ltr`  | `auto`  |

## Scope

- Claude Code sidebar/editor chat (`anthropic.claude-code-*`). VS Code, Cursor,
  Antigravity, and Kiro extension directories are scanned.
- Plan Preview (the separate editor tab) is not patched yet.
- The patch lives inside Claude Code's extension directory; uninstall or update
  of that extension removes it. `Rastin: Disable` restores the files.
