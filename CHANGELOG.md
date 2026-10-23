# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The GitHub Release for a `vX.Y.Z` tag uses the matching `## [X.Y.Z]` section of
this file as its notes (`release.yml`), so record user-facing changes there
before tagging.

## [Unreleased]

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
