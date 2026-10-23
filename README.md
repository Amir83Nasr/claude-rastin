<p align="left"><img src="assets/logo.png" width="120" alt="Rastin"></p>

# Rastin for Claude Code (VS Code)

Persian chat layout for the Claude Code VS Code extension: the IranYekanX face,
right-to-left prose, and automatic per-paragraph direction. Code blocks, tool
calls, and command rows stay left-to-right.

Like the [Rastin DSH bundle](https://github.com/Amir83Nasr/dsh-rastin), this is a
layout layer — it does not touch Claude's behavior, auth, or files outside
Claude Code's own webview assets. Direction is automatic by default;
`rastin.direction` can pin the whole chat to RTL or LTR when you would rather
not have it decided per paragraph.

## What it does

- **IranYekanX (UltraLight, Light, Regular, Bold)** applied to chat prose, the
  composer, and UI copy. Code keeps the editor's monospace font.
- **Per-paragraph direction** — every `p`, heading, list, quote, table, and
  cell gets its own verdict from its first prose word, the way DSH reads a
  paragraph:
  - Persian/Hebrew prose → RTL; English prose → LTR.
  - A lone English term (`Merge کن`) → stays RTL.
  - Two English prose words at the start lock LTR (`Hello world سلام`).
    Persian anywhere before that run keeps the paragraph RTL, even when
    English commands follow (`skipped: تست ... pnpm build`).
  - File names, paths, camelCase, and ALL_CAPS constants are neutral, so
    `use-online-status.ts — هوک ...` reads RTL even when Latin tokens start
    the line.
  - A leading label (`skipped:`, `**Note:**`, `Step 1:`, `foo.ts —`) does not
    vote and never locks: the words after its separator decide, and a Persian
    word anywhere later keeps the paragraph RTL (`Note: run the tests لطفا`).
  - A stale LTR lock is dropped when a reused node now starts in Persian.
  - `rastin.direction: rtl | ltr` skips the detection entirely and pins every
    message, question/permission panel, todo line, and the composer; code
    blocks, tool rows, and command rows stay LTR either way.
  - List markers follow the list direction; a mixed-script item keeps its
    marker inside so it does not stay on the wrong side.
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
- copies its four woff2 faces into `webview/fonts/` (the webview CSP allows
  fonts only from its own extension source, so a `data:` font would be
  blocked).

Every write is atomic, guarded against shrinking a bundle, and delimited by
`/* rastin:start */` … `/* rastin:end */` markers, so re-applying replaces the
previous block instead of stacking. Patches from
`yechielby.claude-code-rtl` are detected and stripped during migration.

Claude Code updates replace these files, wiping the patch. Rastin re-applies on
every VS Code startup; for an update during a session, run
`Rastin: Repair after Claude Code update`. The chat webview reloads itself
when the patch changes.

## Install

Grab the `.vsix` from the [latest release](../../releases/latest), then:

```sh
code --install-extension claude-rastin-X.Y.Z.vsix
```

To build it locally:

```sh
pnpm install
pnpm package
code --install-extension claude-rastin-0.2.9.vsix
```

Then reload the window once so VS Code picks up the new build. Disable any
other Claude Code RTL extension first.

## Contributing

`pnpm install` sets `core.hooksPath` to `.githooks/`: commits run Prettier on
the staged files, and pushes run the same `format:check` + `test` gates as CI.
`pnpm verify` runs both by hand.

## Settings

| Setting                 | Values                                               | Default             |
| ----------------------- | ---------------------------------------------------- | ------------------- |
| `rastin.enabled`        | `true` / `false`                                     | `true`              |
| `rastin.direction`      | `auto` / `rtl` / `ltr`                               | `auto`              |
| `rastin.fontWeight`     | `200` – `700`                                        | `400`               |
| `rastin.fontFamily`     | installed family name                                | `IRANYekanX`        |
| `rastin.fontFile`       | absolute `.woff2`/`.woff`/`.ttf`/`.otf` path         | bundled IranYekanX  |
| `rastin.fontSize`       | `0` (host size) or `8` – `32` px                     | `13`                |
| `rastin.lineHeight`     | `1.2` – `2.4`, 0.1 steps                             | `2`                 |
| `rastin.codeFontFamily` | installed family name                                | VS Code editor font |
| `rastin.theme`          | `vscode` / `claude` / `claude-light` / `claude-dark` | `vscode`            |

`rastin.fontFile` wins over `rastin.fontFamily`: the file is copied into the
webview next to the bundled faces and used as `RastinUser`, because the webview
CSP blocks `data:` fonts. Its file name carries a content hash, so swapping the
font can never be served from the webview cache, and the previous copy is
removed on the next patch. A family that is not installed falls back to
IranYekanX.

`rastin.lineHeight` is a list, not a free number: VS Code's number field steps
by 1, so the 0.1 steps only exist as list options (arrow keys move one option,
i.e. 0.1). `rastin.fontSize` is an integer field, stepped by 1 px.

### Themes

`rastin.theme: vscode` (default) leaves the host colors alone, so the chat
follows the current VS Code theme. The `claude*` values repaint the chat with
Claude's own warm palette, mapped onto the semantic `--app-*` variables the
webview uses (surfaces, borders, inputs, menus, lists, badges, code, links,
status colors), including the aliases the host resolves at `<html>`:

| Value          | Palette                                             |
| -------------- | --------------------------------------------------- |
| `claude`       | ivory in a light VS Code theme, slate in a dark one |
| `claude-light` | ivory, even in a dark VS Code theme                 |
| `claude-dark`  | slate, even in a light VS Code theme                |

High-contrast themes are never repainted: every palette rule is scoped with
`:not([class*="high-contrast"])`, so accessibility colors stay the host's.

Settings apply on change: Rastin re-patches the webview and reloads the chat
webview in place, so no window reload is needed.

The status bar item opens the Rastin menu (settings, repair, enable/disable);
its tooltip names the current direction mode (automatic or forced).

## Scope

- Claude Code sidebar/editor chat (`anthropic.claude-code-*`). VS Code, Cursor,
  Antigravity, and Kiro extension directories are scanned.
- Plan Preview (the separate editor tab) is not patched yet.
- The patch lives inside Claude Code's extension directory; uninstall or update
  of that extension removes it. `Rastin: Disable` restores the files.
