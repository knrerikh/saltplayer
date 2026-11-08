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
| `src/main/launch-args.ts` | `fileFromArgv()`: the `.torrent` or video a launch's command line names |
| `src/main/window-reveal.ts` | `revealWindow()`: restores, shows and focuses the window |
| `src/main/media-opener.ts` | `MediaOpener`: opens torrents and video files, remembers each one that opened, and tells the page about opens it did not start |
| `src/main/recent-sources.ts` | `RecentSources`: the Open Recent list, kept in `recent-sources.json` in `userData` |
| `src/main/watch-history.ts` | `WatchHistory`: where each file was left (`watch-history.json` in `userData`), for resuming it and for starting a season with the episode watched last |
| `src/main/settings.ts` | `Settings`: user preferences (`AppSettings`), kept in `settings.json` in `userData` |
| `src/main/json-file.ts` | `JsonFile`: the atomic, serialised JSON read and write behind both files |
| `src/main/remote-control/remote-server.ts` | `RemoteControlServer`: the phone remote's HTTP server (page, Server-Sent Events, commands) and its request checks |
| `src/main/remote-control/remote-control.ts` | `RemoteControl`: turns that server on and off, resets the link and builds the status (pairing links, QR code, expiry); `startRemoteAtLaunch()` |
| `src/main/remote-control/token-store.ts` | `RemoteTokenStore`: the link's token and its creation time in `remote-control.json`, valid for 30 days |
| `src/main/remote-control/remote-page.ts` | `remotePage()`: the remote as one self-contained HTML page |
| `src/main/remote-control/rate-limiter.ts` | `RateLimiter`: fixed-window request counts per remote address; expired windows are dropped |
| `src/main/remote-control/network.ts` | `localAddresses()`: private IPv4 addresses of this machine, Wi-Fi and Ethernet first; `localHostName()`: its `<hostname>.local` name |
| `src/main/ipc-handlers.ts` | Registers `ipcMain` handlers; a thin layer that delegates to `TorrentEngine` and the window |
| `src/main/preload.ts` | Exposes `window.electronAPI` through `contextBridge`, the only crossing point between processes |
| `src/shared/types.ts` | `IPC_CHANNELS` and the types shared by both processes |
| `src/shared/theme.ts` | The palette, control fills and font stack shared by the player and the phone page; `styles.css` keeps a copy as CSS variables that a test holds equal |
| `src/shared/icons.ts` | The SVG paths of the icons the player and the phone page share (play, pause, previous, next, speaker) |
| `src/shared/remote.ts` | `RemoteCommand`, `RemoteState`, `RemoteStatus` and the parsers for what the phone and the page send |
| `src/shared/video-files.ts` | Video extensions, playlist ordering and the choice of the file to play first |
| `src/renderer/App.tsx` | Root component: subscribes to main-process events, owns torrent, playlist, track and error state |
| `src/renderer/components/` | `TorrentInput`, `VideoPlayer`, `StatusBar`, `TitlebarDragRegion`, `OpenUrlDialog`, `NextEpisodeOverlay`, `RemoteControlDialog` |
| `src/renderer/hooks/useAutoplayNext.ts` | The next-episode countdown and the prefetch trigger |
| `src/renderer/hooks/useSavePosition.ts` | Reports where playback is, for resuming later |
| `src/renderer/hooks/useRemoteControl.ts` | Carries out the phone's commands and reports the player's state to it |
| `src/shared/playback-key.ts` | `playbackKey()`: how main and the page name a file for resuming it |

## IPC

All channel names live in `IPC_CHANNELS` (`src/shared/types.ts`).

| Direction | Channels |
| --- | --- |
| Renderer → main (`invoke`) | `torrent:load`, `media:openFile`, `torrent:stop`, `torrent:selectFile`, `torrent:prefetchFile`, `settings:get`, `playback:control`, `playback:seek`, `playback:savePosition`, `audio:selectTrack`, `app:quit`, `app:openExternal`, `window:dragStart`, `window:dragEnd`, `window:setFullscreen`, `remote:setEnabled`, `remote:resetLink` (both return the remote's status), `remote:getStatus`, `remote:setAtLaunch` |
| Renderer → main (`send`) | `window:dragMove` (pointer deltas, high frequency), `remote:state` (player state for the phone, at most once a second for the time) |
| Main → renderer (`send`) | `torrent:status` (every second), `video:url` (with where to resume, or `null`), `video:metadata`, `subtitles:available`, `audio:available`, `error`, `window:fullscreen`, `media:opening`, `media:opened`, `menu:command`, `settings:changed`, `remote:status`, `remote:command` |

## Loading and playback

1. **Load.** `torrent:load` hands a magnet URI or `.torrent` path to `TorrentEngine.load()`. The torrent is added with the source's trackers plus `FALLBACK_TRACKERS`. If metadata does not arrive within `TORRENT_LOAD_TIMEOUT_MS` (60 s), the torrent is removed and an error is sent. A previous torrent is fully stopped before a new one is added.
   A video file from disk takes a shorter path: `media:openFile` hands its path to `TorrentEngine.openLocalFile()`, which skips steps 2–3 and serves the file directly. See [Local files](#local-files).
2. **Pick a file.** Video files are filtered by extension; samples and extras (smaller than 10% of the largest file and under 50 MB) are dropped. The first remaining file in alphabetical order is chosen, which is the first episode of a series. This rule (`pickMainVideoFile`) and the list of video extensions live in `src/shared/video-files.ts`, which the renderer also uses to build the episode list.
3. **Prioritise pieces.** See [Piece selection](TORRENT_OPTIMIZATION.md).
4. **Serve.** A local HTTP server bound to `127.0.0.1` (`STREAM_HOST`) on a random port streams the file with range support, a bounded chunk at a time, so the download follows what the player reads (see [Bounded reads](TORRENT_OPTIMIZATION.md#bounded-reads)).
5. **Probe.** `ffprobe` (spawned directly, 10 s timeout, 5 MB probe size) reads the duration, codecs, audio tracks and subtitle tracks.
6. **Hand over.** The renderer receives the stream URL. If the audio codec is one Chromium cannot play (AC3, E-AC3, DTS, TrueHD/MLP, Vorbis), the URL carries `?transcode=true`. If the first video stream is Dolby Vision profile 5 (see below), it carries `?transcode=true&video=sdr`.

### Dolby Vision conversion

Profile 5 keeps its picture in Dolby's own colour space with no HDR10 or SDR fallback (`dv_bl_signal_compatibility_id` 0 in ffprobe's `DOVI configuration record`), and Chromium does not apply the reshaping, so it shows a purple and green cast. `detectVideoConversion()` (`src/main/video-conversion.ts`) reads that record from the probe and converts only `dv_profile` 5 with compatibility id 0; profiles with a compatible base layer (7, 8.x), other profiles without one (such as 20, MV-HEVC) and everything else play as before. The engine remembers the result (`videoConversion`) and builds every stream URL through `buildStreamUrl()`, so the first URL, an audio-track switch and a fallback all carry `video=sdr` when it applies. The renderer's seek and resume keep a URL's parameters and change only `startTime`.

With `video=sdr` the transcode route re-encodes the picture instead of copying it: `buildConversionArgs()` scales it to fit 1920 × 1080 (never up), applies the Dolby Vision reshaping and tone-maps to BT.709 SDR in limited range (`range=tv`, as browsers expect from H.264) with `tonemapx`, and encodes H.264 (`h264_videotoolbox` on macOS, `libx264` elsewhere) into the same Matroska stream. Scaling comes first so the heavy filter runs at 1080p; 4K output is too slow to keep up on a laptop CPU. Audio, `startTime` and `audioTrack` work as in the audio-only mode. This needs the Jellyfin build of ffmpeg, which is why that is what the app ships (see [Deployment](DEPLOYMENT.md#the-bundled-ffmpeg)).

If the converting ffmpeg fails before its first byte (missing binary, unsupported encoder, filter error), the engine forgets the conversion, sends one `VIDEO_CONVERSION_FAILED` notice (*This video is Dolby Vision, which could not be converted; its colours may be wrong.*) and sends the URL again without `video=sdr`, keeping the position the stream was to start at.

Only a conversion that fails while its file is still the open one counts: ffmpeg killed on purpose (the response closing on a seek, an episode switch or stop, which also closes the server) is never a failure, and the conversion state is cleared as soon as another file starts, so a fallback never carries over to the next episode.

If the probe takes longer than 10 s (a freshly switched 4K episode whose header pieces have not arrived), the file starts on the extension guess. The ffprobe process is not killed: it keeps waiting for the header and, when it finishes, `applyLateProbe()` stores its result and, if the stream URL changes (Dolby Vision found, or an audio conversion needed), sends the new URL the way an audio-track switch does, so the player restarts at the same position with the right colours. A late result for a file that was switched away is dropped (the switch kills that probe).

### Streaming server routes

| Request | Response |
| --- | --- |
| `/<file>` | The file itself, with HTTP range support |
| `/<file>?transcode=true[&startTime=<s>][&audioTrack=<index>][&video=sdr]` | Matroska stream from ffmpeg: video copied (or, with `video=sdr` for a Dolby Vision profile 5 file, converted to SDR at up to 1080p), audio transcoded to stereo AAC (or copied when the selected track is already playable). The input is the server's own raw URL, so ffmpeg can read the container index and `seekInput` accurately. |
| `/subtitle/<index>.vtt[?startTime=<s>]` | The embedded subtitle stream `<index>`, converted to WebVTT by ffmpeg on request. With `startTime` (finite, above 0; anything else is ignored) ffmpeg seeks the input, so cue times start at 0 like the transcoded stream restarted at that offset |

### Local files

The streaming server plays a `MediaSource`: a name, a length and `createReadStream({ start, end })`. A WebTorrent file has that shape already; `openLocalVideo()` (`src/main/local-video.ts`) gives a file on disk the same shape over `fs.createReadStream`. Probing, transcoding, audio tracks, subtitles and range requests are therefore identical for both. Piece prioritisation and `torrent:status` exist only for torrents: with no torrent loaded they do nothing, and the status bar shows the file's name and size instead.

`openLocalFile()` validates and opens the new file before stopping the current torrent or file, so a bad path leaves playback untouched. The playlist of a local file is that one file.

### Seeking

In direct mode the `<video>` element seeks with range requests. In transcode mode the renderer reloads the URL with `startTime`, restarting ffmpeg at that offset; the subtitle `<track>` is requested with the same `startTime` (a new element per URL, so Chromium loads the new cues), because the restarted stream's clock starts at 0. In both modes `playback:seek` moves the piece window to the byte offset that corresponds to the new time.

### Audio tracks and subtitles

When there is more than one audio track, the renderer offers a menu. Choosing a track calls `audio:selectTrack`, and main replies with a new transcode URL that maps only that stream (`-map 0:v:0 -map 0:<index>`, with the picture conversion kept for Dolby Vision); playback resumes from the current position. Subtitle tracks are listed with human-readable language names and attached as `<track>` elements pointing at `/subtitle/<index>.vtt` (with `?startTime=` in transcode mode, see above).

### Resuming playback

A file is named by `playbackKey()` (`src/shared/playback-key.ts`): `<infoHash>/<file name>` for a torrent file, the path for a file on disk. `WatchHistory` (`src/main/watch-history.ts`) keeps the newest 200 entries with the position, the duration, whether the file was watched to the end (past 95 %) and when.

- **Saving.** `useSavePosition()` in `VideoPlayer` calls `playback:savePosition` every 10 s of playback, on pause, when the episode changes or the video closes, and before the page unloads. It saves nothing for a file that has not started playing, so opening a file never overwrites where it was left with 0.
- **Choosing the episode.** `TorrentEngine.load()` starts with `pickStartFile()` (`src/shared/video-files.ts`): the episode of this torrent watched last if unfinished, the next one in playlist order if finished, otherwise the main file.
- **Choosing the position.** Before sending `video:url`, the engine asks `resumePosition()` for the file being served: 10 s before where it was left, or `null` if it was finished, under 30 s, or never played. `VideoPlayer` starts there the same way it restarts after an audio track switch: a transcoded stream reloads with `startTime`, a direct one sets `currentTime`. `ResumeHint` shows *Resumed from …* for 6 s; **Start over** seeks to 0.
- **Turning it off.** `AppSettings.resumePlayback` (**Playback → Resume Playback**, on by default) is read by `WatchHistory`: when off, nothing is recorded and both lookups return nothing. **Clear Menu** clears the history with the recent list.

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

### Magnet links from the browser

A link a user clicks in a browser reaches the main process three ways: macOS `app.on('open-url')` (registered in `runApp()` so a link that launches the app is caught before `ready`), `process.argv` on the first launch of Windows and Linux, and `second-instance` when the app is running (`magnetFromArgv()` in `launch-args.ts`). All end in `createMagnetLinkHandler()` (`magnet-handler.ts`), which validates, brings the window forward, and then:

- nothing open: `openSource()` opens it, which waits for the page like a file does;
- the same torrent open (same lowercase hex info hash, from `TorrentEngine.openInfoHash()`): only the window comes forward;
- anything else open: a native `dialog.showMessageBox` asks *Open "name"? The current video will close.* with Cancel as the default; one question at a time, links that arrive meanwhile are dropped.

Registration has no stored setting. **File → Open Magnet Links in Salt Player** shows `app.isDefaultProtocolClient('magnet')` each time the menu is built, and clicking calls `setAsDefaultProtocolClient` / `removeAsDefaultProtocolClient` and rebuilds the menu from the real answer, so a different client chosen later unticks it. It is disabled when `app.isPackaged` is false, where the registration would point at the Electron binary. A link that arrives is handled whether or not the box is ticked: the system routes it here only if it chose us. `build.protocols` (see [Deployment](DEPLOYMENT.md)) declares the scheme to the installers.

Threat model: a magnet link is input from any website, and the system hands it over with no user action inside the app. So `parseMagnetLink()` (`magnet-link.ts`) accepts only a string that starts with `magnet:?`, is at most 8 KB and has an `xt` of `urn:btih:` (40 hex or 32 base32) or `urn:btmh:` (hex multihash); everything else is logged, without its text, and ignored. From `argv` only an argument that is such a link counts, never a flag or a path. The display name (`dn`) is untrusted: it is decoded, stripped of control and direction-override characters, capped at 200 characters and shown only as dialog text. A link never replaces a playing video without the dialog. A link also carries its own trackers (`tr=`), so after the user confirms the app contacts addresses the website chose, as any torrent client does (its web seeds, `ws=`, are used only as a fallback, see Resilience); only the hash and the name shown in the dialog are validated. Sources are dispatched by what they are, not how they end: `magnet:` and `http(s):` always go to `loadTorrent`, so a link ending in `.mkv` is not opened as a file (`isLinkSource`, `source-kind.ts`, also keeps such an argument out of `fileFromArgv()`).

Every source that opens, from the page or from the menu, is recorded by `MediaOpener`: `RecentSources` keeps the newest 10, one per torrent info hash (a magnet and a `.torrent` of the same torrent are one entry) or per file path, and writes them to `recent-sources.json` in `app.getPath('userData')`. Files from disk also go to `app.addRecentDocument` for the Dock and the Jump List. A missing or corrupt file starts the list empty; a failed write is logged and never stops a video from opening.

### Window dragging

The window is frameless. `TitlebarDragRegion` turns pointer movement over the top strip into `window:dragMove` deltas that main applies to the window position. A press that moves less than 3 px is treated as a click and passed through to the player. There are no `-webkit-app-region` rules, because an app region swallows every click in its area.

### Fullscreen

All fullscreen is window fullscreen. The player's ⛶ button calls `window:setFullscreen`, and the macOS green button or <kbd>⌃⌘F</kbd> change the same state natively. `forwardFullscreenState()` (`src/main/window-fullscreen.ts`) forwards the window's `enter-full-screen` and `leave-full-screen` events as `window:fullscreen`; `App` keeps that state, hides the status bar and passes it to the player.

The HTML Fullscreen API is deliberately not used. Chromium handles <kbd>Esc</kbd> for it before the page sees the key, so an open menu could not take precedence. macOS does not bind <kbd>Esc</kbd> to window fullscreen either, so `App` handles it and calls `window:setFullscreen(false)`. Open subtitle and audio menus handle <kbd>Esc</kbd> first on `document` and mark the event as handled; one press closes the menu, the next leaves fullscreen.

### Remote control

A phone on the local network can control playback. `RemoteControlServer` (`src/main/remote-control/remote-server.ts`) is separate from the streaming server, which stays on loopback. It does not exist until **Playback → Remote Control…** turns it on (`remote:setEnabled`) or, if the user ticked *Start remote control when Salt Player opens* (`AppSettings.remoteAtLaunch`, off by default, set through `remote:setAtLaunch`), `main.ts` turns it on after initialisation with `startRemoteAtLaunch()`; whether it is on is otherwise not remembered. The page reads the status with `remote:getStatus` when it loads, since a remote started at launch may be on before the page listens. Quitting, and closing the last window on macOS, stop it.

- **Pairing.** `start()` listens on all interfaces, on port 8642 (`REMOTE_PORT`) or, if that is taken, a random one, and reports `portChanged` so that `RemoteStatus.portChanged` makes the dialog warn that saved links do not match. The token is not made by the server: `RemoteControl` takes it from `RemoteTokenStore` and passes it to `start()`. `RemoteControl` turns it into one link `http://<host>:<port>/?t=<token>` per host (`<hostname>.local` from `localHostName()` first, when the hostname is a plain label and there is a network, then each private IPv4 address from `localAddresses()`) and a QR code of the first (`qrcode`); the dialog shows them, and when the link expires (`expiresAt`), from the `RemoteStatus` that `remote:setEnabled` and `remote:resetLink` return and `remote:status` pushes.
- **Token storage and lifetime.** The token is 128 bits (`crypto.randomBytes(16)`, base64url) and is kept with its creation time in `remote-control.json` in `userData` (through `JsonFile`, plain text like the other files there). `RemoteTokenStore.current()` reuses it while it is well-formed, not from the future and younger than `TOKEN_LIFETIME_MS` (30 days); a missing, corrupt, malformed or expired record issues and saves a new one. So the link survives turning the remote off and on and restarting the app, but not 30 days. **Reset link** (`RemoteControl.resetLink()`, `remote:resetLink`) issues and saves a new token at once; if the server is running it swaps it in (`setCredentials()`) and ends the open event streams, so phones reconnect and get 401. Turning on, off and resetting share one promise chain and run one after another.
- **Expiry while running.** The server is given `expiresAt` with the token and refuses the token (401) from then on, even if it matches, so a remote left on for weeks does not keep honouring a link older than 30 days. The token is not rotated automatically: the next turn-on after the expiry, or a reset, issues the new one, and the dialog says the link has expired.
- **The phone page** tells apart the two ways the event stream ends. If the browser closes it (the server answered 401 or another refusal), the page asks for itself with the same token: 401 means the link expired or was reset (*scan the new code*); a network error or any other answer is shown as *Remote control is off*. While the stream is only interrupted the browser reconnects by itself and the page shows *Reconnecting…*.
- **Routes.** `GET /` is the page, `GET /api/events` a Server-Sent Events stream (the last state on connect, then every `broadcast()`, a `: ping` every 25 s, at most 8 clients) and `POST /api/command` takes a JSON body of at most 8 KB with the token as a bearer token. Anything else is 404.
- **Commands** are parsed by `parseRemoteCommand()` (`src/shared/remote.ts`), which rejects anything unknown, then sent to the page as `remote:command`. `useRemoteControl` runs `toggle-play` through the same function as <kbd>Space</kbd> and a click. `seek-by` (±3600 s, not 0) and `seek-to` (≥ 0) go through the player's `seekTo()`, the path of a click on the progress bar (a transcoded stream restarts with `startTime`, `playback:seek` moves the piece priority); the hook clamps the time to `[0, duration]`, ignores them without a video or a known duration, and sends the new time to the phone at once. `set-volume` (0–1) and `set-muted` change the same `volume` and `muted` state as the slider and the player's mute button (the player applies both to every new video, so they survive switching files) and work without a video; `toggle-fullscreen` calls the player's `onToggleFullscreen` (`window:setFullscreen`) and `close-video` its `onClose` (what ✕ and File → Close Video do), both only while a video is loaded. `previous-episode` and `next-episode` call the player's `onPrev` / `onNext` (what ⏮ / ⏭ run, undefined at the ends) and `select-episode` (`name`, 1 to 1024 characters) its `onSelectFile`, the title-bar episode list's action; all three need a video, and `select-episode` also needs the name to be in the playlist the phone was shown, so nothing from the phone ever reaches a path. A new command is a new member of `RemoteCommand`, its handling in that hook and, on the phone, a control in `remote-page.ts`.
- **State** goes the other way: while the remote is on, the player sends `remote:state` when the video, its title, play/pause, the volume, mute or fullscreen changes (`RemoteState` carries `volume`, `muted` and `isFullscreen` next to the time, and `episodes`, `episodeIndex`, `hasPrevious` and `hasNext` for the playlist: file names only, in the player's order, empty unless there are at least two files, at most `MAX_REMOTE_EPISODES` (500) names of at most `MAX_EPISODE_NAME_LENGTH` (1024) characters, which the hook enforces and `parseRemoteState()` rejects beyond; the page builds its episode list from them with `textContent`), and the time at most once a second. Main validates it (`parseRemoteState()`), keeps the latest and broadcasts it.
- **The page** is one string of HTML with inline CSS and script and no external requests. Titles come from torrents and are untrusted, so the script only ever assigns `textContent`. The look comes from `shared/theme.ts` (rendered into the page's `:root`) and `shared/icons.ts`; portrait and landscape layouts are chosen by CSS media queries alone, so rotating the phone needs no script. The script only sets `--fill` on the range inputs (through CSSOM, which the nonce-only CSP allows) because WebKit cannot colour the played part natively.

Threat model. The server is reachable by anyone on the same network, and by any web page the user opens, which can make the browser send requests to a LAN address. So every request is checked, in this order:

1. **Rate limit** per remote address (fixed window, 120 requests per 10 s): 429. It makes guessing the token impractical on top of its 128 bits.
2. **`Host`** must be `<one of this machine's addresses | localhost | 127.0.0.1 | its <hostname>.local name>:<port>`: 403. The comparison ignores case (host names are case-insensitive). A DNS-rebinding page reaches us under its own name, which is not on the list; the `.local` name is derived from `os.hostname()` (only `[A-Za-z0-9-]` labels, any domain part dropped), so it is a name only the local network's mDNS answers for.
3. **`Origin`** on `POST` must be present and equal `http://<Host>`: 403. A page of another origin cannot send commands from the user's browser. Only the page we serve passes.
4. **Token**, compared with `crypto.timingSafeEqual`, and not past its expiry: 401.

Every response has `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`; the page also gets a CSP with a per-response nonce (`default-src 'none'`, scripts and styles only with the nonce, `connect-src 'self'`). The link is in the URL, so `no-referrer` keeps it out of anything the page might link to. Traffic is plain HTTP: someone who can observe the local network can read the link and the title. A link that lasts is worth more if it leaks (a screenshot of the code, browser history, a backup of `userData`), so it is limited three ways: it expires after 30 days, the dialog has **Reset link** to end it at once, and it only works for hosts on the local network. The remote is off by default; with *Start remote control when Salt Player opens* ticked, the port is open from launch until quit, so the setting is opt-in and the dialog shows when the link expires. The token file is stored in plain text next to the user's other settings and written owner-only (mode 0600; POSIX systems) and protected by the operating system's file permissions only: whoever can read the user's files could already read the video folder. What the remote can do is bounded by `RemoteCommand`: it never reaches files, the streaming server, `shell.openExternal` or IPC beyond the commands the page chooses to run.

## Storage and lifecycle

- Four files in the app's `userData` folder are kept between launches: the recent list, `recent-sources.json`, and where each file was left, `watch-history.json` (**File → Open Recent → Clear Menu** empties both), the preferences, `settings.json`, and the phone remote's token, `remote-control.json` (see *Remote control*). All go through `JsonFile`: a missing or corrupt file reads as empty (defaults for settings, keeping only known keys of the right type), and writes are atomic (temp file, then rename) and serialised.

- **One instance.** `main.ts` calls `app.requestSingleInstanceLock()` before anything else runs. A process that does not get the lock calls `app.exit(0)`, not `quit()`: `quit()` is asynchronous, so `ready` would still fire and `before-quit` would run `cleanupApp()`. It never creates a `StorageManager`, an engine or a window. The instance that holds the lock gets `second-instance` with the other process's `argv` and working directory.
- **How a file reaches the running app.** Every route ends in `openSource()` in `main.ts`, which holds the source until the page has loaded: **Open Recent**, **Open File…**, macOS `open-file`, the command line of the first launch (`process.argv`, Windows and Linux) and `second-instance`. `fileFromArgv()` (`src/main/launch-args.ts`) picks the first `.torrent` or video in an `argv`, skipping the executable, in development the app entry, and flags; it resolves relative paths against the launcher's working directory and does not check existence (opening reports a bad file). `open-file` and `second-instance` then call `showApp()`: `revealWindow()` restores, shows and focuses the window, or the window is recreated if the last one was closed on macOS. The OS offers Salt Player for these types through `build.fileAssociations` in `package.json` (role `Viewer`), kept equal to `VIDEO_EXTENSIONS` plus `.torrent` by a test.
- `StorageManager.initialize()` deletes `saltplayer-*` folders in the system temp directory left by earlier sessions, then creates a fresh `saltplayer-<id>` folder for this one. Each session folder holds `session.pid` with its owner's process id, and a folder is deleted only if that process is gone (`process.kill(pid, 0)` fails with `ESRCH`; `EPERM` means a live process of another user). A folder without a readable marker predates it and is deleted. This guards against a dev build or another user's copy; the single-instance lock is what normally prevents it.
- On quit (`before-quit`, or closing the last window on Windows and Linux), the engine stops the torrent and closes the HTTP server and ffmpeg processes, and the session folder is deleted.
- On macOS, closing the window only stops the torrent (and the remote); the app keeps running with its storage intact, so it is ready when the window is reopened.

## Resilience

- **TCP only.** WebTorrent is created with `utp: false`. Its uTP-first dialing took ~41 s to fall back to TCP, longer than the load timeout, on networks that drop uTP.
- **No WebRTC.** `node-datachannel` is not rebuilt for Electron, so `Module._load` is intercepted while WebTorrent loads and the native module is replaced by a no-op stub. The stub only lets `webrtc-polyfill` load; it cannot make peers, so the client is also created with `tracker: { wrtc: false }`, which makes `bittorrent-tracker` skip `wss://` trackers (a warning) instead of building WebRTC peers that throw. A desktop client only needs TCP peers.
- **Web seeds only as a fallback.** WebTorrent is created with `webSeeds: false`, so a magnet's `ws=` and a `.torrent`'s `url-list` are not used at first. A web seed is asked for a whole piece in one request, and for the first or last piece of a video shared with other files that is one HTTP request per file; when one of them never answers, the piece stays reserved, no peer may take it and the download stops one piece short of the end (#108). `TorrentEngine.watchForWebSeedFallback()` checks every second; once the torrent is not complete and has had no peers for `WEB_SEED_FALLBACK_MS` (15 s, counted from when it was added and again whenever the peer count drops to 0; `shouldAddWebSeeds()` in `web-seed-fallback.ts`), it adds the torrent's `urlList` with `torrent.addWebSeed()`, once. The timer ends with `stop()`, `destroy()` or the torrent. Torrents that only have web seeds therefore start after about 15 s.
- **ffmpeg failures do not crash the app.** `ffprobe` is spawned directly instead of through `fluent-ffmpeg`, whose capability check could throw synchronously on an architecture mismatch (`EBADARCH`). Recoverable `uncaughtException`s are logged and the app keeps running without transcoding.
- **Crash log.** Fatal errors and startup diagnostics (architecture, ffmpeg and ffprobe paths) are appended to `crash.log` in the app's log directory (`~/Library/Logs/saltplayer/` on macOS).

## Security

- `contextIsolation` is enabled and `nodeIntegration` is disabled; the renderer only sees the functions in `preload.ts`.
- The streaming server listens on loopback only (`127.0.0.1`), so other machines on the network cannot reach it, and it serves only the selected file and its subtitle tracks.
- `media:openFile` takes a path from the renderer (a drop or the file picker) and accepts only an absolute path to a regular file with a recognised video extension. It adds no new reach: the page is loaded from `file://` and could already point a `<video>` at a local file.
- The phone remote is off until turned on and listens on the local network only while on; see *Remote control* above for its checks. It exposes no files and no video.
- `app:openExternal` hands only `http:` and `https:` URLs to `shell.openExternal` (`isSafeExternalUrl`, `src/main/external-url.ts`); `file:`, `smb:`, custom protocol handlers and anything unparsable are refused.
