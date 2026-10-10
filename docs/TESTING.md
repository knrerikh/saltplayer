# Testing

Tests use [Vitest](https://vitest.dev/) with `happy-dom` and [Testing Library](https://testing-library.com/). New behaviour starts with a failing test (see [CONTRIBUTING](../CONTRIBUTING.md#workflow)).

## Commands

```bash
npm test                     # watch mode
npm run test:unit            # unit tests once
npm run test:integration     # integration tests once
npm run test:coverage        # all tests with a v8 coverage report (text + coverage/index.html)
npx vitest run tests/unit/torrent.test.ts   # one file
npx vitest run -t "seek"                    # tests whose name matches
```

## Layout

| File | Covers |
| --- | --- |
| `tests/unit/torrent.test.ts` | Magnet validation and video file selection (`TorrentEngine` static helpers) |
| `tests/unit/torrent-magnet-load.test.ts` | The load contract with a mocked WebTorrent: TCP-only client, fallback trackers, timeout and removal, settling exactly once, stopping before re-adding |
| `tests/unit/torrent-optimization.test.ts` | Piece selection: file deselection, piece windows, critical and sequential ranges, episode switching, seek reprioritisation |
| `tests/unit/storage.test.ts` | Temp directory creation and cleanup, size and free-space checks |
| `tests/unit/utils.test.ts` | Speed, size and time formatting; magnet link validation |
| `tests/unit/icon.test.ts` | Icon geometry, the ICO encoder, and drift between `build/icon.svg` and the design code |
| `tests/integration/ipc.test.ts` | Renderer-side calls through the `electronAPI` bridge |
| `tests/integration/components.test.tsx` | `TorrentInput` and `StatusBar` behaviour, including the speed colour |
| `tests/integration/videoplayer.test.tsx` | `VideoPlayer`: click and <kbd>Space</kbd> to play, seeking, episode selection, subtitles, audio track menu, auto-hiding controls |
| `tests/integration/titlebar-drag.test.tsx` | Drag versus click on the title strip |
| `tests/unit/window-fullscreen.test.ts` | Forwarding window fullscreen changes to the renderer |
| `tests/integration/statusbar-fullscreen.test.tsx` | Status bar hidden in window fullscreen; the video container can shrink so the status bar is never pushed off-screen |
| `tests/unit/ipc-window.test.ts` | The `window:exitFullscreen` handler |
| `tests/integration/escape-fullscreen.test.tsx` | <kbd>Esc</kbd> leaves window fullscreen, but closes an open menu first |
| `tests/integration/error-dismiss.test.tsx` | Error banner close button, hover pause and auto-dismiss timers |

`tests/helpers/electron-api.ts` provides `mockElectronAPI()`, a complete `electronAPI` mock for rendering `<App />` with helpers that deliver main-process events. `tests/setup.ts` installs a default mocked `window.electronAPI` and a `File` subclass with a `path` property for drag-and-drop tests. Main-process tests mock `electron` and, where needed, `webtorrent` with `vi.mock`; no test touches the network.

## Conventions

- Test behaviour through public methods and rendered output, not private state.
- One behaviour per test, named as a sentence: `it('keeps controls visible while paused')`.
- Use fake timers (`vi.useFakeTimers()`) for timeouts and intervals instead of real waiting.
- A bug fix includes the test that would have caught it.

## Continuous integration

`.github/workflows/test.yml` runs on every push to `master` and every pull request:

- **test:** unit and integration tests on Ubuntu, macOS and Windows with Node 18 and 20. Coverage is generated on Ubuntu with Node 20.
- **build:** after the tests pass, the app is built and packaged (without publishing) on all three platforms.

The release workflow runs the same tests before publishing; see [Deployment](DEPLOYMENT.md).

## Manual smoke test before a release

Automated tests mock WebTorrent and ffmpeg. Before tagging a release, check the packaged app with a legal multi-episode torrent, for example public-domain or Creative Commons content.

1. **Load a magnet.** Playback starts within seconds; the status bar shows peers and speed.
2. **Selective download.** In a multi-file torrent only the current episode downloads; switching episode moves the download to the new one.
3. **Seek.** Seeking to ~30–40% resumes quickly in both an MP4 and an MKV.
4. **Transcoded audio.** An MKV with AC3/E-AC3/DTS audio plays with sound; switching audio track resumes from the same position.
5. **Subtitles.** An embedded subtitle track can be enabled and switched.
6. **Controls.** Controls and cursor hide after 2.5 s of playback without movement; the window can be dragged by the title strip; a click on the strip toggles playback.
7. **Cleanup.** After quitting, no `saltplayer-*` folder remains in the system temp directory.

In development (`npm run dev`), the main process logs the chosen piece window, for example `File pieces: 0 to 1999 (total: 2000)` and `Critical pieces: 10, Sequential: 1990`.
