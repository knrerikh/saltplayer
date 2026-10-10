# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.2] - 2026-10-10

### Fixed
- **Status bar cut off at the bottom of the window** ([#17](https://github.com/knrerikh/saltplayer/issues/17)): the video container could not shrink below the video's own height, so a 1080p file pushed the status bar partly out of the window.
- **Status bar visible in fullscreen** ([#17](https://github.com/knrerikh/saltplayer/issues/17)): window fullscreen (the macOS green button, <kbd>⌃⌘F</kbd>) is now forwarded to the UI, and the status bar is hidden until the window leaves fullscreen.

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
