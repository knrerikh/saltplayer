# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Remote control: episodes** ([#67](https://github.com/knrerikh/saltplayer/issues/67), part of [#41](https://github.com/knrerikh/saltplayer/issues/41)): when a torrent has several videos, the phone page gets ⏮ / ⏭ buttons and a list of its episodes, in the same order as the player's. They switch episodes like the player's own buttons and episode list; only file names are sent to the phone, never paths.
- **Remote control: volume, mute, fullscreen and close** ([#66](https://github.com/knrerikh/saltplayer/issues/66), part of [#41](https://github.com/knrerikh/saltplayer/issues/41)): the phone page gets a volume slider, a mute button, a fullscreen toggle that shows the window's state, and **Close video** (with a confirmation). The player gets a mute button beside the volume slider, so the app and the phone show the same thing.
- **Remote control: seek** ([#65](https://github.com/knrerikh/saltplayer/issues/65), part of [#41](https://github.com/knrerikh/saltplayer/issues/41)): the phone page gets **−30 / −10 / +10 / +30 s** buttons and a timeline with the current time and duration; dragging it shows the time under the finger and seeks on release. Seeks run the same path as the progress bar, including transcoded streams.
- **Remote control from a phone** ([#64](https://github.com/knrerikh/saltplayer/issues/64), part of [#41](https://github.com/knrerikh/saltplayer/issues/41)): **Playback → Remote Control…** shows a link and QR code; opened on a phone on the same network it shows what is playing (title, time) and plays or pauses it, updating live. Off until you turn it on and never saved; the link carries a new random token each time. *Remote on* appears in the status bar while it is running.
- **Resume playback** ([#51](https://github.com/knrerikh/saltplayer/issues/51)): a file opened again continues where it was left (10 s earlier), with *Resumed from …* and **Start over**; a season opens at the episode watched last, or the next one after a finished episode. Positions are kept in `watch-history.json` (the last 200 files); **Clear Menu** forgets them, and **Playback → Resume Playback** (on by default) turns resuming and recording off.

### Changed
- **Bounded disk use** ([#54](https://github.com/knrerikh/saltplayer/issues/54)):
  - Only about five minutes of playback ahead of the player are downloaded, instead of the rest of the episode. Pausing stops the download once that is in.
  - Switching to another episode frees the disk space of the one left behind; going back downloads it again.
  - Torrents are added with nothing selected, so WebTorrent no longer starts fetching the whole torrent before playback picks a file, or re-fetches failed pieces of other files.

### Fixed
- **The volume reset to full on every new video** ([#66](https://github.com/knrerikh/saltplayer/issues/66)): the video was set to full volume and unmuted while the slider kept showing the old value. The volume and mute you set now carry over to the next file.
- **Status bar** ([#58](https://github.com/knrerikh/saltplayer/issues/58)): the progress bar no longer touches *Downloaded*; speeds under 2 KB/s (peer messages, not video data, e.g. while paused) show as `0.0 KB/s`; speeds are always in KB/s or MB/s with one decimal; the changing values sit next to their labels and only ever widen, never narrow back, so the bar no longer jitters.
- **File → Open URL… on the start screen showed a second URL field** ([#50](https://github.com/knrerikh/saltplayer/issues/50)) in a dialog over the one already there. It now focuses and selects the start screen's field; the dialog appears only while a video is on screen.
- **The status bar showed the size of the whole torrent** ([#55](https://github.com/knrerikh/saltplayer/issues/55)), e.g. 30 GB for a season, which read as if all of it was downloading. It now shows the size of the file playing.

## [1.7.0] - 2026-10-24

### Added
- **Application menu** ([#31](https://github.com/knrerikh/saltplayer/issues/31)) in place of Electron's default one:
  - **File:** Open File… (<kbd>⌘O</kbd> / <kbd>Ctrl+O</kbd>), Open URL… (<kbd>⌘U</kbd> / <kbd>Ctrl+U</kbd>), Open Recent with Clear Menu, Close Video (<kbd>⌘W</kbd> / <kbd>Ctrl+W</kbd>). Opening from the menu works while a video plays and replaces it.
  - **View:** Toggle Full Screen (<kbd>⌃⌘F</kbd> / <kbd>F11</kbd>), the same window fullscreen as the ⛶ button.
  - **Help:** Keyboard Shortcuts, User Guide, Report an Issue…, Release Notes, and About on Windows and Linux. macOS keeps its standard app, Edit and Window menus.
- **Autoplay of the next episode** ([#42](https://github.com/knrerikh/saltplayer/issues/42)): five seconds before an episode ends, *Next episode in 5 s* appears with **Cancel** and **Play now**, and the next file of the series starts when the video ends. <kbd>Esc</kbd> cancels without leaving fullscreen. On by default; **Playback → Autoplay Next Episode** turns it off, and the choice is kept in `settings.json`.
- **The next episode is fetched ahead:** two minutes before the end, the first 16 MB of the next file start downloading, so the switch (by autoplay or the Next button) does not stall on an empty buffer.
- **Open Recent** remembers the last 10 torrents and files, one entry per torrent whether it was opened by magnet or `.torrent`. It is the app's first persistent state: `recent-sources.json` in the app's data folder, emptied by **Clear Menu**. On macOS, files from disk also appear in the Dock icon's menu, and a file dropped on the Dock icon opens.
- **Local video files** ([#33](https://github.com/knrerikh/saltplayer/issues/33)): drop a video onto the window or choose it with **Open File** to play it from disk. It goes through the same streaming server as a torrent, so transcoding of AC3/DTS audio, audio track switching, embedded subtitles and seeking all work. The status bar shows the file's name and size.

### Fixed
- **Switching episodes quickly could start the wrong stream.** A streaming server replaced before it had started listening still reported its URL, built from the new server's port and the old file's name. Only the current server reports now, and stopping before it starts no longer throws.
- Audio tracks are no longer lost when ffprobe returns no stream list for a file.

## [1.6.2] - 2026-10-10

### Security
- **Streaming server reachable from the local network** ([#18](https://github.com/knrerikh/saltplayer/issues/18)): it listened on all interfaces, so anyone on the same network who found the port could stream the current video and its subtitles. It now binds to `127.0.0.1` only.
- **Any URL could be opened outside the app** ([#19](https://github.com/knrerikh/saltplayer/issues/19)): `app:openExternal` passed whatever the renderer sent to the OS, including `file:`, `smb:` and custom protocol URLs. Only `http:` and `https:` are allowed now.

### Changed
- The rule that picks the file to play first and the list of video extensions now live in one shared module (`src/shared/video-files.ts`) used by both the engine and the episode list ([#20](https://github.com/knrerikh/saltplayer/issues/20)). A second, unused rule ("largest file") and its tests were removed; the tests now cover the rule the app actually uses.
- CI no longer uploads to Codecov, which never received a coverage file. Instead it enforces coverage thresholds for `src/` and shows a coverage table in the run summary ([#21](https://github.com/knrerikh/saltplayer/issues/21)).
- Tests: React Testing Library 16 with a single `@testing-library/dom`; a duplicate copy made `userEvent` bypass `act()` and flooded test output with about 100 warnings. Such a warning now fails the test ([#28](https://github.com/knrerikh/saltplayer/issues/28)).
- Releases are automated ([#25](https://github.com/knrerikh/saltplayer/issues/25)): **Prepare release** in GitHub Actions turns `[Unreleased]` into a version section, bumps the version and opens the release PR; merging it tags the version, builds the installers into a draft release with notes from the CHANGELOG, and publishes it once every platform has succeeded.

### Fixed
- **Status bar cut off at the bottom of the window** ([#17](https://github.com/knrerikh/saltplayer/issues/17)): the video container could not shrink below the video's own height, so a 1080p file pushed the status bar partly out of the window.
- **Status bar visible in fullscreen** ([#17](https://github.com/knrerikh/saltplayer/issues/17)): window fullscreen (the macOS green button, <kbd>⌃⌘F</kbd>) is now forwarded to the UI, and the status bar is hidden until the window leaves fullscreen.
- **<kbd>Esc</kbd> did not leave window fullscreen** ([#26](https://github.com/knrerikh/saltplayer/issues/26)): macOS does not bind it, so the app now handles it. An open subtitle or audio menu is closed first.
- **<kbd>Esc</kbd> with a track menu open left fullscreen** ([#29](https://github.com/knrerikh/saltplayer/issues/29)) instead of closing the menu. The player's ⛶ button used the HTML Fullscreen API, whose <kbd>Esc</kbd> Chromium handles before the page. It now uses window fullscreen like the green button, so both behave the same.

## [1.6.1] - 2026-10-10

### Changed
- **Documentation rewritten** to match the app as it is today:
  - **README:** release badge, real download file names (including the Apple Silicon DMG), audio transcoding, audio tracks, subtitles, episode navigation, auto-hiding controls, a controls table, and troubleshooting for load timeouts and Gatekeeper.
  - **User Guide:** removed the non-existent <kbd>F</kbd> fullscreen shortcut, corrected the auto-hide delay, documented audio tracks, subtitles and speed colours.
  - **Architecture:** current modules, IPC channels, streaming-server routes, the transcode, seek and audio-track flows, window dragging, lifecycle and resilience measures.
  - **Piece selection** (`docs/TORRENT_OPTIMIZATION.md`): the algorithm as implemented, including seek reprioritisation.
  - **Testing:** actual test layout, CI matrix and a manual pre-release checklist.
  - **Deployment:** the tag-driven release workflow, packaging details, signing status and codec licensing.
  - **CONTRIBUTING:** branch per change, tests first, version bump and docs update in every PR, Node.js 22.18+.
  - **Bug report template:** asks for CPU architecture and audio codec, and points to `crash.log`.
- CHANGELOG backfilled with every release from 1.1.0 to 1.5.1; fixed the 1.0.0 date and removed the never-released 0.1.0 entry.

### Removed
- Outdated root documents from the initial commit: `INSTALLATION.md`, `QUICKSTART.md`, `PROJECT_SUMMARY.md`, `SOLUTION.md`, `FFMPEG_CODECS_SOLUTION.md`, `TESTING_GUIDE.md`. Their still-relevant content moved into README, `docs/TESTING.md` and `docs/DEPLOYMENT.md`.

## [1.6.0] - 2026-10-10

### Changed
- **New app icon**: a faceted salt-crystal play button on a deep blue squircle replaces the raster ice cube. It follows the macOS icon grid with a transparent margin, so no dark square shows around it in the Dock, and it stays legible down to 16 px.

### Added
- `npm run icons` regenerates `build/icon.svg`, `assets/icon.png`, `build/icon.icns` and a seven-size `build/icon.ico` from a single TypeScript source, `scripts/icon/design.mts`.
- Unit tests cover the icon geometry and the ICO encoder, and fail if the committed SVG drifts from the design code.

### Removed
- Stale `scripts/generate-icns.sh` and `scripts/generate-ico.js`; the latter depended on `png-to-ico`, which was never installed.

## [1.5.2] - 2026-09-18

### Fixed
- **Magnet links failing to load**: WebTorrent dialled every peer over uTP first and only fell back to TCP after ~41 s of retries, while the load timeout was 30 s, so magnets timed out even on healthy swarms on networks that drop uTP. The client is now created with `utp: false` and connects over TCP immediately.
- **Retry after a timeout hung forever**: a timed-out torrent stayed registered on the client, so loading the same magnet again hit WebTorrent's duplicate-torrent branch and ran with no timeout at all. The timed-out torrent is now removed, the load promise settles exactly once, and the previous torrent is fully stopped before a new one is added.
- **`stop()` could never resolve**: `client.remove()` rejects without calling its callback when the torrent has already detached itself; removal now settles on whichever of callback, resolve or reject comes first, and never leaves an unhandled rejection.
- **Error banner timers**: consecutive errors no longer share a stray auto-dismiss timer that hid the newer error early.

### Changed
- Load timeout raised from 30 s to 60 s (`TORRENT_LOAD_TIMEOUT_MS`).
- A fallback list of public trackers (`FALLBACK_TRACKERS`) is announced alongside the source's own trackers, so magnets with dead or blocked trackers can still find peers.

### Added
- Close button (✕) on the error banner, shown on hover. Hovering the banner pauses auto-dismiss; leaving it restarts the 5 s countdown.

## [1.5.1] - 2026-08-23

### Fixed
- **Window could not be dragged**: the CSS drag region did not move the frameless window and swallowed every click on the top of the video. The title strip now reports pointer movement to the main process, which moves the window; a press that moves less than 3 px stays a click and toggles playback.

## [1.5.0] - 2026-08-22

### Added
- **Auto-hiding controls**: during playback, the controls and cursor fade out after 2.5 s without mouse movement and return on any mouse, key or wheel activity. They stay visible while paused, while a menu is open, or while the pointer is on the controls.

### Fixed
- Controls and the close button stayed visible permanently in fullscreen.
- Leaving fullscreen with <kbd>Esc</kbd> or the window button desynchronised the player's fullscreen state.
- The title drag strip swallowed clicks on the top 36 px of the video.
- **macOS:** closing the window tore down storage while the app kept running, so the next load failed with "Storage manager not initialized". The torrent now stops on window close and storage stays initialised.

## [1.4.7] - 2026-05-10

### Fixed
- Audio tracks were not detected when ffprobe finished after its 10 s timeout (regression in 1.4.5). ffprobe now also runs with a 5 MB probe size and 5 s analyse duration, so it finishes sooner.

## [1.4.6] - 2026-05-10

### Fixed
- **Intel Macs:** the x64 DMG shipped an ARM64 ffmpeg binary and crashed with `EBADARCH`. The release workflow now downloads the x64 binary before packaging.
- Recoverable ffmpeg spawn errors no longer quit the app; playback continues without transcoding.

## [1.4.5] - 2026-05-10

### Fixed
- ffprobe is spawned directly instead of through `fluent-ffmpeg`, whose capability check could crash the app with `EBADARCH`. Startup diagnostics (architecture, resolved ffmpeg paths) are written to `crash.log`.

## [1.4.4] - 2026-05-10

### Changed
- **macOS:** separate arm64 and x64 DMGs replace the universal build, which corrupted the bundled ffmpeg binaries. ffmpeg and ffprobe are unpacked from the asar archive so they can be executed.

## [1.4.3] - 2026-05-09

### Fixed
- The WebRTC stub was defined with arrow functions, which cannot be used as constructors, so creating a peer connection threw.

## [1.4.2] - 2026-05-09

### Fixed
- The WebRTC stub threw when `webrtc-polyfill` called methods on it, crashing playback when a WebRTC peer appeared.

## [1.4.1] - 2026-05-09

### Fixed
- The packaged app crashed loading `node-datachannel`, which is not rebuilt for Electron. WebRTC is now replaced by a no-op stub; desktop playback only needs TCP peers.

## [1.4.0] - 2026-05-09

### Added
- **Audio track selection** for multi-language files. Tracks are listed as "Language (codec, channels)", for example "Russian (AC3 5.1)". Switching resumes from the current position; incompatible codecs are transcoded to AAC.
- Tag-triggered release workflow that builds and publishes installers for all platforms, with native modules rebuilt for Electron.

## [1.3.0] - 2026-02-23

### Added
- **Subtitles**: embedded subtitle tracks are detected with ffprobe, extracted as WebVTT on demand and shown through a CC menu, with human-readable language names. Off by default.

## [1.1.0] - 2026-02-19

### Added
- **Selective download**: only the episode being played is downloaded.
- **Piece prioritisation**: the first 10 pieces of the file are fetched with high priority, the rest in playback order. Seeking moves the window.
- **Speed indicator**: the download speed is coloured green, yellow or red depending on whether it keeps up with the video's bitrate.

### Changed
- Progress in the status bar reflects the current file, not the whole torrent.

### Fixed
- Seeking in transcode mode: ffmpeg now reads the file through the local HTTP server, so the container index stays available and video remains decodable after a seek.
- Crash on startup with Electron 28 (`EXC_BREAKPOINT`); downgraded to Electron 27.

## [1.0.0] - 2026-01-03

### Added
- **Instant Torrent Streaming**: Start watching videos immediately without waiting for full download
- **Magnet & Torrent Support**: Load content via magnet links or .torrent files
- **Auto Video Selection**: Automatically selects the largest video file from torrents
- **Click-to-Play/Pause**: Click anywhere on the video to toggle playback
- **Spacebar Control**: Press spacebar to play/pause (respects input field focus)
- **Animated Playback Feedback**: Visual play/pause icons that fade smoothly in the center of video
- **Episode Selection**: Dropdown selector for torrents with multiple video files
- **Video Controls**: Play/pause, seek, volume control, and fullscreen support
- **Real-time Statistics**: Display download speed, upload speed, peers, and progress
- **Smart Temporary Storage**: Automatic cleanup of temporary files on application exit
- **Session Cleanup**: Removes orphaned temporary directories from previous sessions on startup
- **Minimalist Dark UI**: Clean, distraction-free interface optimized for video playback
- **Cross-platform Support**: Works on Windows, macOS, and Linux
- **Privacy First**: No tracking, no telemetry, no user accounts required

### Technical
- Built with Electron 28, React 18, and TypeScript
- WebTorrent integration for streaming
- FFmpeg support for video transcoding when needed
- Comprehensive test coverage (85 tests, ~40% code coverage)
- Unit and integration tests with Vitest
- Automated temporary file management

### Documentation
- Comprehensive README with usage instructions
- MIT License
- Full API documentation in code comments
- Architecture documentation

[Unreleased]: https://github.com/knrerikh/saltplayer/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/knrerikh/saltplayer/compare/v1.6.2...v1.7.0
[1.6.2]: https://github.com/knrerikh/saltplayer/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/knrerikh/saltplayer/releases/tag/v1.6.1
[1.6.0]: https://github.com/knrerikh/saltplayer/pull/14
[1.5.2]: https://github.com/knrerikh/saltplayer/releases/tag/v1.5.2
[1.5.1]: https://github.com/knrerikh/saltplayer/releases/tag/v1.5.1
[1.5.0]: https://github.com/knrerikh/saltplayer/releases/tag/v1.5.0
[1.4.7]: https://github.com/knrerikh/saltplayer/releases/tag/v1.4.7
[1.4.6]: https://github.com/knrerikh/saltplayer/releases/tag/v1.4.6
[1.4.5]: https://github.com/knrerikh/saltplayer/compare/v1.4.4...v1.4.5
[1.4.4]: https://github.com/knrerikh/saltplayer/releases/tag/v1.4.4
[1.4.3]: https://github.com/knrerikh/saltplayer/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/knrerikh/saltplayer/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/knrerikh/saltplayer/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/knrerikh/saltplayer/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/knrerikh/saltplayer/releases/tag/v1.3.0
[1.1.0]: https://github.com/knrerikh/saltplayer/releases/tag/1.1.0
[1.0.0]: https://github.com/knrerikh/saltplayer/tree/v1.0.0
