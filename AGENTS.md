# AGENTS.md

use PRETTIER.

use PNPM instead of NPM.

## PACKAGING (.vsix)

- Only the current build's `.vsix` may exist in the repo root — delete the previous one whenever a new version is packaged (`pnpm package` already does this via `rm -f ./*.vsix`).
- `*.vsix` is git-ignored; never commit build output.

## RELEASE / PUBLISH (origin)

- Version source: `package.json` (+ lockfile). Every publish to origin ships a version bump (semver).
- Steps, in order:
  1. Bump `version` in `package.json` (`pnpm version patch|minor|major --no-git-tag-version`).
  2. Update `CHANGELOG.md`: move `Unreleased` entries into `## [X.Y.Z] - YYYY-MM-DD`.
  3. Verify: `pnpm verify` (format check + tests).
  4. Commit version + changelog.
  5. Tag release commit: `vX.Y.Z` (must equal `package.json` version).
  6. Push commit and tag (`git push origin main --follow-tags`); `release.yml` then builds the `.vsix`, writes the GitHub Release notes from the matching `CHANGELOG.md` section, and attaches the `.vsix` to the release.

## HOOKS / CI

- Hooks live in `.githooks/`; `pnpm install` sets `core.hooksPath` (the `prepare` script). Activate manually with `pnpm run prepare`.
- `pre-commit`: Prettier formats staged files and re-stages them.
- `pre-push`: `format:check` + `test`, the same gates as CI (`.github/workflows/ci.yml`).
- Bypass knowingly only: `git commit --no-verify` / `git push --no-verify`.
