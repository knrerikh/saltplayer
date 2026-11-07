# Proposal

## Why

The phone remote (#41) looks like a different product: solid blue buttons, a red close button and default browser sliders, while the player itself uses translucent round controls and capsules on a dark background with blue only as an accent. Its single column also scrolls in landscape, where a phone is usually held while watching (#87).

## What Changes

- The remote page takes the player's look: the same palette, font, translucent round buttons and capsules, a thin seek bar with an accent fill, and the volume as a capsule with the speaker icon, as in the player's control bar.
- Destructive and status colours follow the player: red only for a pressed or confirmed destructive action, accent blue only for progress, the active state and focus.
- Colours, the control fill and the font stack come from one shared source used by both the player and the remote page, so they cannot drift apart.
- The icons the player and the remote share (speaker, play, pause, previous, next) are drawn from one shared set of SVG paths.
- Portrait: one column, as now, fitting common phone screens without scrolling.
- Landscape: two columns — transport on the left (title, time, seek bar, play/pause and skips), the rest on the right (volume as a vertical slider with mute, episodes, fullscreen and close) — without scrolling.
- The User Guide says that the phone's own volume buttons change the phone's volume, not the computer's.

Out of scope: the connection indicator and device pairing (#85), new controls such as audio and subtitle tracks (#68) or download status (#69), and any change to commands, state or the server.

## Capabilities

### New Capabilities
- `remote-control-page`: how the phone remote page looks and lays out its controls on a phone, in both orientations, and how it stays consistent with the player.

### Modified Capabilities

## Impact

- `src/main/remote-control/remote-page.ts`: markup and inline CSS rewritten; the script keeps its behaviour and its element ids where possible.
- New shared modules in `src/shared/` for the palette/tokens and the icon paths; `src/renderer/styles.css` and `src/renderer/components/VideoPlayer.tsx` read the same values (CSS custom properties stay the renderer's mechanism).
- Tests: the page's markup and script tests (`tests/unit/remote-page.test.ts`), a test that keeps the renderer's CSS variables equal to the shared tokens.
- Docs: User Guide (*Remote control*), CHANGELOG `[Unreleased]`.
- No new dependencies; the page stays self-contained under its nonce-only CSP.
