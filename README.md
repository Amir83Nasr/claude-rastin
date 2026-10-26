<p align="left"><img src="assets/logo.png" width="120" alt="Rastin"></p>

# Rastin for Claude Code and Codex (VS Code)

Persian chat layout for the Claude Code (`anthropic.claude-code`) and Codex
(`openai.chatgpt`) VS Code extensions: the IranYekanX face, right-to-left
prose, and automatic per-paragraph direction. Code blocks, tool calls, and
command rows stay left-to-right. The same direction rules also apply to VS
Code's built-in Markdown preview and to the Markdown editor of the Office
Viewer extension.

Like the [Rastin DSH bundle](https://github.com/Amir83Nasr/dsh-rastin), this is a
layout layer — it does not touch Claude's behavior, auth, or files outside the
extensions it patches. Direction is automatic by default;
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
  A todo card whose items all read RTL is the exception: its "Update Todos"
  header moves right with the list, and any Latin item keeps the header LTR.
- **RTL user bubbles** sit on the right when their own text is RTL.
- **Composer** — RTL text entry with bidi-aware (`unicode-bidi: plaintext`)
  rendering.
- **Codex chat** — the same face, per-paragraph direction, arrow mirroring, and
  forced direction in Codex's assistant replies, user messages, and composer.
  Code blocks and writing blocks stay LTR islands. Controlled by
  `rastin.codex`; the Codex page is patched in place and restored on disable.
- **Markdown preview** — the same per-block direction in VS Code's built-in
  Markdown preview: every paragraph, heading, list item, quote, and table cell
  is read on its own, code stays LTR, and arrows mirror in RTL paragraphs. The
  preview keeps VS Code's own font, size, and theme.
- **Office Viewer editor** — the same per-block direction in the Markdown
  editor of the Office Viewer extension (`cweijan.vscode-office`), in both
  WYSIWYG and IR modes: every paragraph, heading, list item, quote, and table
  cell is read on its own, code and math stay LTR, and quote bars, list
  markers, and arrows follow the block. The editor keeps its own font, size,
  and theme.
- **Font controls** — weight, family, font file, size, code font, line height
  and an optional Claude palette (Claude Code chat) are VS Code settings.

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
every VS Code startup and whenever an extension is installed, updated, or
removed, so `Rastin: Repair after Claude Code or Codex update` is only needed
when that does not happen. The chat webview reloads itself when the patch
changes.

Rastin's selectors depend on Claude Code's class names. Before patching, it
checks the bundle for the core names (`root_`, `userMessage_`, `messageInput_`,
and so on). If one is missing, RTL may not apply to that build, and Rastin
warns once for it and logs the names in the output channel.

## Markdown preview

VS Code's built-in preview needs no patching: it loads the styles and scripts
an extension declares. Rastin contributes:

- `markdown/preview.css` through `markdown.previewStyles`: alignment follows
  each block, code stays LTR, and quote borders and list markers sit on the
  block's own side;
- `webview/direction.js` and `markdown/preview.js` through
  `markdown.previewScripts`: the same engine the chat uses, run over every
  prose block (`.markdown-body`) and re-run whenever the preview updates.

A preview script cannot read VS Code settings, and contributed paths are
static. Rastin therefore writes the two values the preview needs
(`rastin.markdownPreview`, and `rastin.direction`) to `markdown/config.js` when
it activates. That file is generated, git-ignored, and not shipped in the
`.vsix`; without it the preview still applies automatic direction. Code stays
LTR in every mode.

`rastin.direction: rtl | ltr` pins every block and the preview wrapper.
`rastin.markdownPreview: false` (or the `rastin.enabled` master switch) leaves
the preview alone. A change applies the next time the preview loads.

## Office Viewer (Markdown Editor)

The Markdown editor in the Office Viewer extension is served by that extension,
not by VS Code, so it gets none of the preview contributions. Rastin patches
its page in place, the same way it patches Claude Code:

- copies `markdown/office.css`, `webview/direction.js`, and
  `markdown/office.js` into the extension's `resource/markdown/` directory;
- writes `resource/markdown/rastin.config.js` with the two values the page
  cannot read for itself (`rastin.officeViewer`, `rastin.direction`);
- inserts a marked block before `</html>` in `resource/markdown/index.html`.

The page loads those files each time an editor opens, so both edit modes —
WYSIWYG and IR — run the same engine as the chat and the preview. Every block
is read on its own, code and math are LTR islands, list padding and quote
borders move to the block's side, and arrows mirror in RTL prose. Vditor
rewrites the DOM while you type, so the installer re-orients after edits; a
block being edited keeps its arrows unwrapped until the caret leaves it.

`rastin.direction: rtl | ltr` pins every block. `rastin.officeViewer: false`
(or the `rastin.enabled` master switch) removes the patch and its generated
files and restores the page. The editor reads the setting when it opens, so
reopen the file after a change. Updating the Office Viewer replaces its page;
Rastin re-patches it on the next startup or extension change.

## Codex (VS Code extension)

The Codex extension is a Vite-built React app served from its own webview. It
cannot read VS Code settings either, so Rastin patches its page rather than
its bundles:

- copies `webview/direction.js` and `webview/codex.js` into the extension's
  `webview/` directory, next to the app's hashed assets;
- generates `webview/rastin.codex.css` from the font settings, with the faces
  copied to `webview/rastin-fonts/`;
- writes `webview/rastin.codex.config.js` with the values the page cannot read
  for itself (`rastin.codex`, `rastin.direction`);
- inserts a marked block before `</body>` in `webview/index.html` that links
  the stylesheet and loads the config, the shared engine, and the installer.

The app's own bundles are never edited, so a Codex update only needs the page
re-patched. Assistant replies (`data-markdown-text-style`) and user messages
(`data-markdown-text-tone`) are oriented paragraph by paragraph; the composer
already carries `dir="auto"` from ProseMirror, so only a forced direction
reaches it, through CSS. Rastin's styles stay inert until an installer pass
marks `<html>`, so the stock chat is untouched before the first message.

`rastin.direction: rtl | ltr` pins the messages and the composer.
`rastin.codex: false` (or the `rastin.enabled` master switch) removes the patch
and its generated files and restores the page. Updating Codex replaces its
page; Rastin re-patches it on the next startup or extension change.

## Install

Grab the `.vsix` from the [latest release](../../releases/latest) and install it.
Rastin is distributed through GitHub releases only; it is not published to the
VS Code Marketplace.

```sh
code --install-extension claude-rastin-X.Y.Z.vsix
```

To build it locally:

```sh
pnpm install
pnpm package
code --install-extension claude-rastin-X.Y.Z.vsix
```

Then reload the window once so VS Code picks up the new build. Disable any
other Claude Code RTL extension first.

## Contributing

`pnpm install` sets `core.hooksPath` to `.githooks/`: commits run Prettier on
the staged files through `lint-staged`, which leaves unstaged hunks out of the
commit. Pushes run the same `format:check` + `test` gates as CI. `pnpm verify`
runs both by hand.

Releases are tags: bump `package.json`, move the `Unreleased` notes in
`CHANGELOG.md` under the new version, then push `vX.Y.Z`. The `Release` workflow
runs the same checks and attaches the built `.vsix` to a GitHub release; there
is no Marketplace publish, so the `.vsix` from the release is the download.

## Settings

| Setting                  | Values                                               | Default             |
| ------------------------ | ---------------------------------------------------- | ------------------- |
| `rastin.enabled`         | `true` / `false`                                     | `true`              |
| `rastin.direction`       | `auto` / `rtl` / `ltr`                               | `auto`              |
| `rastin.markdownPreview` | `true` / `false`                                     | `true`              |
| `rastin.officeViewer`    | `true` / `false`                                     | `true`              |
| `rastin.codex`           | `true` / `false`                                     | `true`              |
| `rastin.fontWeight`      | `200` – `700`                                        | `300`               |
| `rastin.fontFamily`      | installed family name                                | `IRANYekanX`        |
| `rastin.fontFile`        | absolute `.woff2`/`.woff`/`.ttf`/`.otf` path         | bundled IranYekanX  |
| `rastin.fontSize`        | `0` (host size) or `8` – `32` px                     | `13`                |
| `rastin.lineHeight`      | `1.2` – `2.4`, 0.1 steps                             | `2`                 |
| `rastin.codeFontFamily`  | installed family name                                | VS Code editor font |
| `rastin.theme`           | `vscode` / `claude` / `claude-light` / `claude-dark` | `vscode`            |

`rastin.fontFile` wins over `rastin.fontFamily`: the file is copied into each
patched chat's webview next to the bundled faces and used as `RastinUser`,
because the webview CSP blocks `data:` fonts. Its file name carries a content
hash, so swapping the font can never be served from the webview cache, and the
previous copy is removed on the next patch. A family that is not installed
falls back to IranYekanX.

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

Settings apply on change: Rastin re-patches the webviews and reloads the chat
webviews in place, so no window reload is needed. The Markdown preview reads
its settings when it loads, so a direction change reaches it on the next
preview load. The Office Viewer editor also reads the setting when it opens,
so reopen the file after a change.

The status bar item opens the Rastin menu (settings, repair, enable/disable);
its tooltip names the current direction mode (automatic or forced).

## Scope

- Claude Code sidebar/editor chat (`anthropic.claude-code-*`). VS Code, Cursor,
  Antigravity, and Kiro extension directories are scanned.
- The Codex chat (`openai.chatgpt-*`), in the same directories. Only the page
  and Rastin's own files are touched; Codex's hashed bundles stay as shipped.
- VS Code's built-in Markdown preview, through its contributed styles and
  scripts. Direction only: the preview keeps its own font, size, and theme.
- The Markdown editor of Office Viewer (`cweijan.vscode-office`), in WYSIWYG
  and IR modes. Direction only: the editor keeps its own font, size, and theme.
- Plan Preview (the separate editor tab) is not patched yet.
- The patches live inside those extensions' directories; uninstall or update of
  an extension removes its patch. `Rastin: Disable` restores the files.
