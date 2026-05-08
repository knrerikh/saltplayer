# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs webpack watchers + electron concurrently)
npm run dev

# Build only (no packaging)
npm run build

# Package distributable
npm run package

# Tests
npm test                    # watch mode
npm run test:unit           # run unit tests once
npm run test:integration    # run integration tests once
npm run test:coverage       # run with coverage report
npm run test:watch          # explicit watch mode

# Run a single test file
npx vitest run tests/unit/torrent.test.ts
```

TypeScript uses path aliases `@/main/*`, `@/renderer/*`, `@/shared/*` — these are configured in `tsconfig.json` and `vitest.config.ts`.

## Architecture

Salt Player is an Electron app with a strict main/renderer split:

```
src/
  main/       — Node.js/Electron main process
  renderer/   — React UI (browser context, no Node access)
  shared/     — Types and IPC channel constants shared by both
```

### Main process

- **`main.ts`** — App entry point. Creates `BrowserWindow`, initializes `StorageManager` and `TorrentEngine`, then calls `setupIPCHandlers`.
- **`torrent.ts`** — Core engine. Wraps WebTorrent (loaded dynamically because it's an ESM module with top-level await). Spins up a local HTTP server on a random port to stream the selected file, uses ffmpeg/ffprobe (via `ffmpeg-static`/`ffprobe-static`) to probe codecs and transcode when needed (e.g. AC3/DTS audio → AAC). Subtitle tracks are extracted on-demand as WebVTT via ffmpeg and served at `/subtitle/<index>.vtt`. Audio track selection triggers a new transcode URL with `?transcode=true&audioTrack=<index>`. Piece prioritization is done manually to front-load the pieces the player needs.
- **`ipc-handlers.ts`** — Registers all `ipcMain.handle` listeners; thin delegation layer to `TorrentEngine`.
- **`preload.ts`** — Exposes `window.electronAPI` to the renderer via `contextBridge`. This is the only safe crossing point between processes.
- **`storage.ts`** — Creates a per-session temp directory (cleaned on startup and shutdown) for torrent piece storage.

### IPC communication pattern

All IPC channel names are constants in `src/shared/types.ts` (`IPC_CHANNELS`). The main process pushes events to the renderer via `webContents.send` (status updates, video URL, subtitle/audio track data). The renderer invokes main-process operations via `window.electronAPI.*` which calls `ipcRenderer.invoke`.

### Renderer process

- **`App.tsx`** — Root component. Registers all `window.electronAPI` event listeners on mount, orchestrates state for `videoUrl`, `torrentStatus`, `subtitleData`, `audioData`, playlist navigation, etc.
- **`VideoPlayer.tsx`** — HTML5 `<video>` element with custom controls. Handles subtitle track switching via the `<track>` element API and audio track switching by calling `onSelectAudioTrack` (which goes back to main via IPC, triggering a new transcoded stream URL).

### ffmpeg/transcode flow

1. On file selection, `TorrentEngine.probeStream()` ffprobes the stream URL to detect unsupported audio codecs (AC3, EAC3, DTS, TrueHD, Vorbis).
2. If unsupported, the video URL sent to the renderer includes `?transcode=true`, causing the HTTP server to pipe the file through an ffmpeg process that transcodes audio to AAC while copying video.
3. Seeking in transcode mode appends `?startTime=<seconds>` to restart ffmpeg from that offset.
4. Audio track selection always triggers transcode mode, mapping only the selected audio stream.

### WebTorrent ESM workaround

WebTorrent v2 is an ESM-only package with top-level await. `torrent.ts` loads it with a dynamic `import()` inside an async function and handles multiple possible export shapes (`default`, `.default`, `.WebTorrent`).
