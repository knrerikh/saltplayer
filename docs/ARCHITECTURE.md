# Saltplayer Architecture

## Overview

Saltplayer is built on Electron with a clear separation between main and renderer processes.

```
┌─────────────────────────────────────────┐
│         Renderer Process (UI)           │
│                                         │
│  ┌───────────┐  ┌──────────────────┐   │
│  │  React    │  │  Video Player    │   │
│  │Components │  │  (HTML5 Video)   │   │
│  └─────┬─────┘  └────────┬─────────┘   │
│        │                 │              │
│        └────────┬────────┘              │
│                 │ IPC                   │
└─────────────────┼─────────────────────  ┘
                  │
┌─────────────────┼─────────────────────  ┐
│                 │ contextBridge         │
│         Main Process (Electron)         │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │   Torrent    │  │  Storage        │ │
│  │   Engine     │  │  Manager        │ │
│  │ (WebTorrent) │  │ (Temp Files)    │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │           │
│         └────────┬──────────┘           │
│                  │                      │
│         ┌────────▼────────┐             │
│         │  HTTP Server    │             │
│         │  (Streaming)    │             │
│         └─────────────────┘             │
└─────────────────────────────────────────┘
```

## Main Process Components

### TorrentEngine (`src/main/torrent.ts`)
- Manages WebTorrent client lifecycle
- Handles magnet links and .torrent files
- Selects appropriate video file automatically
- Creates HTTP streaming server
- Manages download priorities for streaming
- Sends status updates to renderer

### StorageManager (`src/main/storage.ts`)
- Creates temporary directory for downloads
- Monitors disk space usage
- Cleans up files on application exit
- Ensures proper resource management

### IPC Handlers (`src/main/ipc-handlers.ts`)
- Bridges renderer and main process communication
- Validates incoming requests
- Handles errors gracefully
- Uses Electron's contextBridge for security

## Renderer Process Components

### App (`src/renderer/App.tsx`)
- Root component managing application state
- Coordinates child components
- Handles IPC events from main process

### TorrentInput (`src/renderer/components/TorrentInput.tsx`)
- User input for magnet links
- Drag & drop for .torrent files
- File picker integration

### VideoPlayer (`src/renderer/components/VideoPlayer.tsx`)
- HTML5 video element
- Custom controls overlay
- Seek functionality with main process coordination
- Fullscreen support

### StatusBar (`src/renderer/components/StatusBar.tsx`)
- Download/upload speed display
- Progress tracking
- Peer count
- File information

## Data Flow

### Loading a Torrent

1. User enters magnet link or drops .torrent file
2. Renderer sends `torrent:load` IPC message
3. Main process:
   - Creates WebTorrent instance
   - Downloads metadata
   - Selects video file
   - Starts HTTP server
   - Sends video URL back to renderer
4. Renderer receives URL and loads video
5. Main process sends status updates every second

### Video Playback

1. Video element connects to `http://localhost:PORT/video.mp4`
2. HTTP Range requests are sent for video chunks
3. WebTorrent prioritizes requested pieces
4. Video buffers and plays progressively

### Cleanup

1. User closes application
2. Main process:
   - Stops all torrents
   - Closes HTTP server
   - Deletes temporary directory
   - Exits cleanly

## Security

- **Context Isolation**: Renderer has no direct Node.js access
- **Preload Script**: Safe API exposed via contextBridge
- **Input Validation**: All IPC messages are validated
- **No Remote Module**: Uses secure IPC communication

## Performance Considerations

- **Piece Prioritization**: First pieces downloaded first for quick start
- **Temporary Storage**: Uses system temp directory
- **Memory Management**: WebTorrent handles buffering internally
- **Cleanup**: Aggressive cleanup on exit prevents orphaned files

## Testing Strategy

- **Unit Tests**: Business logic in isolation (TorrentEngine, StorageManager)
- **Integration Tests**: IPC communication and component interactions
- **Manual Tests**: End-to-end user workflows

## Future Enhancements

- Streaming optimization with seek prediction
- Multiple file selection
- Subtitle support
- Custom download paths
- Bandwidth controls

