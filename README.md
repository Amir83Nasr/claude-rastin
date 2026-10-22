# Rastin for Claude Code (VS Code)

Persian chat layout for the Claude Code VS Code extension: the IranYekanX face,
right-to-left prose, and automatic per-paragraph direction. Code blocks, tool
calls, and command rows stay left-to-right.

Like the [Rastin DSH bundle](https://github.com/Amir83Nasr/dsh-rastin), this is a
layout layer — it does not touch Claude's behavior, auth, or files outside
Claude Code's own webview assets. Direction is always automatic; there is no
RTL/LTR switch to manage.

## What it does

- **IranYekanX (Regular + Bold)** applied to chat prose, the composer, and UI
  copy. Code keeps the editor's monospace font.
- **Per-paragraph direction** — every `p`, heading, list, quote, table, and
  cell gets its own verdict from its leading word run:
  - Persian/Hebrew first → RTL.
  - A lone English term (`Merge کن`) → stays RTL.
  - Two or more English words at the start (`Here is the fix`) → locks LTR.
  - A leading label (`skipped:`, `Note:`, `Step 1:`) does not vote. The word
    after the colon decides, so `skipped: 2 files سلام` still reads RTL.
- **Arrow mirroring** — `← → ⇐ ⇒` in an RTL paragraph point the RTL way; copy
  text stays byte-identical. Arrows in an LTR paragraph stay untouched.
- **LTR islands** — `pre`/`code`, code blocks, tool calls/results, thinking
  blocks, attachment rows, and icon rows keep LTR geometry and left alignment.
- **RTL user bubbles** sit on the right when their own text is RTL.
- **Composer** — RTL text entry with bidi-aware (`unicode-bidi: plaintext`)
  rendering.
- **Font controls** — weight, family, font file, size, code font, line height
  and an optional Claude palette are VS Code settings.

## How it works

VS Code has no API to style another extension's webview. Rastin therefore
patches Claude Code's installed webview bundle in place, the same mechanism
used by other RTL extensions:

- appends its CSS to `webview/index.css`;
- appends the direction engine to `webview/index.js`;
- copies its two woff2 faces into `webview/fonts/` (the webview CSP allows fonts
  only from its own extension source, so a `data:` font would be blocked).

Every write is atomic, guarded against shrinking a bundle, and delimited by
`/* rastin:start */` … `/* rastin:end */` markers, so re-applying replaces the
previous block instead of stacking. Patches from
`yechielby.claude-code-rtl` are detected and stripped during migration.

Claude Code updates replace these files, wiping the patch. Rastin re-applies on
every VS Code startup; for an update during a session, run
`Rastin: Repair after Claude Code update`. The chat webview reloads itself
when the patch changes.

## Install

```sh
npm test
npm run package
code --install-extension rastin-claude-code-0.2.0.vsix
```

Then reload the window once so VS Code picks up the new build. Disable any
other Claude Code RTL extension first.

## Settings

| Setting                 | Values                        | Default  |
| ----------------------- | ----------------------------- | -------- |
| `rastin.enabled`        | `true` / `false`              | `true`   |
| `rastin.fontWeight`     | `400` – `700`                 | `400`    |
| `rastin.fontFamily`     | installed family name         | bundled IranYekanX |
| `rastin.fontFile`       | absolute `.woff2`/`.woff`/`.ttf`/`.otf` path | bundled IranYekanX |
| `rastin.fontSize`       | `0` – `32` px, `0` = host size | `0`     |
| `rastin.lineHeight`     | `1.2` – `2.4`                 | `1.5`    |
| `rastin.codeFontFamily` | installed family name         | VS Code editor font |
| `rastin.theme`          | `vscode` / `claude`           | `vscode` |

`rastin.fontFile` wins over `rastin.fontFamily`: the file is copied into the
webview next to the bundled faces and used as `RastinUser`, because the webview
CSP blocks `data:` fonts. A family that is not installed falls back to
IranYekanX. `rastin.theme: claude` switches the chat to Claude's warm ivory
(light) or slate (dark) palette while following VS Code's light/dark mode.

Settings apply on change: Rastin re-patches the webview and reloads the chat
webview in place, so no window reload is needed.

The status bar item opens the Rastin menu (settings, repair, enable/disable).
It shows no mode because direction is automatic.

## Scope

- Claude Code sidebar/editor chat (`anthropic.claude-code-*`). VS Code, Cursor,
  Antigravity, and Kiro extension directories are scanned.
- Plan Preview (the separate editor tab) is not patched yet.
- The patch lives inside Claude Code's extension directory; uninstall or update
  of that extension removes it. `Rastin: Disable` restores the files.
