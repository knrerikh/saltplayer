# Tasks

## 1. Shared tokens and icons

- [x] 1.1 Add `src/shared/theme.ts` with the palette, `controlFill` / `controlFillActive` and the font stack, taking the current values from `src/renderer/styles.css`; verify with a unit test that the exported values are what the player uses today.
- [x] 1.2 In `src/renderer/styles.css`, add `--control-fill` and `--control-fill-active` to `:root` and replace the control bar's hard-coded `rgba(255, 255, 255, 0.1)` / `0.2` with them; add a unit test that parses the `:root` block and asserts every variable equals `theme.ts`. Verify the player's existing tests still pass.
- [x] 1.3 Add `src/shared/icons.ts` with the `d` paths and viewBox for play, pause, previous, next, speaker audible and speaker muted; make `VideoPlayer`'s SVGs use it. Verify with a test that the player's mute button renders the shared speaker paths, and the existing player tests pass.

## 2. Remote page look

- [x] 2.1 Render the page's `:root` variables from `theme.ts` and restyle the controls as touch-sized player shapes: translucent round buttons, the volume capsule with the speaker button, the seek bar as a thin accent-filled track on the native range input, Close video neutral at rest and red only on `:active`; keep the nonce-only CSP, `textContent`-only script and the element ids the script uses. Verify with `tests/unit/remote-page.test.ts`: tokens present in the page, no hard-coded solid-accent button backgrounds, the close confirmation still asked.
- [x] 2.2 Use `icons.ts` for every icon on the page; verify the existing icon-state tests (play/pause, muted/audible) and the no-emoji test pass, and a new test that the page's speaker paths equal the player's.

## 3. Layout

- [ ] 3.1 Portrait single column and landscape two-column grid by media query, sized with `dvh` / `clamp()` so 320 × 568 and 568 × 320 fit without scrolling, with every control at least 44 × 44 px; verify the markup/CSS test for the media query and the column assignment, then check the sizes in browser device emulation (record the result in the PR).
- [ ] 3.2 Vertical volume slider in landscape (`writing-mode: vertical-lr; direction: rtl`), horizontal fallback where unsupported; verify by test that the landscape rule exists, and manually on iOS Safari and Android Chrome.
- [ ] 3.3 Long titles clamp to two lines with an ellipsis in both orientations; verify by test of the CSS rule and manually with a long torrent name.

## 4. Docs and checks

- [x] 4.1 User Guide *Remote control*: the new look, both orientations, and that the phone's own volume buttons change the phone's volume, not the computer's; CHANGELOG `[Unreleased]` entry. Verify the docs mention both orientations and the volume-button note.
- [ ] 4.2 Run `npx tsc --noEmit -p .` and `npx vitest run` with no `Errors` line; then the manual pass from design.md decision 6 on a real phone in both orientations (rotation while playing keeps the state).

## Workflow follow-up

- After merge: `/opsx:archive remote-page-look-and-layout` to move the change to the archive and create `openspec/specs/remote-control-page/spec.md`.
