# Architecture

Salt Player is an Electron app with a strict split between the main process (Node.js: torrents, ffmpeg, files) and the renderer (React UI, no Node access). They talk only through a typed IPC bridge.

```
┌──────────────────────── Renderer (React) ────────────────────────┐
│  App.tsx ── TorrentInput · VideoPlayer · StatusBar · OpenUrlDialog│
│      │  window.electronAPI (invoke)        ▲ events (send)        │
└──────┼─────────────────────────────────────┼─────────────────────┘
       │            preload.ts (contextBridge)│
┌──────▼───────────────── Main (Node.js) ─────┼─────────────────────┐
│  ipc-handlers.ts ──► MediaOpener ◄── app menu                     │
│                          │   └──► RecentSources (userData JSON)   │
│                          ▼                                        │
│                     TorrentEngine (torrent.ts) ──► webContents    │
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
| `src/main/download-window.ts` | Read-ahead window and release arithmetic, and `readInChunks()`, the bounded reads behind every response |
| `src/main/local-video.ts` | `MediaSource`, the shape the streaming server plays, and `openLocalVideo()`, which validates a path on disk and opens it as one |
| `src/main/storage.ts` | `StorageManager`: per-session temp directory, stale-session cleanup, disk space checks |
| `src/main/app-menu.ts` | `buildAppMenuTemplate()`: the application menu as a plain template (File, View, Playback, Help; plus the app, Edit and Window menus on macOS) |
| `src/main/media-opener.ts` | `MediaOpener`: opens torrents and video files, remembers each one that opened, and tells the page about opens it did not start |
| `src/main/recent-sources.ts` | `RecentSources`: the Open Recent list, kept in `recent-sources.json` in `userData` |
| `src/main/settings.ts` | `Settings`: user preferences (`AppSettings`), kept in `settings.json` in `userData` |
| `src/main/json-file.ts` | `JsonFile`: the atomic, serialised JSON read and write behind both files |
| `src/main/ipc-handlers.ts` | Registers `ipcMain` handlers; a thin layer that delegates to `TorrentEngine` and the window |
| `src/main/preload.ts` | Exposes `window.electronAPI` through `contextBridge`, the only crossing point between processes |
| `src/shared/types.ts` | `IPC_CHANNELS` and the types shared by both processes |
| `src/shared/video-files.ts` | Video extensions, playlist ordering and the choice of the file to play first |
| `src/renderer/App.tsx` | Root component: subscribes to main-process events, owns torrent, playlist, track and error state |
| `src/renderer/components/` | `TorrentInput`, `VideoPlayer`, `StatusBar`, `TitlebarDragRegion`, `OpenUrlDialog`, `NextEpisodeOverlay` |
| `src/renderer/hooks/useAutoplayNext.ts` | The next-episode countdown and the prefetch trigger |

## IPC

All channel names live in `IPC_CHANNELS` (`src/shared/types.ts`).

| Direction | Channels |
| --- | --- |
| Renderer → main (`invoke`) | `torrent:load`, `media:openFile`, `torrent:stop`, `torrent:selectFile`, `torrent:prefetchFile`, `settings:get`, `playback:control`, `playback:seek`, `audio:selectTrack`, `app:quit`, `app:openExternal`, `window:dragStart`, `window:dragEnd`, `window:setFullscreen` |
| Renderer → main (`send`) | `window:dragMove` (pointer deltas, high frequency) |
| Main → renderer (`send`) | `torrent:status` (every second), `video:url`, `video:metadata`, `subtitles:available`, `audio:available`, `error`, `window:fullscreen`, `media:opening`, `media:opened`, `menu:command`, `settings:changed` |

## Loading and playback

1. **Load.** `torrent:load` hands a magnet URI or `.torrent` path to `TorrentEngine.load()`. The torrent is added with the source's trackers plus `FALLBACK_TRACKERS`. If metadata does not arrive within `TORRENT_LOAD_TIMEOUT_MS` (60 s), the torrent is removed and an error is sent. A previous torrent is fully stopped before a new one is added.
   A video file from disk takes a shorter path: `media:openFile` hands its path to `TorrentEngine.openLocalFile()`, which skips steps 2–3 and serves the file directly. See [Local files](#local-files).
2. **Pick a file.** Video files are filtered by extension; samples and extras (smaller than 10% of the largest file and under 50 MB) are dropped. The first remaining file in alphabetical order is chosen, which is the first episode of a series. This rule (`pickMainVideoFile`) and the list of video extensions live in `src/shared/video-files.ts`, which the renderer also uses to build the episode list.
3. **Prioritise pieces.** See [Piece selection](TORRENT_OPTIMIZATION.md).
4. **Serve.** A local HTTP server bound to `127.0.0.1` (`STREAM_HOST`) on a random port streams the file with range support, a bounded chunk at a time, so the download follows what the player reads (see [Bounded reads](TORRENT_OPTIMIZATION.md#bounded-reads)).
5. **Probe.** `ffprobe` (spawned directly, 10 s timeout, 5 MB probe size) reads the duration, codecs, audio tracks and subtitle tracks.
6. **Hand over.** The renderer receives the stream URL. If the audio codec is one Chromium cannot play (AC3, E-AC3, DTS, TrueHD/MLP, Vorbis), the URL carries `?transcode=true`.

### Streaming server routes

| Request | Response |
| --- | --- |
| `/<file>` | The file itself, with HTTP range support |
| `/<file>?transcode=true[&startTime=<s>][&audioTrack=<index>]` | Matroska stream from ffmpeg: video copied, audio transcoded to stereo AAC (or copied when the selected track is already playable). The input is the server's own raw URL, so ffmpeg can read the container index and `seekInput` accurately. |
| `/subtitle/<index>.vtt` | The embedded subtitle stream `<index>`, converted to WebVTT by ffmpeg on request |

### Local files

The streaming server plays a `MediaSource`: a name, a length and `createReadStream({ start, end })`. A WebTorrent file has that shape already; `openLocalVideo()` (`src/main/local-video.ts`) gives a file on disk the same shape over `fs.createReadStream`. Probing, transcoding, audio tracks, subtitles and range requests are therefore identical for both. Piece prioritisation and `torrent:status` exist only for torrents: with no torrent loaded they do nothing, and the status bar shows the file's name and size instead.

`openLocalFile()` validates and opens the new file before stopping the current torrent or file, so a bad path leaves playback untouched. The playlist of a local file is that one file.

### Seeking

In direct mode the `<video>` element seeks with range requests. In transcode mode the renderer reloads the URL with `startTime`, restarting ffmpeg at that offset. In both modes `playback:seek` moves the piece window to the byte offset that corresponds to the new time.

### Audio tracks and subtitles

When there is more than one audio track, the renderer offers a menu. Choosing a track calls `audio:selectTrack`, and main replies with a new transcode URL that maps only that stream (`-map 0:v:0 -map 0:<index>`); playback resumes from the current position. Subtitle tracks are listed with human-readable language names and attached as `<track>` elements pointing at `/subtitle/<index>.vtt`.

### Autoplay of the next episode

`useAutoplayNext()` (`src/renderer/hooks/useAutoplayNext.ts`) runs inside `VideoPlayer` on the playback position:

- **120 s before the end** (`PREFETCH_BEFORE_END_S`) it calls `torrent:prefetchFile` once for the next file of the playlist. `TorrentEngine.prefetchFile()` selects that file's first `PREFETCH_BYTES` (16 MB) at normal priority. `prioritizeStreamingPieces()` deselects every file each time it runs (on seeks too), so it selects the prefetch range again afterwards, and forgets it once that file is the one playing. A local file has no torrent, so nothing happens.
- **5 s before the end** (`AUTOPLAY_COUNTDOWN_S`) `NextEpisodeOverlay` shows the whole seconds left. The video's `ended` event, or **Play now**, switches through the same `onNext` as the Next button; **Cancel** or <kbd>Esc</kbd> dismisses autoplay for this episode. <kbd>Esc</kbd> is handled on `document` and marked as handled, like the track menus, so it does not also leave fullscreen.

The countdown follows playback time rather than a wall-clock timer, so pausing holds it and the switch happens exactly when the stream ends, including transcoded streams whose reported duration is approximate. A new episode (the playlist entry that is playing) resets it, and the player resets its position when the URL changes so the old episode's end is not taken for the new one's. With no next file (the last episode, a single video) or the setting off, nothing happens.

The setting, `AppSettings.autoplayNext` (on by default), lives in main. The page reads it with `settings:get` on start; **Playback → Autoplay Next Episode** changes it, and main rebuilds the menu and sends `settings:changed`.

### Application menu

`buildAppMenuTemplate()` (`src/main/app-menu.ts`) returns the menu as a template with its actions injected, so it is tested without Electron; `main.ts` builds it with `Menu.buildFromTemplate` and rebuilds it whenever the recent list changes.

- **Open File…** shows the open dialog in main (videos and `.torrent`), so that path never comes from the page.
- **Open Recent**, **Open File…** and macOS `open-file` (a file dropped on the Dock icon or picked from its recent documents) all go through `MediaOpener.open()`. It sends `media:opening`, and the page clears the current video and shows loading; then `media:opened` with the metadata, or `error`. `open-file` can arrive before the window exists, so the source waits until the page has loaded.
- **Open URL…** and **Close Video** are `menu:command`s, carried out by the page: it owns the URL field and the player state. On the start screen Open URL… focuses and selects the existing field; with a video on screen, or while that field is disabled during loading, it shows `OpenUrlDialog`. With no window open (macOS), they just bring the window back.
- **View → Toggle Full Screen** is Electron's `togglefullscreen` role, the same window fullscreen as the ⛶ button.
- **Help** links go through `isSafeExternalUrl` like `app:openExternal`. About is the native panel on macOS and Linux and a message box on Windows, filled by `app.setAboutPanelOptions`.

Every source that opens, from the page or from the menu, is recorded by `MediaOpener`: `RecentSources` keeps the newest 10, one per torrent info hash (a magnet and a `.torrent` of the same torrent are one entry) or per file path, and writes them to `recent-sources.json` in `app.getPath('userData')`. Files from disk also go to `app.addRecentDocument` for the Dock and the Jump List. A missing or corrupt file starts the list empty; a failed write is logged and never stops a video from opening.

### Window dragging

The window is frameless. `TitlebarDragRegion` turns pointer movement over the top strip into `window:dragMove` deltas that main applies to the window position. A press that moves less than 3 px is treated as a click and passed through to the player. There are no `-webkit-app-region` rules, because an app region swallows every click in its area.

### Fullscreen

All fullscreen is window fullscreen. The player's ⛶ button calls `window:setFullscreen`, and the macOS green button or <kbd>⌃⌘F</kbd> change the same state natively. `forwardFullscreenState()` (`src/main/window-fullscreen.ts`) forwards the window's `enter-full-screen` and `leave-full-screen` events as `window:fullscreen`; `App` keeps that state, hides the status bar and passes it to the player.

The HTML Fullscreen API is deliberately not used. Chromium handles <kbd>Esc</kbd> for it before the page sees the key, so an open menu could not take precedence. macOS does not bind <kbd>Esc</kbd> to window fullscreen either, so `App` handles it and calls `window:setFullscreen(false)`. Open subtitle and audio menus handle <kbd>Esc</kbd> first on `document` and mark the event as handled; one press closes the menu, the next leaves fullscreen.

## Storage and lifecycle

- Two files in the app's `userData` folder are kept between launches: the recent list, `recent-sources.json` (**File → Open Recent → Clear Menu** empties it), and the preferences, `settings.json`. Both go through `JsonFile`: a missing or corrupt file reads as empty (defaults for settings, keeping only known keys of the right type), and writes are atomic (temp file, then rename) and serialised.

- `StorageManager.initialize()` deletes `saltplayer-*` folders left in the system temp directory by earlier sessions, then creates a fresh `saltplayer-<id>` folder for this one.
- On quit (`before-quit`, or closing the last window on Windows and Linux), the engine stops the torrent and closes the HTTP server and ffmpeg processes, and the session folder is deleted.
- On macOS, closing the window only stops the torrent; the app keeps running with its storage intact, so it is ready when the window is reopened.

## Resilience

- **TCP only.** WebTorrent is created with `utp: false`. Its uTP-first dialing took ~41 s to fall back to TCP, longer than the load timeout, on networks that drop uTP.
- **No WebRTC.** `node-datachannel` is not rebuilt for Electron, so `Module._load` is intercepted while WebTorrent loads and the native module is replaced by a no-op stub. A desktop client only needs TCP peers.
- **ffmpeg failures do not crash the app.** `ffprobe` is spawned directly instead of through `fluent-ffmpeg`, whose capability check could throw synchronously on an architecture mismatch (`EBADARCH`). Recoverable `uncaughtException`s are logged and the app keeps running without transcoding.
- **Crash log.** Fatal errors and startup diagnostics (architecture, resolved ffmpeg paths) are appended to `crash.log` in the app's log directory (`~/Library/Logs/saltplayer/` on macOS).

## Security

- `contextIsolation` is enabled and `nodeIntegration` is disabled; the renderer only sees the functions in `preload.ts`.
- The streaming server listens on loopback only (`127.0.0.1`), so other machines on the network cannot reach it, and it serves only the selected file and its subtitle tracks.
- `media:openFile` takes a path from the renderer (a drop or the file picker) and accepts only an absolute path to a regular file with a recognised video extension. It adds no new reach: the page is loaded from `file://` and could already point a `<video>` at a local file.
- `app:openExternal` hands only `http:` and `https:` URLs to `shell.openExternal` (`isSafeExternalUrl`, `src/main/external-url.ts`); `file:`, `smb:`, custom protocol handlers and anything unparsable are refused.
