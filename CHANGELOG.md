# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The GitHub Release for a `vX.Y.Z` tag uses the matching `## [X.Y.Z]` section of
this file as its notes (`release.yml`), so record user-facing changes there
before tagging.

## [Unreleased]

### Added

- The font and direction rules now apply to the Codex extension's chat
  (`openai.chatgpt`): assistant replies, user messages, and the composer get
  the IranYekanX face and per-block direction, arrows mirror in RTL prose, and
  code and writing blocks stay LTR. The page is patched in place — Codex's
  hashed bundles are untouched — and restored on disable. Controlled by the new
  `rastin.codex` setting (on by default).
- The direction rules now apply to the Markdown editor of the Office Viewer
  extension (`cweijan.vscode-office`), in both WYSIWYG and IR modes. Every
  paragraph, heading, list item, quote, and table cell is read on its own,
  code and math stay LTR, quote bars and list markers follow the block, and
  arrows mirror in RTL prose. The extension's editor page is patched in place
  and restored on disable. Controlled by the new `rastin.officeViewer` setting
  (on by default); reopen an open file after changing it, since the editor
  reads the setting when it opens.

### Changed

- A todo card whose items all read RTL now takes its "Update Todos" header
  with the list: the header moves right instead of sitting across the card
  from its items. A list with any Latin item keeps the LTR tool header.

### Fixed

- Todo items that join a todo list after the chat is already on screen now take
  their own direction. Before, a Persian item added to a live list kept the
  LTR tool-card layout: its checkbox sat on the left and its text aligned left.
  Items present at load were not affected.

## [0.5.0] - 2026-10-26

### Added

- The direction rules now apply to VS Code's built-in Markdown preview: every
  paragraph, heading, list item, quote, and table cell is read on its own,
  code stays LTR, and arrows mirror in RTL paragraphs. Quote borders and list
  markers follow the block's direction, and `rastin.direction: rtl | ltr` pins
  the whole document. Controlled by the new `rastin.markdownPreview` setting
  (on by default); the preview keeps VS Code's font, size, and theme.

### Changed

- Releases are distributed as the `.vsix` attached to the GitHub release; there
  is no VS Code Marketplace publish. Install with
  `code --install-extension claude-rastin-X.Y.Z.vsix`.

## [0.4.2] - 2026-10-25

### Changed

- Claude light/dark palettes now match claude.ai's tokens exactly: ivory
  `#faf9f5` chat surface and `#f5f4ed` sidebar-tone surfaces in light, and
  `#262624` chat surface with `#1f1e1d` and `#141413` steps in dark. Text, the
  `#30302e` dark composer, the `#d97757` accent, and link blues use the same
  values. Previously the dark palette used near-black grays that Claude does
  not use.
- Claude Code updates and extension installs or removals re-run the patch
  automatically, so the manual repair command is rarely needed.
- A Claude Code build that no longer has the core class names Rastin targets
  triggers one warning for that build, instead of RTL failing silently.

### Fixed

- The default font weight is Light (300) everywhere. The README and the code's
  fallback said 400, while the Settings UI already used 300.
- A partly staged file no longer commits its unstaged changes: the pre-commit
  hook now runs through `lint-staged`.

## [0.4.1] - 2026-10-25

### Changed

- Claude light/dark palettes now use the exact design tokens from claude.ai
  (`data-theme=claude`): neutral gray surfaces, ink-alpha borders, blue links,
  and Claude's red/yellow/green status colors, instead of approximated ivory.

### Fixed

- An English paragraph that quotes a Persian term ("the old «منوی اصلی»
  header ...") stays LTR instead of flipping RTL.
- A code span that quotes Persian no longer swallows the rest of the line.
- A Persian heading with a parenthesised Latin word no longer counts as a
  label that carries an English block.
- The question text itself (`questionTextLarge_`) and plan option text are
  now oriented per line like the rest of the panel.
- Question and permission lines honour the direction Rastin detects instead
  of the host's first-strong-character guess.

## [0.4.0] - 2026-10-23

### Changed

- Defaults: `rastin.fontFamily` is `IRANYekanX`, `rastin.fontSize` is `13`,
  and `rastin.lineHeight` is `2`.

### Fixed

- A paragraph is right-aligned when its prose is Persian, even if it opens
  with a short English phrase such as "Site + repo بررسی می‌کنم".
- A multi-word heading ("checked or cleaned: بیشتر از صفر") is read as a
  heading, so the Persian after it decides; a heading in Persian only
  ("**۱. خطای درگاه** — [file](...)") now reads RTL.
- A line that opens with an inline code span is read by the prose around it,
  and a code span that quotes Persian keeps its vote
  (`` `admin.py:864` — `شناسه ایتا` ``).
- A list item whose link is still streaming is no longer pinned left before
  its Persian text arrives.
- Paragraphs keep the direction Rastin detects instead of the host's
  `unicode-bidi: plaintext` first-strong-character guess, so an RTL paragraph
  no longer renders left-aligned.

## [0.3.0] - 2026-10-23

### Added

- `rastin.direction`: `auto` (default, per-paragraph detection), or `rtl` /
  `ltr` to pin the whole chat — messages, question and permission panels,
  todo lines, and the composer — to one direction. Code blocks, tool rows,
  and command rows stay LTR in every mode.

### Fixed

- `rastin.fontSize: 0` (the default) no longer forces an 8px chat size; it
  keeps Claude Code's own size as documented.
- Question preview blocks align to their own direction.

## [0.2.9] - 2026-10-23

### Changed

- The extension is now `amir83nasr.claude-rastin` (was
  `amir83nasr.rastin-claude-code`) and the packaged `.vsix` is
  `claude-rastin-X.Y.Z.vsix`. Uninstall the old id before installing this
  one.

### Fixed

- The `★ Insight` header and its `─` footer stay pinned left instead of
  drifting to the right edge of an RTL reply.
- Question and permission panels (question text, tabs, option labels and
  descriptions, previews, "Other" input, permission prompts) are now
  oriented per line; an RTL option keeps its radio and highlight bar on the
  right.
- A leading label (`skipped:`, `**Note:**`, `Step 1:`, `foo.ts —`) no longer
  locks a block to LTR, so a Persian word later in the paragraph still reads
  RTL.

## [0.2.7] - 2026-10-22

### Added

- IranYekanX (UltraLight, Light, Regular, Bold) for chat prose, composer, and UI
  copy, with code left in the editor's monospace font.
- Per-paragraph direction read from the first prose word: Persian and Hebrew
  prose go RTL, English prose stays LTR, and a lone English term keeps the
  paragraph RTL.
- Leading labels (`skipped:`, `Note:`, `Step 1:`, `foo.ts —`) do not vote;
  technical tokens (file names, paths, camelCase, ALL_CAPS) stay neutral.
- Arrow mirroring in RTL paragraphs, with copy text left byte-identical.
- LTR islands: code, tool calls and results, thinking blocks, attachment and
  icon rows.
- RTL user bubbles and bidi-aware composer entry.
- Settings for weight, family, font file, size, code font, line height, and an
  optional Claude palette, applied without a window reload.
- Atomic in-place patching with `rastin:start` / `rastin:end` markers and
  `Rastin: Repair after Claude Code update`.
- Rastin menu and status bar entry; legacy `yechielby.claude-code-rtl` patches
  are detected and stripped on migration.

### Changed

- Direction is automatic per paragraph; there is no manual RTL/LTR switch.
