# Architecture

Salt Player is an Electron app with a strict split between the main process (Node.js: torrents, ffmpeg, files) and the renderer (React UI, no Node access). They talk only through a typed IPC bridge.

```
┌──────────────────────── Renderer (React) ────────────────────────┐
│  App.tsx ── TorrentInput · VideoPlayer · StatusBar · TitlebarDrag │
│      │  window.electronAPI (invoke)        ▲ events (send)        │
└──────┼─────────────────────────────────────┼─────────────────────┘
       │            preload.ts (contextBridge)│
┌──────▼───────────────── Main (Node.js) ─────┼─────────────────────┐
│  ipc-handlers.ts ──► TorrentEngine (torrent.ts) ──► webContents   │
│                         │        │                                │
│                   WebTorrent   local HTTP server ◄── <video src>  │
│                         │        │   └─ ffmpeg / ffprobe          │
│                  StorageManager (per-session temp dir)            │
└───────────────────────────────────────────────────────────────────┘
```

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/main/main.ts` | App lifecycle, `BrowserWindow` (frameless, `titleBarStyle: 'hiddenInset'`), crash log, wiring |
| `src/main/torrent.ts` | `TorrentEngine`: WebTorrent client, file selection, piece prioritisation, streaming server, probing, transcoding, subtitles, audio tracks, status updates |
| `src/main/storage.ts` | `StorageManager`: per-session temp directory, stale-session cleanup, disk space checks |
| `src/main/ipc-handlers.ts` | Registers `ipcMain` handlers; a thin layer that delegates to `TorrentEngine` and the window |
| `src/main/preload.ts` | Exposes `window.electronAPI` through `contextBridge`, the only crossing point between processes |
| `src/shared/types.ts` | `IPC_CHANNELS` and the types shared by both processes |
| `src/renderer/App.tsx` | Root component: subscribes to main-process events, owns torrent, playlist, track and error state |
| `src/renderer/components/` | `TorrentInput`, `VideoPlayer`, `StatusBar`, `TitlebarDragRegion` |

## IPC

All channel names live in `IPC_CHANNELS` (`src/shared/types.ts`).

| Direction | Channels |
| --- | --- |
| Renderer → main (`invoke`) | `torrent:load`, `torrent:stop`, `torrent:selectFile`, `playback:control`, `playback:seek`, `audio:selectTrack`, `app:quit`, `app:openExternal`, `window:dragStart`, `window:dragEnd` |
| Renderer → main (`send`) | `window:dragMove` (pointer deltas, high frequency) |
| Main → renderer (`send`) | `torrent:status` (every second), `video:url`, `video:metadata`, `subtitles:available`, `audio:available`, `error`, `window:fullscreen` |

## Loading and playback

1. **Load.** `torrent:load` hands a magnet URI or `.torrent` path to `TorrentEngine.load()`. The torrent is added with the source's trackers plus `FALLBACK_TRACKERS`. If metadata does not arrive within `TORRENT_LOAD_TIMEOUT_MS` (60 s), the torrent is removed and an error is sent. A previous torrent is fully stopped before a new one is added.
2. **Pick a file.** Video files are filtered by extension; samples and extras (smaller than 10% of the largest file and under 50 MB) are dropped. The first remaining file in alphabetical order is chosen, which is the first episode of a series.
3. **Prioritise pieces.** See [Piece selection](TORRENT_OPTIMIZATION.md).
4. **Serve.** A local HTTP server on a random port streams the file with range support; the renderer reaches it at `127.0.0.1`.
5. **Probe.** `ffprobe` (spawned directly, 10 s timeout, 5 MB probe size) reads the duration, codecs, audio tracks and subtitle tracks.
6. **Hand over.** The renderer receives the stream URL. If the audio codec is one Chromium cannot play (AC3, E-AC3, DTS, TrueHD/MLP, Vorbis), the URL carries `?transcode=true`.

### Streaming server routes

| Request | Response |
| --- | --- |
| `/<file>` | The file itself, with HTTP range support |
| `/<file>?transcode=true[&startTime=<s>][&audioTrack=<index>]` | Matroska stream from ffmpeg: video copied, audio transcoded to stereo AAC (or copied when the selected track is already playable). The input is the server's own raw URL, so ffmpeg can read the container index and `seekInput` accurately. |
| `/subtitle/<index>.vtt` | The embedded subtitle stream `<index>`, converted to WebVTT by ffmpeg on request |

### Seeking

In direct mode the `<video>` element seeks with range requests. In transcode mode the renderer reloads the URL with `startTime`, restarting ffmpeg at that offset. In both modes `playback:seek` moves the piece window to the byte offset that corresponds to the new time.

### Audio tracks and subtitles

When there is more than one audio track, the renderer offers a menu. Choosing a track calls `audio:selectTrack`, and main replies with a new transcode URL that maps only that stream (`-map 0:v:0 -map 0:<index>`); playback resumes from the current position. Subtitle tracks are listed with human-readable language names and attached as `<track>` elements pointing at `/subtitle/<index>.vtt`.

### Window dragging

The window is frameless. `TitlebarDragRegion` turns pointer movement over the top strip into `window:dragMove` deltas that main applies to the window position. A press that moves less than 3 px is treated as a click and passed through to the player. There are no `-webkit-app-region` rules, because an app region swallows every click in its area.

### Fullscreen

There are two kinds of fullscreen. The player's button puts the video container into element fullscreen through the Fullscreen API. Window fullscreen (the macOS green button, <kbd>⌃⌘F</kbd>) bypasses that API, so `forwardFullscreenState()` (`src/main/window-fullscreen.ts`) forwards the window's `enter-full-screen` and `leave-full-screen` events as `window:fullscreen`. The renderer hides the status bar while it is set.

## Storage and lifecycle

- `StorageManager.initialize()` deletes `saltplayer-*` folders left in the system temp directory by earlier sessions, then creates a fresh `saltplayer-<id>` folder for this one.
- On quit (`before-quit`, or closing the last window on Windows and Linux), the engine stops the torrent and closes the HTTP server and ffmpeg processes, and the session folder is deleted.
- On macOS, closing the window only stops the torrent; the app keeps running with its storage intact, so it is ready when the window is reopened.

## Resilience

- **TCP only.** WebTorrent is created with `utp: false`. Its uTP-first dialing took ~41 s to fall back to TCP, longer than the load timeout, on networks that drop uTP.
- **No WebRTC.** `node-datachannel` is not rebuilt for Electron, so `Module._load` is intercepted while WebTorrent loads and the native module is replaced by a no-op stub. A desktop client only needs TCP peers.
- **ffmpeg failures do not crash the app.** `ffprobe` is spawned directly instead of through `fluent-ffmpeg`, whose capability check could throw synchronously on an architecture mismatch (`EBADARCH`). Recoverable `uncaughtException`s are logged and the app keeps running without transcoding.
- **Crash log.** Fatal errors and startup diagnostics (architecture, resolved ffmpeg paths) are appended to `crash.log` in the app's log directory (`~/Library/Logs/Salt Player/` on macOS).

## Security

- `contextIsolation` is enabled and `nodeIntegration` is disabled; the renderer only sees the functions in `preload.ts`.
- The streaming server serves only the selected file and its subtitle tracks. It currently listens on all interfaces, not just loopback.
- `app:openExternal` passes URLs to `shell.openExternal` without filtering the scheme.
