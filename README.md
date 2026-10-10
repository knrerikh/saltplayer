<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Salt Player icon">
</p>

<h1 align="center">Salt Player</h1>

<p align="center">
  A minimalist desktop player that streams video straight from torrents.<br>
  Paste a magnet link, press Enter, watch.
</p>

<p align="center">
  <a href="https://github.com/knrerikh/saltplayer/releases/latest"><img src="https://img.shields.io/github/v/release/knrerikh/saltplayer" alt="Latest release"></a>
  <a href="https://github.com/knrerikh/saltplayer/actions/workflows/test.yml"><img src="https://github.com/knrerikh/saltplayer/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platforms">
</p>

## Features

- **Streams while it downloads.** Playback starts once the first pieces arrive; pieces are fetched in playback order, and only the episode you are watching is downloaded.
- **Plays what browsers can't.** AC3, E-AC3, DTS, TrueHD and Vorbis audio is transcoded to AAC on the fly with ffmpeg, so most MKV releases just work.
- **Audio tracks and subtitles.** Switch between the audio tracks and embedded subtitle tracks of the file from the player controls.
- **Series-friendly.** Multi-file torrents get an episode list and previous/next buttons.
- **Stays out of the way.** Controls and cursor hide after 2.5 s without movement; the window has no chrome beyond a draggable title strip.
- **Leaves nothing behind.** Pieces live in a per-session temp folder that is deleted on exit; folders left by a crash are removed on the next launch. No accounts, no telemetry.

Salt Player is deliberately not a library manager, a torrent search engine or a download manager. It plays one torrent, now.

## Install

Download the build for your platform from [**Releases**](https://github.com/knrerikh/saltplayer/releases/latest):

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `Salt-Player-<version>-arm64.dmg` |
| macOS (Intel) | `Salt-Player-<version>.dmg` |
| Windows (installer) | `Salt-Player-Setup-<version>.exe` |
| Windows (portable) | `Salt-Player-<version>.exe` |
| Linux | `Salt-Player-<version>.AppImage`, `saltplayer_<version>_amd64.deb`, `saltplayer-<version>.x86_64.rpm` |

Requires macOS 10.15+, Windows 10+ or a 64-bit Linux distribution from the last few years.

> **macOS:** builds are not notarised yet, so Gatekeeper blocks the first launch. Right-click the app and choose **Open**, or run
> `xattr -dr com.apple.quarantine "/Applications/Salt Player.app"`.

## Usage

1. Paste a magnet link and press **Enter**, or drop a `.torrent` file onto the window (or click **Open File**).
2. Salt Player picks the main video file and starts playing after a short buffer. For a series, choose the episode from the list in the title bar.
3. The status bar shows progress, download and upload speed, peers and downloaded size.

| Action | Control |
| --- | --- |
| Play / pause | <kbd>Space</kbd>, click the video, or the play button |
| Seek | Click the progress bar |
| Volume | Slider in the control bar |
| Audio track / subtitles | Track menus in the control bar; <kbd>Esc</kbd> closes a menu |
| Previous / next episode | Buttons next to play |
| Fullscreen | Fullscreen button; <kbd>Esc</kbd> leaves fullscreen |

See the [User Guide](docs/USER_GUIDE.md) for details.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| *Torrent load timed out* (after 60 s) | The swarm has no reachable peers. Try a magnet with more seeders; Salt Player already adds public fallback trackers. |
| Constant buffering | Few seeders or a slow connection. The download speed turns yellow, then red, when it falls below the video's bitrate. |
| *No video file found in torrent* | The torrent has no MP4, MKV, WebM, MOV, M4V, AVI, FLV or WMV file. |
| Picture plays but no sound | Should not happen: report the file's audio codec in an [issue](https://github.com/knrerikh/saltplayer/issues). |
| AVI / FLV / WMV won't play | Only audio is transcoded; these containers usually carry video codecs Chromium cannot decode. |

## Development

Use **Node.js 22.18 or newer**: `npm run icons` runs TypeScript directly and `@electron/rebuild` declares Node 22. CI also runs the tests on Node 18 and 20.

```bash
git clone https://github.com/knrerikh/saltplayer.git
cd saltplayer
npm install

npm run dev           # webpack watchers + Electron with reload
npm run test:unit     # unit tests (Vitest)
npm run package       # build an installer for the current platform into release/
npm run icons         # regenerate app icons from scripts/icon/design.mts
```

| Path | Contents |
| --- | --- |
| `src/main/` | Electron main process: torrent engine and local streaming server (`torrent.ts`), temp storage, IPC handlers, preload bridge |
| `src/renderer/` | React UI: player, torrent input, status bar |
| `src/shared/` | Types and IPC channel names shared by both processes |
| `tests/` | Unit and integration tests |
| `scripts/` | Packaging hooks and icon generator |

How streaming, transcoding and piece prioritisation work is described in [Architecture](docs/ARCHITECTURE.md) and [Torrent optimisation](docs/TORRENT_OPTIMIZATION.md). Testing and release processes are in [Testing](docs/TESTING.md) and [Deployment](docs/DEPLOYMENT.md).

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Every change goes through its own branch and pull request, comes with tests, and updates the CHANGELOG and the docs it affects. History is in the [Changelog](CHANGELOG.md).

## Legal

Salt Player is a neutral tool. You are responsible for having the right to access the content you play; respect copyright law in your jurisdiction.

Released under the [MIT License](LICENSE). Built on [WebTorrent](https://webtorrent.io/), [Electron](https://www.electronjs.org/), [React](https://react.dev/) and [FFmpeg](https://ffmpeg.org/).
