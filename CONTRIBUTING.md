# Contributing to Salt Player

Thanks for taking the time to contribute. Open an issue first for anything larger than a small fix, so we can agree on the approach before you write code.

## Setup

Use **Node.js 22.18 or newer**: `npm run icons` runs TypeScript directly and `@electron/rebuild` declares Node 22. CI also runs the tests on Node 18 and 20.

```bash
npm install
npm run dev          # webpack watchers + Electron
npm run test:unit    # unit tests
npm test             # all tests in watch mode
```

See the [README](README.md#development) for the project layout and the full command list.

## Workflow

Every change, however small, follows the same path:

1. **Branch from an up-to-date `master`**, one branch per feature or fix: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
2. **Write the test first.** Start with a failing test that describes the behaviour, then make it pass, then refactor. Bug fixes start with a test that reproduces the bug.
3. **Record the change** under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format). Do not change the version; that happens at release time.
4. **Update the docs** that the change affects: README, `docs/` and this file.
5. **Open a pull request** against `master` and wait for CI to pass on macOS, Windows and Linux.

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). The body explains *why* the change is needed.

## Code style

- TypeScript in strict mode; match the surrounding code's naming and structure.
- Small, single-purpose functions with names that make comments unnecessary. When a comment is needed, it explains *why*, not *what*.
- No dead code, debug logging or commented-out experiments in a pull request.
- Shared constants (IPC channels, timeouts) live in one place and are imported, never duplicated.

## Releases

Changes accumulate under `[Unreleased]` and are released together, when something user-visible has piled up or right away for urgent fixes (security, crashes). The maintainer decides when to release and picks the version from the largest change since the last release:

- patch (`x.y.Z`): only small fixes, docs and tooling;
- minor (`x.Y.0`): at least one new feature or fix of a major bug;
- major (`X.0.0`): large refactors and global changes.

Releasing is two clicks: run **Prepare release** in GitHub Actions with that bump, then merge the pull request it opens. See [Deployment](docs/DEPLOYMENT.md#release-process).
