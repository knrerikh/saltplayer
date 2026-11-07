# Design

## Context

- The player's look lives in `src/renderer/styles.css`: CSS custom properties on `:root` (`--bg-primary` #1a1a1a, `--bg-tertiary` #3a3a3a, `--text-primary`, `--text-secondary`, `--accent` #4a9eff, `--error`, …) plus hard-coded translucent fills in the control bar (`rgba(255,255,255,0.1)` at rest, `0.2` on hover), 36 px round `.control-button`s, the `.volume-slider-pill` capsule with the `mute-button` speaker SVG, and a 6 px `.seek-bar` with an accent fill.
- The remote page (`src/main/remote-control/remote-page.ts`) is one HTML string with inline CSS and script, served by the main process under a CSP that allows only nonce'd inline styles and scripts. It repeats some of those colours by hand and uses solid blue buttons. Its icons already are inline SVGs (#83), copied from the player.
- The renderer is bundled by webpack with CSS loaded through style-loader; the remote page is a TypeScript module in the main bundle. Both can import from `src/shared/`.

## Goals / Non-Goals

**Goals:**
- One source for the colours, control fills and font stack, and one for the shared icon paths, used by both sides.
- The page's controls are touch-sized versions of the player's shapes, not new shapes.
- Layout by CSS alone, so rotation needs no script and no reload.

**Non-Goals:**
- Restyling the player itself beyond reading the shared values.
- A light theme, or following the phone's light/dark setting.
- New controls, commands or state (see proposal, out of scope).

## Decisions

1. **Shared tokens as a TypeScript object, CSS variables generated from it.** `src/shared/theme.ts` exports the palette, the control fills (`controlFill`, `controlFillActive`) and the font stack. The remote page renders them into its inline `:root { --…: … }` block. The renderer keeps `styles.css` (no build change: it is loaded by style-loader and webpack cannot import TS into CSS), and a unit test parses `styles.css`'s `:root` block and asserts each variable equals the shared value; the hard-coded `rgba(255,255,255,0.1/0.2)` in the control bar become `var(--control-fill)` / `var(--control-fill-active)` so they are covered too.
   - *Alternative:* inject the variables into the renderer at runtime from TS. Rejected: a flash of unstyled colours on start and a second mechanism for something CSS already does.
   - *Alternative:* a CSS file shared by both. Rejected: the page cannot load files (self-contained, nonce-only CSP) and would need it inlined at build time.

2. **Shared icon paths.** `src/shared/icons.ts` exports the `d` path strings (and viewBox) for play, pause, previous, next, speaker audible and speaker muted. `VideoPlayer` renders them in its React SVGs; the remote page puts them in its markup. One source, no drift; the existing "no emoji" test stays.

3. **Touch-sized player shapes.** Round translucent buttons (player 36 px → page 56 px; play/pause larger, ~88 px in portrait, scaled down in landscape), the volume as a capsule holding the speaker button and the slider, the seek bar as a thin track with an accent fill drawn by styling the native range input (`::-webkit-slider-runnable-track`, `::-webkit-slider-thumb`, and the `-moz-` equivalents), keeping the native input for accessibility and touch handling. The thumb stays visible and large for dragging. Close video is a neutral control at rest and red only on `:active`, mirroring the player's ✕, which turns red on hover.

4. **Orientation by media query.** Portrait is the default single column; `@media (orientation: landscape)` switches to a two-column grid. Sizes use `dvh`/`dvw` with `clamp()` so the smallest supported viewports (320 × 568 portrait, 568 × 320 landscape) fit without scrolling; `overflow: hidden` is not used to fake it.

5. **Vertical volume slider.** In landscape the volume range uses `writing-mode: vertical-lr; direction: rtl` (top = loud), supported by current Chrome, Safari and Firefox. Where a browser ignores it, the input simply stays horizontal in the same column, which still works (the spec's fallback scenario). No JavaScript-drawn slider.

6. **Verification of "fits without scrolling".** happy-dom does not lay out, so automated tests cover tokens, icons and markup; the viewport sizes are a manual check (browser dev tools device emulation at 320 × 568, 568 × 320, 430 × 932, plus a real iPhone and an Android phone).

## Risks / Trade-offs

- [Styled range inputs look different across engines] → style both `-webkit-` and `-moz-` pseudo-elements; check on iOS Safari, Android Chrome and desktop Chrome in the manual pass.
- [Older iOS (< 17.4) ignores vertical writing-mode on range inputs] → horizontal fallback by design; acceptable.
- [Changing the renderer's hard-coded fills to variables could shift the player's look by a rounding] → the values are the same numbers; the variable test and a visual glance at the player cover it.
- [Very long titles] → clamp to two lines with ellipsis in both orientations; titles are still set with `textContent`.
